import React from 'react';

/**
 * Neo Empire — Official Uploaded Brand Logo Asset
 *
 * Uses the exact original uploaded Neo Empire logo image without any modification or regeneration.
 * Primary production path: /assets/neo-empire-logo.jpg (copied into dist/assets/neo-empire-logo.jpg and /assets/neo-empire-logo.jpg).
 * Includes automatic fallback paths for root-directory static uploads so the logo never fails to load.
 */

export const NEO_EMPIRE_LOGO_SRC = '/assets/neo-empire-logo.jpg';

export const NEO_EMPIRE_LOGO_FALLBACK_PATHS: readonly string[] = [
  '/assets/neo-empire-logo.jpg',
  '/public/assets/neo-empire-logo.jpg',
  '/assets/aistudio/IMG_20261021_154120_338_9ea81c59.jpg',
  '/public/assets/aistudio/IMG_20261021_154120_338_9ea81c59.jpg',
  '/dist/assets/neo-empire-logo.jpg',
];

export const NEO_EMPIRE_LOGO_DATA_URI = NEO_EMPIRE_LOGO_SRC;

export function handleLogoImageError(e: React.SyntheticEvent<HTMLImageElement, Event>): void {
  const img = e.currentTarget;
  const currentStep = Number(img.dataset.logoFallbackStep || '0');
  const nextStep = currentStep + 1;

  if (nextStep < NEO_EMPIRE_LOGO_FALLBACK_PATHS.length) {
    img.dataset.logoFallbackStep = String(nextStep);
    img.src = NEO_EMPIRE_LOGO_FALLBACK_PATHS[nextStep];
  }
}
