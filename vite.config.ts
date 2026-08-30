import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function normalizeBase(value: string | undefined): string {
  if (!value || value === '/') {
    return '/';
  }

  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBase(env.VITE_BASE_PATH);

  return {
    base,
    plugins: [
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Period Tracker',
          short_name: 'Period',
          description: 'Track your cycle symptoms with offline support.',
          start_url: '.',
          scope: base,
          display: 'standalone',
          background_color: '#fff7fb',
          theme_color: '#db5a8c',
          orientation: 'portrait-primary',
          lang: 'en-US',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        },
        workbox: {
          navigateFallback: 'index.html',
          skipWaiting: false,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/script\.google\.com\/macros\/s\/.*$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'period-api',
                networkTimeoutSeconds: 8,
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 5
                }
              }
            }
          ]
        }
      })
    ]
  };
});
