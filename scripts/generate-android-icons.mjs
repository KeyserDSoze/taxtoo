// Generates Android launcher icons from public/icons/icon-512.png into the Capacitor android project.
import sharp from 'sharp';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../public/icons/icon-512.png');
const base = path.join(__dirname, '../android/app/src/main/res');

if (!existsSync(base)) {
  console.error('Android project not found. Run "npx cap add android" first.');
  process.exit(1);
}

const regular = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const foreground = [
  { dir: 'mipmap-mdpi', canvas: 108, icon: 72 },
  { dir: 'mipmap-hdpi', canvas: 162, icon: 108 },
  { dir: 'mipmap-xhdpi', canvas: 216, icon: 144 },
  { dir: 'mipmap-xxhdpi', canvas: 324, icon: 216 },
  { dir: 'mipmap-xxxhdpi', canvas: 432, icon: 288 },
];

for (const { dir, size } of regular) {
  const dest = path.join(base, dir);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  await sharp(src)
    .resize(size, size, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(dest, 'ic_launcher.png'));

  const circle = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
  );
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: '#ffffff' })
    .composite([{ input: circle, blend: 'dest-in' }])
    .png()
    .toFile(path.join(dest, 'ic_launcher_round.png'));

  console.log(`Generated ${dir} (${size}x${size})`);
}

for (const { dir, canvas, icon } of foreground) {
  const dest = path.join(base, dir);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  const resized = await sharp(src)
    .resize(icon, icon, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(path.join(dest, 'ic_launcher_foreground.png'));

  console.log(`Generated foreground ${dir} (${canvas}x${canvas})`);
}

console.log('All Android icons generated successfully.');
