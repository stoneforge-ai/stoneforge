import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiPort = process.env.VITE_API_PORT || '3456';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve @stoneforge/ui from TypeScript source so the dev server works
      // without building the UI package first. Previously used
      // resolve.conditions: ['bun'] for this, but that caused
      // @tanstack/router-core/isServer to resolve to server.js (isServer=true),
      // breaking client-side routing.
      '@stoneforge/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
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
    // Enable minification for production builds
    minify: 'esbuild',
    // Target modern browsers for better optimization
    target: 'es2020',
    // Split CSS into separate files
    cssCodeSplit: true,
    // Source maps for production debugging (can disable for smaller builds)
    sourcemap: false,
    // Manual chunk splitting for optimal caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Routing and state management
          'router-vendor': ['@tanstack/react-router', '@tanstack/react-query'],
          // UI component libraries
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
          ],
          // Editor dependencies (large bundle)
          // Note: @tiptap/pm has subpath exports and can't be chunked directly
          'editor-vendor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-bubble-menu',
            '@tiptap/extension-code-block-lowlight',
            '@tiptap/extension-document',
            '@tiptap/extension-highlight',
            '@tiptap/extension-horizontal-rule',
            '@tiptap/extension-image',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-text-align',
            '@tiptap/extension-underline',
            '@tiptap/suggestion',
            'lowlight',
            'marked',
            'turndown',
          ],
          // Charts and visualization
          'charts-vendor': ['recharts', '@xyflow/react', 'dagre'],
          // Drag and drop
          'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // Other utilities
          'utils-vendor': ['lucide-react', 'cmdk', 'sonner', 'emoji-picker-react'],
        },
      },
    },
    // Increase chunk size warning limit (we expect some large vendor chunks)
    chunkSizeWarningLimit: 1000,
  },
  // Optimize dependency pre-bundling for faster dev server starts
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'lucide-react',
    ],
  },
});
