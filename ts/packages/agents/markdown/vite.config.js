import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: 'src/view/site',
  build: {
    outDir: '../../../dist/view/site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/view/site/index.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 5173
  }
})
