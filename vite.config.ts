import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Unwraps CSS @layer blocks in emitted production CSS bundles so older Android
 * mobile browsers and WebViews apply all Tailwind v4 utility rules reliably.
 */
function unwrapCssLayers(css: string): string {
  let result = css.replace(/@layer\s+[^{;]+;/g, '');

  while (true) {
    const match = result.match(/@layer\s+[^{]+\{/);
    if (!match || match.index === undefined) break;

    const startIdx = match.index;
    const openBraceIdx = startIdx + match[0].length - 1;
    let depth = 1;
    let i = openBraceIdx + 1;

    while (i < result.length && depth > 0) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') depth--;
      i++;
    }

    if (depth === 0) {
      const innerContent = result.slice(openBraceIdx + 1, i - 1);
      result = result.slice(0, startIdx) + innerContent + result.slice(i);
    } else {
      break;
    }
  }

  return result;
}

function androidCssLayerCompatibilityPlugin(): Plugin {
  return {
    name: 'android-css-layer-compat',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = unwrapCssLayers(file.source);
        }
      }
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'build') {
    process.env.NODE_ENV = 'production';
  }

  return {
    base: '/',
    define:
      command === 'build'
        ? {
            'process.env.NODE_ENV': JSON.stringify('production'),
          }
        : undefined,
    plugins: [react(), tailwindcss(), androidCssLayerCompatibilityPlugin()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/storage',
      ],
    },
    build: {
      cssCodeSplit: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          admin: path.resolve(import.meta.dirname, 'admin.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
