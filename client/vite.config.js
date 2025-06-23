// client/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // This server block is for local development
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },

  // This build block is for production deployments on Render
  build: {
    rollupOptions: {
      output: {
        // This will create files like assets/index-a1b2c3d4.js
        // to force browsers to download the new version on each deploy.
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  }
})
