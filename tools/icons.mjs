// Optional development tool: npm install --no-save sharp
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const root = resolve(import.meta.dirname, '..');
for (const size of [16, 32, 48, 128, 512]) {
  const output = size === 512 ? 'icon-master.png' : `icon-${size}.png`;
  await sharp(resolve(root, 'icons/icon.svg'), { density: 600 }).resize(size, size).png().toFile(resolve(root, 'icons', output));
  console.log(`icons/${output}`);
}
