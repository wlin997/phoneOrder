// client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Set the root directory for Vite.
  // This tells Vite where your index.html file is located relative to this config file.
  // Since index.html is now in client/public/, and this config is in client/,
  // we set the root to 'public'.
  root: 'public', // This tells Vite to look for index.html inside the 'public' folder

  // This server block is for local development
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    },
    // Ensure the development server also serves from the correct root
    open: true, // Automatically open the browser (from previous suggestion)
  },

  // This build block is for production deployments on Render
  build: {
    // Ensure the output directory is relative to the project root (client/)
    // and not relative to the 'public' root defined above.
    outDir: '../dist', // This will place the build output in my-order-dashboard/dist

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
});
