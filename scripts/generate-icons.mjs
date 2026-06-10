// Generates all PWA / favicon / Apple Touch icons from public/logo-source.svg
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const ICONS = resolve(PUBLIC, 'icons');
const SRC = resolve(PUBLIC, 'logo-source.svg');

if (!existsSync(ICONS)) mkdirSync(ICONS, { recursive: true });

const svg = readFileSync(SRC);

const sizes = [
  { file: 'icons/icon-72.png', size: 72 },
  { file: 'icons/icon-96.png', size: 96 },
  { file: 'icons/icon-128.png', size: 128 },
  { file: 'icons/icon-144.png', size: 144 },
  { file: 'icons/icon-152.png', size: 152 },
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-384.png', size: 384 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/apple-touch-icon.png', size: 180 },
  { file: 'icons/og-image.png', size: 512 },
];

async function generate() {
  for (const { file, size } of sizes) {
    await sharp(svg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(resolve(PUBLIC, file));
    console.log(`\u2713 ${file} (${size}x${size})`);
  }
  console.log('\nDone! Icons generated in public/icons/');
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
