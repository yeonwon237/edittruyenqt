import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // STALI does not expose browser CORS headers. In local development Vite
    // forwards the request server-side; production uses /api/stali-chat.
    proxy: {
      '/stali-api': {
        target: 'https://api.stali.vn',
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/stali-api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
