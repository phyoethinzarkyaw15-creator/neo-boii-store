import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { validateImageFileMeta } from '../utils/storeLogic';

export interface ImageUploadProgress {
  fileName: string;
  progress: number;
  status: 'compressing' | 'uploading' | 'completed' | 'error';
  error?: string;
}

/**
 * Compresses and optimizes an uploaded image using HTML5 Canvas so that:
 * 1. It uploads rapidly from Android mobile connections to Firebase Storage.
 * 2. It stays compact (< 90 KB) if used as an inline WebP reference in Firestore.
 */
export async function compressAndOptimizeImage(
  file: File,
  maxWidth = 880,
  maxHeight = 660,
  quality = 0.74
): Promise<{ dataUrl: string; blob: Blob; mimeType: string }> {
  const validation = validateImageFileMeta(file.name, file.type, file.size);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file from device.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Corrupted or unsupported image file.'));
      img.onload = () => {
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (targetWidth > maxWidth || targetHeight > maxHeight) {
          const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
          targetWidth = Math.round(targetWidth * ratio);
          targetHeight = Math.round(targetHeight * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser canvas context unavailable for image optimization.'));
          return;
        }

        // Fill subtle obsidian backdrop for transparent PNGs
        ctx.fillStyle = '#070709';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const outMime = 'image/webp';
        const dataUrl = canvas.toDataURL(outMime, quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to encode optimized image.'));
              return;
            }
            resolve({
              dataUrl,
              blob,
              mimeType: outMime,
            });
          },
          outMime,
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an optimized account image to Firebase Storage (or Cloudflare R2 if configured)
 * and returns the download URL/reference to store in the Firestore product document.
 */
export async function uploadAccountImage(
  file: File,
  productId: string,
  onProgress?: (progress: ImageUploadProgress) => void
): Promise<string> {
  onProgress?.({
    fileName: file.name,
    progress: 25,
    status: 'compressing',
  });

  const { dataUrl, blob, mimeType } = await compressAndOptimizeImage(file);

  onProgress?.({
    fileName: file.name,
    progress: 65,
    status: 'uploading',
  });

  const safeProductId = (productId || 'NEO-ACCOUNT').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeBaseName = (file.name || 'account')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);

  // 1. Try Firebase Storage upload when storage bucket is initialized
  if (storage) {
    try {
      const storagePath = `products/${safeProductId}/${Date.now()}_${safeBaseName}.webp`;
      const storageRef = ref(storage, storagePath);

      const downloadUrl = await Promise.race<string>([
        (async () => {
          const snapshot = await uploadBytes(storageRef, blob, {
            contentType: mimeType,
          });
          return await getDownloadURL(snapshot.ref);
        })(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Firebase Storage upload timed out')), 5500)
        ),
      ]);

      if (downloadUrl) {
        onProgress?.({
          fileName: file.name,
          progress: 100,
          status: 'completed',
        });
        return downloadUrl;
      }
    } catch (storageErr) {
      console.warn(
        'Firebase Storage direct upload unavailable, using optimized compact WebP reference:',
        storageErr
      );
    }
  }

  // 2. Optional Cloudflare R2 Worker upload if configured
  const configuredWorkerUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;
  const isRealWorkerConfigured =
    typeof configuredWorkerUrl === 'string' &&
    configuredWorkerUrl.startsWith('https://') &&
    !configuredWorkerUrl.includes('your-subdomain.workers.dev');

  if (isRealWorkerConfigured) {
    try {
      const response = await fetch(`${configuredWorkerUrl.replace(/\/$/, '')}/api/r2/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-Product-Id': safeProductId,
        },
        body: blob,
      });

      if (response.ok) {
        const result = (await response.json()) as { url?: string };
        if (result.url) {
          onProgress?.({
            fileName: file.name,
            progress: 100,
            status: 'completed',
          });
          return result.url;
        }
      }
    } catch (err) {
      console.warn('Cloudflare R2 Worker unreachable, using optimized WebP reference:', err);
    }
  }

  onProgress?.({
    fileName: file.name,
    progress: 100,
    status: 'completed',
  });

  return dataUrl;
}
