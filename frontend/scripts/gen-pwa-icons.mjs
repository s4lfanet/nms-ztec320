import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const svg = readFileSync(join('public', 'favicon.svg'));
const out = 'public/pwa';

const sizes = [192, 512];
const bg = '#0f0a1e'; // dark bg matching app theme

for (const size of sizes) {
  // Regular icon
  await sharp(svg)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(join(out, `icon-${size}.png`));
  console.log(`Generated ${out}/icon-${size}.png`);

  // Maskable icon (with padding for safe zone)
  const padding = Math.round(size * 0.1);
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg }
  })
    .composite([{
      input: await sharp(svg).resize(size - padding * 2, size - padding * 2, { fit: 'contain', background: { r: 15, g: 10, b: 30, alpha: 0 } }).png().toBuffer(),
      top: padding,
      left: padding
    }])
    .png()
    .toFile(join(out, `maskable-${size}.png`));
  console.log(`Generated ${out}/maskable-${size}.png`);
}

// Apple touch icon (180x180)
await sharp(svg)
  .resize(180, 180, { fit: 'contain', background: bg })
  .png()
  .toFile(join(out, 'apple-touch-icon.png'));
console.log(`Generated ${out}/apple-touch-icon.png`);

// Favicon 192 for manifest
await sharp(svg)
  .resize(192, 192, { fit: 'contain', background: bg })
  .png()
  .toFile(join(out, 'favicon-192.png'));
console.log(`Generated ${out}/favicon-192.png`);

console.log('All PWA icons generated!');
