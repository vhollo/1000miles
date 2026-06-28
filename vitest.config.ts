import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Engine + net tests are pure TypeScript (no Svelte components / no $app
// imports), so we deliberately avoid loading the SvelteKit Vite plugin. We do
// map the `$lib` alias so the net modules' imports resolve.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
