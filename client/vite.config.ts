  import { defineConfig, loadEnv, type Plugin } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';
  import { execSync } from 'node:child_process';

  function resolveBuildEnv(cwd: string) {
    let gitSha = process.env.VITE_GIT_SHA || process.env.GIT_SHA || '';
    if (!gitSha) {
      try {
        gitSha = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();
      } catch {
        gitSha = 'dev';
      }
    } else {
      gitSha = gitSha.slice(0, 7);
    }

    const buildTime = process.env.VITE_BUILD_TIME || process.env.BUILD_TIME || '';

    return { gitSha, buildTime };
  }

  // Custom plugin to reorder CSS before scripts in HTML head (fixes FOUC)
  function cssBeforeScriptsPlugin(): Plugin {
    return {
      name: 'css-before-scripts',
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          // Only transform in production builds (when server is undefined)
          if (context.server) {
            return html; // Development mode - no transformation needed
          }

          // Simple regex to swap script and CSS link if script comes first
          // Match: script tag (self-closing or with closing tag), optional whitespace/newlines, then CSS link
          // Handle both <script ... /> and <script ...></script> patterns
          const swapPattern = /(<script[^>]*type\s*=\s*["']module["'][^>]*(?:\/>|><\/script>))[\s\S]*?(<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>)/i;
          
          const match = html.match(swapPattern);
          if (match && match.index !== undefined) {
            // Swap them: CSS first, then script
            return html.replace(swapPattern, '$2\n      $1');
          }

          return html; // No swap needed or pattern didn't match
        },
      },
    };
  }

  export default defineConfig(async ({ mode }) => {
    const rootDir = path.resolve(__dirname, '..');
    const env = loadEnv(mode, rootDir, '');
    const buildEnv = resolveBuildEnv(rootDir);
    const apiPort = env.PORT || '3080';
    const apiTarget = `http://127.0.0.1:${apiPort}`;

    const tailwindcss = (await import('@tailwindcss/vite')).default;
    return {
    plugins: [
      tailwindcss(),
      react(),
      cssBeforeScriptsPlugin(),
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        'class-variance-authority': 'class-variance-authority',
      },
      dedupe: ['react', 'react-dom'], // Ensure single React instance
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
    },
    // Vite automatically replaces import.meta.env at build time
    // No need for define config - Vite handles this during transform phase
    // This ensures import.meta.env is replaced before code is bundled into chunks
    define: {
      'import.meta.env.VITE_GIT_SHA': JSON.stringify(buildEnv.gitSha),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildEnv.buildTime),
    },
    build: {
      target: 'esnext',
      outDir: 'build',
      sourcemap: true, // Production source maps for debugging stack traces (e.g. from fly.dev)
      minify: 'terser', // Re-enabled after fixing TDZ errors (circular dependency and function order)
      terserOptions: {
        compress: {
          // Ensure terser doesn't introduce const/let bindings that could cause TDZ errors
          keep_fnames: false,
          // Limit optimization passes to prevent code reordering that could cause TDZ issues
          passes: 1,
        },
        format: {
          // Remove comments to reduce bundle size
          comments: false,
          // Use var instead of const/let to avoid TDZ errors (Safari 10 compatibility mode)
          safari10: true,
        },
        // Keep modern ECMAScript features but let Rollup's constBindings: false handle var conversion
        ecma: 2020,
      },
      // Disable automatic code splitting to force single bundle
      // This eliminates circular dependency issues between chunks
      cssCodeSplit: false, // Keep CSS in one file too
      rollupOptions: {
        // Preserve entry signatures to maintain initialization order
        // 'strict' mode ensures complete preservation of module initialization order
        // This is the most conservative setting to prevent TDZ errors
        preserveEntrySignatures: 'strict',
        // Detect and log circular dependencies during build
        onwarn(warning, warn) {
          // Log circular dependency warnings to help identify TDZ issues
          if (warning.code === 'CIRCULAR_DEPENDENCY') {
            console.warn('⚠️ Circular dependency detected:', warning.message);
            if (warning.ids) {
              console.warn('   Affected modules:', warning.ids);
            }
          }
          // Use default warning handler for other warnings
          warn(warning);
        },
        output: {
          // Single bundle approach - force everything into entry bundle
          entryFileNames: 'assets/index-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          format: 'es',
          // Force all dynamic imports to be inlined into the entry bundle
          // This prevents Vite from creating separate chunks for large dependencies
          inlineDynamicImports: true,
          // Disable manual chunking - everything goes into entry bundle
          manualChunks: undefined,
          // Ensure proper hoisting to prevent TDZ errors
          hoistTransitiveImports: true,
          // Use var instead of const for generated code to avoid TDZ issues
          // var declarations are hoisted and don't have temporal dead zone restrictions
          generatedCode: {
            constBindings: false,
            // Use var for all variable declarations
            arrowFunctions: false,
            // Preserve function declarations to avoid hoisting issues
            objectShorthand: false,
          }
        },
      },
      // Increase chunk size limit to allow single large bundle
      // This prevents Vite from automatically splitting into multiple chunks
      chunkSizeWarningLimit: 10000, // 10MB limit to allow single bundle
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      // Ensure proper module resolution to prevent circular dependencies
      modulePreload: {
        polyfill: true,
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      open: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          timeout: 10000,
          // Ensure CORS headers are passed through
          configure: (proxy, _options) => {
            // Handle proxy errors (backend server not running)
            proxy.on('error', (err, req, res) => {
              console.error('[Vite Proxy] Error proxying request:', {
                url: req.url,
                method: req.method,
                error: err.message,
                code: (err as NodeJS.ErrnoException).code
              });
              
              if (res && !res.headersSent) {
                // Set CORS headers for error response
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
                
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({
                  error: 'Backend server unavailable',
                  message: 'The backend server is not running. Please start it with: npm run dev',
                  details: err.message,
                  code: (err as NodeJS.ErrnoException).code || 'ECONNREFUSED',
                  suggestion: `Make sure the backend server is running (see root .env PORT, default ${apiPort})`
                }));
              }
            });
            
            // Log proxy requests for debugging (only in development)
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              if (process.env.VITE_DEBUG_PROXY === 'true') {
                console.log(`[Vite Proxy] ${req.method} ${req.url} -> ${apiTarget}${req.url}`);
              }
            });
            
            // Log successful proxy responses for debugging
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              if (process.env.VITE_DEBUG_PROXY === 'true') {
                console.log(`[Vite Proxy] ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
              }
            });
          },
        },
      },
    },
  };
  });