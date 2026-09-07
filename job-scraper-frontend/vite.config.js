import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In local dev the React app runs on :5173 and the API on :5000.
  // This proxy makes '/api' work in dev exactly like it does in production,
  // where Express serves both from one origin.
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
