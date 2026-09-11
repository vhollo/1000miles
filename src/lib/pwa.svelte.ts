import { browser, dev } from '$app/environment';
import { base } from '$app/paths';

/** How often a long-running (installed) app re-checks the server for a new build. */
const CHECK_INTERVAL = 15 * 60_000;
/** How long the "updating" notice stays up before the reload, so it can be read. */
const NOTICE_MS = 1200;
/** Retry cadence while `deferSwap` is holding the swap off. */
const RETRY_MS = 20_000;

/**
 * Keeps an installed PWA up to date, by itself.
 *
 * SvelteKit's built-in registration only looks for a new service worker on a
 * full page load — which an installed app may not do for days. So we register
 * ourselves and poll: on start-up, whenever the app comes back to the
 * foreground, and on a timer. A new build is downloaded in the background and
 * then applied without asking; the UI only says that it is happening.
 */
class PwaUpdater {
	/** True from the moment we commit to the swap until the page reloads. */
	updating = $state(false);
	/** Set by the app to hold the swap off for now (e.g. during an online game). */
	deferSwap: () => boolean = () => false;

	#reg: ServiceWorkerRegistration | null = null;
	#ready = false;
	#reloading = false;
	#retry: ReturnType<typeof setTimeout> | null = null;

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
			this.#swap();
		});
		setInterval(() => this.check(), CHECK_INTERVAL);
		this.check();
	}

	/** Ask the server whether a newer build exists. */
	check(): void {
		this.#reg?.update().catch(() => {});
	}

	/** Take the new build: announce it if anyone is looking, then reload onto it. */
	#swap(): void {
		if (!this.#ready || this.#reloading || this.updating) return;

		if (this.deferSwap()) {
			// Not a good moment (mid online game) — come back to it shortly.
			this.#retry ??= setTimeout(() => {
				this.#retry = null;
				this.#swap();
			}, RETRY_MS);
			return;
		}
		if (this.#retry) {
			clearTimeout(this.#retry);
			this.#retry = null;
		}

		// Backgrounded: nothing to announce, just swap before the user returns.
		if (document.visibilityState !== 'visible') {
			this.#activate();
			return;
		}
		this.updating = true;
		setTimeout(() => this.#activate(), NOTICE_MS);
	}

	/** Let the waiting worker take over; `controllerchange` then reloads us. */
	#activate(): void {
		this.#reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
	}

	/** Note a new build once `worker` is installed — but only if it replaces a live one. */
	#watch(worker: ServiceWorker | null): void {
		if (!worker) return;
		// No controller means this is the very first install, not an update.
		const done = () => {
			if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
			this.#ready = true;
			this.#swap();
		};
		worker.addEventListener('statechange', done);
		done();
	}
}

export const pwa = new PwaUpdater();
