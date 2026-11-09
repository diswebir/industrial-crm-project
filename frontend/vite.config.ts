import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const backendTarget = process.env.VITE_API_URL || 'http://127.0.0.1:8000'

const apiProxy = {
  '/api': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/docs': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/storage': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/admin': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/livewire': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/css': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/fonts': {
    target: backendTarget,
    changeOrigin: true,
  },
  '/js/filament': {
    target: backendTarget,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy, host: true, port: 5173, allowedHosts: ['.e2b.app'] },
  preview: { proxy: apiProxy, host: true, port: 5173, allowedHosts: ['.e2b.app'] },
})
