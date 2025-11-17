
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
      minify: false, // Disable minification to test if conflicts are minification-related
      rollupOptions: {
        output: {
          // Temporarily disable ALL manual chunking to resolve variable conflicts
          // manualChunks: {
          //   // Vendor chunks
          //   'react-vendor': ['react', 'react-dom'],
          //   'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],
          //   'utils-vendor': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          //
          //   // Feature chunks
          //   'auth': ['./src/components/Login.tsx', './src/components/UserProfile.tsx'],
          //   'documents': ['./src/components/DocumentDashboard.tsx', './src/components/DocumentEditor.tsx'],
          //   'organizations': ['./src/components/OrganizationDashboard.tsx', './src/components/OrganizationManagement/OrganizationManagement.tsx'],
          //   'governance': ['./src/components/governance/GovernanceRulesDialog.tsx'],
          // }
        }
      },
      chunkSizeWarningLimit: 600, // Slightly higher than 500KB
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