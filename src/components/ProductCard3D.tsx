import React, { useState } from 'react';
import { Eye, ExternalLink, Ban } from 'lucide-react';
import { AccountStatus, PubgAccountProduct, TELEGRAM_BUY_URL } from '../types/store';
import { formatMmkPrice } from '../utils/storeLogic';

interface ProductCard3DProps {
  product: PubgAccountProduct;
  onViewDetails: (product: PubgAccountProduct) => void;
}

export const ProductCard3D: React.FC<ProductCard3DProps> = ({ product, onViewDetails }) => {
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [imgError, setImgError] = useState(false);

  const isAvailable = product.status === AccountStatus.AVAILABLE;
  const primaryImage = (product.mainImage || product.images[0] || '').trim();
  const hasRealImage = Boolean(primaryImage) && !imgError;
  const formattedMmk = formatMmkPrice(product.price);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    setTilt({
      rotateX: (0.5 - normY) * 6,
      rotateY: (normX - 0.5) * 7,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  return (
    <article
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        transform: `perspective(1100px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
        transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className={`group rounded-xl overflow-hidden flex flex-col justify-between neo-surface-card transition-all duration-200 ${
        isAvailable ? 'opacity-100' : 'opacity-75'
      }`}
    >
      <div>
        {/* 3D Framed Image Container */}
        <div className="p-3.5 pb-0">
          <div className="relative aspect-[4/3] w-full rounded-lg neo-frame-3d overflow-hidden">
            {hasRealImage ? (
              <>
                <img
                  src={primaryImage}
                  alt={product.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="font-display text-sm font-bold tracking-[0.2em] uppercase text-[#C5A059]">
                  NOT AVAILABLE
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  No account image uploaded
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clean Unboxed Metadata & Title */}
        <div className="p-4 sm:p-5 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
            <span className="text-[#E5C878]">{product.id}</span>
            <span aria-hidden="true">·</span>
            <span className={isAvailable ? 'text-[#F4F2ED] font-semibold' : 'text-zinc-500'}>
              {product.status}
            </span>
            <span aria-hidden="true">·</span>
            <span>{product.currency}</span>
          </div>

          <h3 className="font-display text-lg font-semibold text-[#F4F2ED] leading-snug line-clamp-2">
            {product.name}
          </h3>

          {product.description && (
            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>
      </div>

      {/* Price & Mobile Touch-Friendly Actions */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3.5 border-t border-white/[0.07] space-y-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Price
            </div>
            <div
              className={`font-mono text-xl font-bold tabular-nums ${
                isAvailable ? 'text-[#F4F2ED]' : 'text-zinc-500 line-through'
              }`}
            >
              {formattedMmk}
            </div>
          </div>
          {product.images.length > 1 && (
            <span className="text-xs font-mono text-zinc-400">
              {product.images.length} Images
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onViewDetails(product)}
            aria-label={`View Details for ${product.name}`}
            className="min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-[#14161D] hover:bg-[#1B1E28] text-[#F4F2ED] border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
            <span>View Details</span>
          </button>

          {isAvailable ? (
            <a
              href={TELEGRAM_BUY_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`BUY ACCOUNT ${product.name}`}
              className="min-h-[44px] gold-metallic-button px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>BUY ACCOUNT</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              aria-label={`SOLD OUT — ${product.name}`}
              className="min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 bg-[#121318] text-zinc-500 border border-white/[0.06] cursor-not-allowed whitespace-nowrap shrink-0"
            >
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <span>SOLD OUT</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
