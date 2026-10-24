import React, { useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ExternalLink,
  Ban,
} from 'lucide-react';
import {
  AccountStatus,
  PubgAccountProduct,
  TELEGRAM_BUY_URL,
  TELEGRAM_HANDLE,
} from '../types/store';
import { formatMmkPrice } from '../utils/storeLogic';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from '../utils/brandAssets';

interface AccountDetailModalProps {
  product: PubgAccountProduct | null;
  onClose: () => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({ product, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isLightbox, setIsLightbox] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  if (!product) return null;

  const validImages = (product.images || []).map((u) => u.trim()).filter(Boolean);
  if (validImages.length === 0 && product.mainImage && product.mainImage.trim()) {
    validImages.push(product.mainImage.trim());
  }

  const hasUploadedImages = validImages.length > 0;
  const safeIndex = activeIndex < validImages.length ? activeIndex : 0;
  const currentImage = hasUploadedImages ? validImages[safeIndex] : '';
  const isAvailable = product.status === AccountStatus.AVAILABLE;
  const formattedPrice = formatMmkPrice(product.price);

  const handlePrevImage = () => {
    if (!hasUploadedImages) return;
    setActiveIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
    setIsZoomed(false);
  };

  const handleNextImage = () => {
    if (!hasUploadedImages) return;
    setActiveIndex((prev) => (prev + 1) % validImages.length);
    setIsZoomed(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    if (isZoomed) {
      setZoomOrigin({
        x: Math.max(0, Math.min(100, normX * 100)),
        y: Math.max(0, Math.min(100, normY * 100)),
      });
    } else {
      setTilt({
        rotateX: (0.5 - normY) * 6,
        rotateY: (normX - 0.5) * 8,
      });
    }
  };

  const handlePointerLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 40 && validImages.length > 1) {
      if (deltaX < 0) {
        handleNextImage();
      } else {
        handlePrevImage();
      }
    }
    setTouchStartX(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      {/* Fullscreen Lightbox */}
      {isLightbox && hasUploadedImages && (
        <div className="fixed inset-0 z-60 bg-[#08080A]/95 flex flex-col justify-between p-4 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-300">
              <span className="text-[#E5C878]">{product.id}</span>
              <span aria-hidden="true">·</span>
              <span>
                {safeIndex + 1} / {validImages.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-sm font-semibold text-white">{product.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsZoomed((z) => !z)}
                className="px-3 py-2 rounded-lg bg-[#14161D] border border-white/10 text-xs font-medium text-white hover:border-[#C5A059] flex items-center gap-1.5 cursor-pointer"
              >
                {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                <span>{isZoomed ? 'Reset Zoom' : 'Zoom'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLightbox(false)}
                aria-label="Exit Lightbox"
                className="px-3 py-2 rounded-lg gold-metallic-button text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>
          </div>

          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative flex-1 my-4 flex items-center justify-center overflow-hidden rounded-xl neo-frame-3d"
          >
            <img
              src={currentImage}
              alt={`${product.name} view ${safeIndex + 1}`}
              referrerPolicy="no-referrer"
              style={{
                transform: isZoomed ? 'scale(1.85)' : 'scale(1)',
                transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                transition: 'transform 180ms ease-out',
              }}
              className="max-h-[76vh] w-auto object-contain select-none"
            />
            {validImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  aria-label="Previous Image"
                  className="absolute left-4 p-2.5 rounded-lg bg-black/80 text-white border border-white/15 hover:border-[#C5A059] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  aria-label="Next Image"
                  className="absolute right-4 p-2.5 rounded-lg bg-black/80 text-white border border-white/15 hover:border-[#C5A059] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Details Modal */}
      <div className="relative w-full max-w-[1120px] max-h-[92vh] overflow-y-auto rounded-xl neo-surface-card">
        {/* Top Modal Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 px-5 sm:px-7 py-4 bg-[#0D0E12]/95 backdrop-blur-md border-b border-white/[0.08]">
          <div className="flex items-center gap-3 text-xs font-mono">
            <img
              src={NEO_EMPIRE_LOGO_SRC}
              alt="Neo Empire Logo"
              width={28}
              height={28}
              onError={handleLogoImageError}
              className="neo-brand-logo-icon"
              style={{
                width: '28px',
                height: '28px',
                minWidth: '28px',
                maxWidth: '28px',
                maxHeight: '28px',
                objectFit: 'contain',
                borderRadius: '6px',
              }}
            />
            <span className="text-[#E5C878]">{product.id}</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span className={isAvailable ? 'text-[#F4F2ED] font-semibold' : 'text-zinc-500'}>
              {product.status}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Details"
            className="p-2 rounded-lg bg-[#14161D] hover:bg-[#1C1F29] text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Split */}
        <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): 3D Image Frame & Gallery */}
          <div className="lg:col-span-7 space-y-4">
            <div className="perspective-stage">
              <div
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{
                  transform: isZoomed
                    ? 'none'
                    : `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
                  transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                className="relative aspect-[4/3] w-full rounded-xl overflow-hidden neo-frame-3d"
              >
                {hasUploadedImages ? (
                  <>
                    <img
                      src={currentImage}
                      alt={`${product.name} — Image ${safeIndex + 1}`}
                      referrerPolicy="no-referrer"
                      onClick={() => setIsZoomed((z) => !z)}
                      style={{
                        transform: isZoomed ? 'scale(1.85)' : 'scale(1)',
                        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                        transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      className={`w-full h-full object-cover select-none ${
                        isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                      }`}
                    />

                    {/* Zoom & Lightbox Controls */}
                    <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                      <button
                        type="button"
                        onClick={() => setIsZoomed((z) => !z)}
                        aria-label={isZoomed ? 'Zoom Out Image' : 'Zoom In Image'}
                        className="px-2.5 py-1.5 rounded-md bg-black/80 hover:bg-black text-xs font-medium text-white border border-white/15 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isZoomed ? (
                          <ZoomOut className="w-3.5 h-3.5 text-[#C5A059]" />
                        ) : (
                          <ZoomIn className="w-3.5 h-3.5 text-[#C5A059]" />
                        )}
                        <span>{isZoomed ? '1x' : 'Zoom'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLightbox(true)}
                        aria-label="Open Fullscreen Lightbox"
                        className="px-2.5 py-1.5 rounded-md bg-black/80 hover:bg-black text-xs font-medium text-white border border-white/15 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Maximize2 className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Fullscreen</span>
                      </button>
                    </div>

                    {validImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrevImage}
                          aria-label="Previous Account Image"
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-black/80 text-white border border-white/15 hover:border-[#C5A059] transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextImage}
                          aria-label="Next Account Image"
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-black/80 text-white border border-white/15 hover:border-[#C5A059] transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center select-none">
                    <div className="font-display text-base font-bold tracking-[0.22em] uppercase text-[#C5A059]">
                      NOT AVAILABLE
                    </div>
                    <p className="text-xs text-zinc-500 mt-1.5">
                      No images have been uploaded for this account yet.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Thumbnail Strip */}
            {validImages.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {validImages.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveIndex(idx);
                      setIsZoomed(false);
                    }}
                    aria-label={`Select Account Image ${idx + 1}`}
                    className={`relative w-20 aspect-[4/3] rounded-lg overflow-hidden shrink-0 border transition-all cursor-pointer ${
                      idx === safeIndex
                        ? 'border-[#C5A059] opacity-100'
                        : 'border-white/10 opacity-55 hover:opacity-90'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column (5 cols): Contiguous Purchase & Specification Module */}
          <div className="lg:col-span-5 space-y-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1.5">
                <span>ID: {product.id}</span>
                <span aria-hidden="true">·</span>
                <span>{product.currency}</span>
                <span aria-hidden="true">·</span>
                <span className={isAvailable ? 'text-[#E5C878] font-semibold' : 'text-zinc-500'}>
                  {product.status}
                </span>
              </div>

              <h2
                id="account-detail-title"
                className="font-display text-xl sm:text-2xl font-bold text-[#F4F2ED] leading-tight"
              >
                {product.name}
              </h2>
            </div>

            {/* Price in MMK */}
            <div className="py-3.5 border-y border-white/[0.08] flex items-baseline justify-between gap-4">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Price (MMK)
              </span>
              <span className="font-mono text-2xl font-bold text-[#F4F2ED] tabular-nums">
                {formattedPrice}
              </span>
            </div>

            {/* Primary BUY ACCOUNT Action */}
            <div className="space-y-2">
              {isAvailable ? (
                <a
                  href={TELEGRAM_BUY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-5 rounded-lg text-xs sm:text-sm font-bold tracking-[0.12em] uppercase gold-metallic-button flex items-center justify-center gap-2"
                >
                  <span>BUY ACCOUNT</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 px-5 rounded-lg text-xs sm:text-sm font-mono font-semibold tracking-wider bg-[#14161D] text-zinc-500 border border-white/[0.07] flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Ban className="w-4 h-4" />
                  <span>SOLD OUT</span>
                </button>
              )}

              <p className="text-xs text-zinc-400 text-center font-mono">
                {isAvailable
                  ? `Direct Telegram purchase via ${TELEGRAM_HANDLE}`
                  : 'This account is currently sold out.'}
              </p>
            </div>

            {/* Description */}
            {product.description && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#C5A059]">
                  Description
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Features */}
            {product.features && product.features.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#C5A059]">
                  Account Highlights
                </h3>
                <ul className="space-y-1.5 text-xs sm:text-sm text-zinc-300">
                  {product.features.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#C5A059] font-mono">·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Important Notes */}
            {product.importantNotes && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  Important Notes
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{product.importantNotes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
