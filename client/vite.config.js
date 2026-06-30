import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // Evita blob workers de workbox en desarrollo
      },
      includeAssets: ['logo-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'AIO Presenter',
        short_name: 'AIO Presenter',
        description: 'Proyección de letras y Biblias para iglesias',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        // start_url: '/app' → ControllerPage redirige a /mobile en teléfonos
        // y permanece en /app en escritorio. Un solo manifest para ambos.
        start_url: '/app',
        scope: '/',
        icons: [
          {
            src: '/logo-icon.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Shortcuts: acceso rápido desde el ícono instalado
        shortcuts: [
          {
            name: 'Controlador',
            short_name: 'Controlador',
            description: 'Abre el controlador de presentación',
            url: '/app',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Control Móvil',
            short_name: 'Móvil',
            description: 'Abre el control remoto móvil',
            url: '/mobile',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
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
            // Función en lugar de regex para que funcione con URL completa (https://...)
            urlPattern: ({ url }) => url.pathname.startsWith('/local-media/'),
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
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/paypal': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Socket.io se conecta directamente al backend via window.location.hostname:3001
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Librerías React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Socket.io cliente
          'vendor-socket': ['socket.io-client'],
          // Iconos
          'vendor-icons': ['lucide-react'],
          // Utilidades QR
          'vendor-misc': ['axios', 'qrcode.react'],
        },
      },
    },
  },
});
