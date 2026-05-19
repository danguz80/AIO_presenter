import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AIO Presenter Remote',
        short_name: 'AIO Remote',
        description: 'Control remoto para AIO Presenter',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/mobile',
        scope: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // No hacer caché de /api (necesita red)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/local-media/],
        // Handler para archivos de media local (FSA → Cache API → OutputPage)
        runtimeCaching: [
          {
            urlPattern: /^\/local-media\//,
            handler: 'CacheOnly',
            options: {
              cacheName: 'aio-local-media',
              // Sin expiración — se limpia manualmente desde la app
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // exponer en la red local para acceso desde móvil
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Socket.io se conecta directamente al backend via window.location.hostname:3001
    },
  },
});
