import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Keep provider keys out of browser CORS trouble: Vite proxies locally;
    // production uses the matching serverless proxy.
    proxy: {
      '/orcarouter-api': {
        target: 'https://api.orcarouter.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/orcarouter-api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
