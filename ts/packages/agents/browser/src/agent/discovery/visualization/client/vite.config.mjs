import { defineConfig } from 'vite';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

export default defineConfig({
  root: path.resolve(__dirname),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) return 'vendor';
        }
      }
    },
    sourcemap: isDev,
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    minify: !isDev,
  },
  server: {
    port: 3000,
    open: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname)
    }
  },
  esbuild: {
    target: 'es2020',
    legalComments: isDev ? 'inline' : 'none'
  }
});