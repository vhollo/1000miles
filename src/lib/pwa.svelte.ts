import { browser, dev } from '$app/environment';
import { base } from '$app/paths';

/** How often a long-running (installed) app re-checks the server for a new build. */
const CHECK_INTERVAL = 15 * 60_000;

/**
 * Keeps an installed PWA up to date.
 *
 * SvelteKit's built-in registration only looks for a new service worker on a
 * full page load — which an installed app may not do for days. So we register
 * ourselves and poll: on start-up, whenever the app comes back to the
 * foreground, and on a timer. A new build is downloaded in the background;
 * `ready` then turns true so the UI can offer (or silently take) the swap.
 */
class PwaUpdater {
	/** A new build is downloaded and waiting to take over. */
	ready = $state(false);
	/** Set by the app to veto the silent background swap (e.g. during an online game). */
	deferSwap: () => boolean = () => false;

	#reg: ServiceWorkerRegistration | null = null;
	#reloading = false;

	/** Register the worker and start watching for new versions. Call once. */
	async start(): Promise<void> {
		if (!browser || dev || !('serviceWorker' in navigator)) return;

		// The new worker claims the page as soon as it activates; reload so the
		// running tab is actually on the new build.
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (this.#reloading) return;
			this.#reloading = true;
			location.reload();
		});

		try {
			this.#reg = await navigator.serviceWorker.register(`${base}/service-worker.js`);
		} catch {
			return; // no service worker (private mode, unsupported browser) — the app still works
		}

		const reg = this.#reg;
		this.#watch(reg.waiting); // an update installed during an earlier visit
		reg.addEventListener('updatefound', () => this.#watch(reg.installing));

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') this.check();
			else if (this.ready && !this.deferSwap()) this.apply(); // backgrounded: swap invisibly
		});
		setInterval(() => this.check(), CHECK_INTERVAL);
		this.check();
	}

	/** Ask the server whether a newer build exists. */
	check(): void {
		this.#reg?.update().catch(() => {});
	}

	/** Activate the waiting build and reload onto it. */
	apply(): void {
		const waiting = this.#reg?.waiting;
		if (!waiting) return;
		waiting.postMessage({ type: 'SKIP_WAITING' });
	}

	/** Flag `ready` once `worker` is installed — but only if it replaces a live build. */
	#watch(worker: ServiceWorker | null): void {
		if (!worker) return;
		if (worker.state === 'installed' && navigator.serviceWorker.controller) {
			this.ready = true;
			return;
		}
		worker.addEventListener('statechange', () => {
			// No controller means this is the very first install, not an update.
			if (worker.state === 'installed' && navigator.serviceWorker.controller) this.ready = true;
		});
	}
}

export const pwa = new PwaUpdater();
