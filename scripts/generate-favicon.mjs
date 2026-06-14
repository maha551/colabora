import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../client/public');
const { default: pngToIco } = await import('png-to-ico');

const buf = await pngToIco([
  join(publicDir, 'favicon-16x16.png'),
  join(publicDir, 'favicon-32x32.png'),
]);
writeFileSync(join(publicDir, 'favicon.ico'), buf);
console.log(`Wrote favicon.ico (${buf.length} bytes)`);
