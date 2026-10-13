/* global process */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // PORT lets a second dev server run alongside the default one.
  server: { port: Number(process.env.PORT) || 5173 },
})
