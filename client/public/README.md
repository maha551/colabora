# Public Assets Directory

Static assets served at the root path by Vite.

## App logos

- `logo-light.png` — light theme (from `assets/colabora logo1.png`)
- `logo-dark.png` — dark theme (from `assets/colabora logo2.png`)

## Favicons

- `favicon.ico` — multi-size ICO (16×16 + 32×32, light)
- `favicon-16x16.png` / `favicon-32x32.png` — light theme
- `favicon-dark-16x16.png` / `favicon-dark-32x32.png` — dark theme
- `apple-touch-icon.png` — iOS home screen (180×180)

Regenerate `favicon.ico` after updating PNGs:

```bash
node scripts/generate-favicon.mjs
```

## Notes

- Files in this directory are served at `/` (e.g. `/logo-light.png`)
- Vite copies `public/` to the build output without processing
