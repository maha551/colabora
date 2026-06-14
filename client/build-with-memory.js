// Simple build script with increased memory limit
process.env.NODE_OPTIONS = '--max-old-space-size=8192';

// Spawn vite build process
const { spawn } = require('child_process');
const path = require('path');

const viteJs = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn(process.execPath, [viteJs, 'build'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
});

child.on('error', (err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

