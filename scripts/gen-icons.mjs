// Rasterize the SVG app icon into the PNG sizes a PWA needs.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'static', 'icons');
const svg = readFileSync(join(iconsDir, 'icon.svg'));

const targets = [
	{ size: 192, file: 'icon-192.png' },
	{ size: 512, file: 'icon-512.png' },
	{ size: 512, file: 'icon-maskable-512.png' },
	{ size: 180, file: 'apple-touch-icon.png' }
];

for (const { size, file } of targets) {
	await sharp(svg, { density: 512 })
		.resize(size, size)
		.png()
		.toFile(join(iconsDir, file));
	console.log(`✓ ${file} (${size}×${size})`);
}
