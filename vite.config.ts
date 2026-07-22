/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'quais': ['quais'],
          'tanstack': ['@tanstack/react-query'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'quais', '@tanstack/react-query'],
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // jsdom defaults to an opaque origin ("about:blank"), under which the Storage API
    // is unavailable and `localStorage` is undefined. Several modules persist state
    // there (launch pipeline, wizard form, TxTracker), so give it a real origin.
    environmentOptions: {
      jsdom: { url: 'https://app.daoships.org' },
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
