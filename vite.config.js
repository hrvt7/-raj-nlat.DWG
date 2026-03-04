import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy PDF rendering library — only loaded when a PDF plan is opened
          if (id.includes('pdfjs-dist')) return 'vendor-pdf'
          // Heavy WebGL DXF viewer — only loaded when a DXF plan is opened
          if (id.includes('dxf-viewer')) return 'vendor-dxf'
          // Supabase SDK
          if (id.includes('@supabase')) return 'vendor-supabase'
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
})
