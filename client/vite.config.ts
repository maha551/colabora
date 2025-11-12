
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        'class-variance-authority': 'class-variance-authority',
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash]-[ext]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
    server: {
      port: 3001,
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  });