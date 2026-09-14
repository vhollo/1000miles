/**
 * Reading, writing and editing the saved partner list.
 *
 * Pure functions over a plain object, like the game engine: the runes store in
 * `store.svelte.ts` is a thin reactive wrapper, and everything interesting is
 * testable without a browser or a compiler.
 */

import { cleanName } from '$lib/push/validate';
import {
	PARTNERS_KEY,
	PARTNERS_VERSION,
	type Partner,
	type PartnersFile,
	type StorageLike
} from './types';

export function emptyFile(): PartnersFile {
	return {
		v: PARTNERS_VERSION,
		identity: { peerId: crypto.randomUUID(), name: '', did: null },
		partners: [],
		pendingRevocations: []
	};
}

/**
 * Read the file, falling back to a fresh one for anything unreadable. Losing
 * the partner list is bad; refusing to start because of it would be worse.
 */
export function loadFile(storage: StorageLike): PartnersFile {
	try {
		const raw = storage.getItem(PARTNERS_KEY);
		if (!raw) return emptyFile();
		const parsed = JSON.parse(raw) as Partial<PartnersFile>;
		return normalise(parsed);
	} catch {
		return emptyFile();
	}
}

export function saveFile(storage: StorageLike, file: PartnersFile): void {
	try {
		storage.setItem(PARTNERS_KEY, JSON.stringify(file));
	} catch {
		/* storage full or unavailable — non-fatal, same as the game save */
	}
}

/** Fill in anything missing or malformed, keeping whatever was valid. */
function normalise(parsed: Partial<PartnersFile>): PartnersFile {
	const base = emptyFile();
	const identity = parsed.identity ?? base.identity;
	return {
		v: PARTNERS_VERSION,
		identity: {
			peerId: typeof identity.peerId === 'string' && identity.peerId ? identity.peerId : base.identity.peerId,
			name: typeof identity.name === 'string' ? cleanName(identity.name, '') : '',
			did: typeof identity.did === 'string' ? identity.did : null
		},
		partners: Array.isArray(parsed.partners) ? parsed.partners.filter(isPartner) : [],
		pendingRevocations: Array.isArray(parsed.pendingRevocations)
			? parsed.pendingRevocations.filter((t): t is string => typeof t === 'string')
			: []
	};
}

const isPartner = (p: unknown): p is Partner =>
	!!p && typeof p === 'object' && typeof (p as Partner).peerId === 'string';

/* ---- edits: each returns a new file ------------------------------------ */

export function setName(file: PartnersFile, name: string): PartnersFile {
	return { ...file, identity: { ...file.identity, name: cleanName(name, '') } };
}

export function setDid(file: PartnersFile, did: string | null): PartnersFile {
	return { ...file, identity: { ...file.identity, did } };
}

/** Add a partner, or refresh the name of one already known. Keyed on peerId. */
export function upsertPartner(file: PartnersFile, peerId: string, name: string): PartnersFile {
	const clean = cleanName(name);
	const existing = file.partners.find((p) => p.peerId === peerId);
	const partner: Partner = existing
		? { ...existing, name: clean }
		: {
				peerId,
				name: clean,
				createdAt: Date.now(),
				lastPlayedAt: null,
				theirToken: null,
				ourToken: null
			};
	return {
		...file,
		partners: existing
			? file.partners.map((p) => (p.peerId === peerId ? partner : p))
			: [...file.partners, partner]
	};
}

export function patchPartner(
	file: PartnersFile,
	peerId: string,
	patch: Partial<Omit<Partner, 'peerId'>>
): PartnersFile {
	return {
		...file,
		partners: file.partners.map((p) => (p.peerId === peerId ? { ...p, ...patch } : p))
	};
}

/**
 * Forget a partner. Any capability we issued them is queued for withdrawal so
 * a failed network call can be retried — removing them locally never waits on
 * the server.
 */
export function removePartner(file: PartnersFile, peerId: string): PartnersFile {
	const partner = file.partners.find((p) => p.peerId === peerId);
	return {
		...file,
		partners: file.partners.filter((p) => p.peerId !== peerId),
		pendingRevocations: partner?.ourToken
			? [...file.pendingRevocations, partner.ourToken]
			: file.pendingRevocations
	};
}

export const clearRevocations = (file: PartnersFile, done: string[]): PartnersFile => ({
	...file,
	pendingRevocations: file.pendingRevocations.filter((t) => !done.includes(t))
});

/** Most recently played first, then most recently added. */
export const sorted = (partners: Partner[]): Partner[] =>
	[...partners].sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
