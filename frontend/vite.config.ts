import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /shiki/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['solid-js', 'marked', 'dompurify'],
          'monaco-editor': ['monaco-editor'],
          'babylonjs': ['babylonjs'],
        },
      },
    },
  },
  resolve: {
    alias: {
      'monaco-editor': path.resolve(__dirname, 'node_modules/monaco-editor'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (p) => p,
      },
      '/gateway': {
        target: 'http://192.168.1.141:8642',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gateway/, ''),
      },
      // Dynamic gateway proxy — routes through backend which reads
      // X-Hermes-Profile header and proxies to the correct profile's gateway.
      '/gp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/hermes-api': {
        target: 'http://localhost:9119',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/hermes-api/, '/api'),
      },
      '/terminal': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
