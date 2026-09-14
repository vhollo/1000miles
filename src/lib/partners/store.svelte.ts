import { browser } from '$app/environment';
import { mintToken, refreshDevice, revokeToken } from '$lib/push/client';
import { setStoredDid } from '$lib/push/swkv';
import * as file from './file';
import type { Partner, PartnersFile, StorageLike } from './types';

/**
 * Your nickname and the people you have played with, kept across sessions.
 *
 * A thin reactive shell over the pure functions in `file.ts`, the same way the
 * game store wraps the engine: everything worth testing lives there, and this
 * only holds the current value and writes it back to storage.
 */
class PartnerStore {
	#file = $state<PartnersFile>(file.emptyFile());
	#storage: StorageLike;
	#loaded = false;

	constructor(storage: StorageLike) {
		this.#storage = storage;
	}

	get identity() {
		return this.#file.identity;
	}
	/** Most recently played first. */
	get list(): Partner[] {
		return file.sorted(this.#file.partners);
	}
	get hasName(): boolean {
		return this.#file.identity.name.length > 0;
	}
	get pendingRevocations(): string[] {
		return this.#file.pendingRevocations;
	}

	/** Read storage once, on app start. */
	load(): void {
		if (this.#loaded) return;
		this.#loaded = true;
		this.#file = file.loadFile(this.#storage);
	}

	byPeerId(peerId: string): Partner | undefined {
		return this.#file.partners.find((p) => p.peerId === peerId);
	}

	setName(name: string): void {
		this.#commit(file.setName(this.#file, name));
	}

	setDid(did: string | null): void {
		this.#commit(file.setDid(this.#file, did));
		void setStoredDid(did);
	}

	/** Remember a partner, or refresh the nickname of one already known. */
	save(peerId: string, name: string): Partner {
		this.#commit(file.upsertPartner(this.#file, peerId, name));
		return this.byPeerId(peerId)!;
	}

	patch(peerId: string, patch: Partial<Omit<Partner, 'peerId'>>): void {
		this.#commit(file.patchPartner(this.#file, peerId, patch));
	}

	markPlayed(peerId: string): void {
		if (this.byPeerId(peerId)) this.patch(peerId, { lastPlayedAt: Date.now() });
	}

	/**
	 * Forget a partner. The local list is updated immediately and the server
	 * call is allowed to fail — a withdrawal that doesn't land is retried on the
	 * next start rather than blocking the person doing the removing.
	 */
	async remove(peerId: string): Promise<void> {
		const partner = this.byPeerId(peerId);
		this.#commit(file.removePartner(this.#file, peerId));
		if (partner?.ourToken) await this.flushRevocations();
	}

	/** Retry any withdrawal that failed earlier. */
	async flushRevocations(): Promise<void> {
		const { did } = this.#file.identity;
		const queued = this.#file.pendingRevocations;
		if (!did || queued.length === 0) return;

		const done: string[] = [];
		for (const token of queued) if (await revokeToken(did, token)) done.push(token);
		if (done.length) this.#commit(file.clearRevocations(this.#file, done));
	}

	/**
	 * Mint the capability a partner needs to invite us, and remember that we
	 * issued it so it can be withdrawn later. Returns null if push isn't set up.
	 */
	async issueToken(peerId: string): Promise<string | null> {
		const partner = this.byPeerId(peerId);
		const { did, name } = this.#file.identity;
		if (!partner || !did) return null;

		const token = await mintToken(did, partner.name || name);
		if (token) this.patch(peerId, { ourToken: token });
		return token;
	}

	/** Keep the server's copy of our subscription current. Never prompts. */
	async refresh(): Promise<void> {
		const did = await refreshDevice(this.#file.identity.did);
		if (did && did !== this.#file.identity.did) this.setDid(did);
	}

	#commit(next: PartnersFile): void {
		this.#file = next;
		file.saveFile(this.#storage, next);
	}
}

/** Off-browser (prerender, tests) this is a throwaway in-memory store. */
function memoryStorage(): StorageLike {
	const mem = new Map<string, string>();
	return {
		getItem: (k) => mem.get(k) ?? null,
		setItem: (k, v) => void mem.set(k, v),
		removeItem: (k) => void mem.delete(k)
	};
}

export const partners = new PartnerStore(browser ? localStorage : memoryStorage());
