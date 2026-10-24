import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from '../utils/brandAssets';

interface Hero3DProps {
  onEnterStore: () => void;
}

export const Hero3D: React.FC<Hero3DProps> = ({ onEnterStore }) => {
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    setTilt({
      rotateX: (0.5 - normY) * 6,
      rotateY: (normX - 0.5) * 8,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  return (
    <section className="relative border-b border-white/[0.07] bg-[#08080A]">
      {/* Restrained warm metallic highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(197,160,89,0.11),transparent_55%)]"
      />

      <div className="relative max-w-[1240px] mx-auto px-4 sm:px-8 py-10 sm:py-14 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Brand Identity & Enter Store */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#C5A059]">
              NEO EMPIRE · PUBG ACCOUNT STORE
            </div>

            <h1
              className="font-display font-bold tracking-[0.1em] sm:tracking-[0.12em] uppercase gold-embossed-heading leading-[1.08]"
              style={{ fontSize: 'clamp(2rem, 6.5vw, 3.75rem)', textWrap: 'balance' }}
            >
              NEO EMPIRE
            </h1>

            <p className="text-zinc-300 text-sm sm:text-lg leading-relaxed max-w-[56ch]">
              Curated PUBG accounts with transparent Myanmar Kyat (MMK) pricing and direct account
              transfer through @Littleneoo.
            </p>

            <div className="pt-1 sm:pt-2">
              <button
                type="button"
                onClick={onEnterStore}
                className="w-full sm:w-auto min-h-[48px] gold-metallic-button px-7 py-3.5 rounded-lg text-sm font-bold tracking-[0.14em] uppercase inline-flex items-center justify-center gap-3 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>ENTER STORE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Original Uploaded Neo Empire Logo in 3D Frame */}
          <div className="lg:col-span-5 perspective-stage">
            <div
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              style={{
                transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
                transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="preserve-3d rounded-xl p-4 sm:p-6 neo-surface-card"
            >
              <div className="neo-frame-3d rounded-lg p-5 sm:p-8 flex flex-col items-center justify-center text-center">
                <img
                  src={NEO_EMPIRE_LOGO_SRC}
                  alt="Neo Empire Logo"
                  width={176}
                  height={176}
                  onError={handleLogoImageError}
                  className="neo-hero-logo-showcase"
                  style={{
                    width: '176px',
                    height: '176px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: '12px',
                  }}
                />
                <div className="mt-4 sm:mt-5 font-display text-base sm:text-lg font-bold tracking-[0.16em] sm:tracking-[0.18em] uppercase gold-embossed-heading">
                  NEO EMPIRE
                </div>
                <div className="mt-1 text-[11px] sm:text-xs font-mono tracking-[0.14em] sm:tracking-[0.16em] uppercase text-zinc-400">
                  OFFICIAL STOREFRONT · MMK
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
