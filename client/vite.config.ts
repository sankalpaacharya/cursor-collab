import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend URL is read at runtime from VITE_SERVER_URL (see .env.example).
// In dev we also proxy /socket.io to the backend so the app works without any
// CORS configuration when both run on localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: process.env.VITE_SERVER_URL ?? 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
