import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow tests to override the API port via VITE_API_PORT env var
const apiPort = process.env.VITE_API_PORT || '3457';

export default defineConfig({
  plugins: [react()],
  test: {
    // Exclude Playwright E2E tests from Vitest unit test runs
    exclude: [
      '**/node_modules/**',
      '**/tests/**', // Playwright E2E tests
    ],
    // Include unit tests in src/ directories
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      // Resolve @stoneforge/ui from TypeScript source so the dev server works
      // without building the UI package first. Previously used
      // resolve.conditions: ['bun'] for this, but that caused
      // @tanstack/router-core/isServer to resolve to server.js (isServer=true),
      // breaking client-side routing with "Cannot read properties of undefined
      // (reading 'state')" in useRouterState.
      '@stoneforge/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5174, // Different port from main web app (5173)
    proxy: {
      // All API routes go to orchestrator server (includes shared collaborate routes)
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, '../../packages/smithy/web'),
    emptyOutDir: true,
    minify: false,
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'router-vendor': ['@tanstack/react-router', '@tanstack/react-query'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-alert-dialog',
          ],
          'utils-vendor': ['lucide-react', 'cmdk', 'sonner'],
          // Monaco editor in a separate chunk for better caching
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
    chunkSizeWarningLimit: 1500, // Increased for monaco chunks
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-query',
      'lucide-react',
      'react-resizable-panels',
    ],
  },
});
