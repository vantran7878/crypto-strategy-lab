import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Production proxy config — forward API calls to the NestJS backend.
  // In production, Vercel serves static files (dist/) and forwards /api/* to the Render.com API.
  server: {
    port: Number(process.env.PORT || 5173),
    host: 'localhost',
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Socket.IO handshake — proxied so the frontend can connect via same-origin.
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },

  // Production build optimizations
  build: {
    outDir: 'dist',
    sourcemap: !!process.env.SOURCEMAP,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'socket': ['socket.io-client'],
        },
      },
    },
  },

  // Disable CSS minification for faster local dev reloads
  css: {
    devSourcemap: false,
  },
})
