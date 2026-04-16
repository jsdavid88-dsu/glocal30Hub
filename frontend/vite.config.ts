import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    allowedHosts: ['.trycloudflare.com', '.ts.net', '.ngrok-free.app'],
    fs: {
      allow: ['..'],
      strict: false,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.playwright-mcp/**', '**/node_modules/**'],
    },
  },
})
