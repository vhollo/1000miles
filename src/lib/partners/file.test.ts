import { describe, it, expect } from 'vitest';
import {
	clearRevocations,
	emptyFile,
	loadFile,
	patchPartner,
	removePartner,
	saveFile,
	setName,
	sorted,
	upsertPartner
} from './file';
import { PARTNERS_KEY, type StorageLike } from './types';

/** A Map is all `loadFile`/`saveFile` need — no browser, no localStorage. */
function fakeStorage(initial?: string): StorageLike {
	const mem = new Map<string, string>();
	if (initial !== undefined) mem.set(PARTNERS_KEY, initial);
	return {
		getItem: (k) => mem.get(k) ?? null,
		setItem: (k, v) => void mem.set(k, v),
		removeItem: (k) => void mem.delete(k)
	};
}

describe('partners file', () => {
	it('round-trips through storage', () => {
		const storage = fakeStorage();
		const file = upsertPartner(setName(emptyFile(), 'Anna'), 'peer-1', 'Bob');
		saveFile(storage, file);

		const back = loadFile(storage);
		expect(back.identity.name).toBe('Anna');
		expect(back.partners).toHaveLength(1);
		expect(back.partners[0]).toMatchObject({ peerId: 'peer-1', name: 'Bob' });
	});

	it('starts fresh rather than throwing on a corrupt file', () => {
		const file = loadFile(fakeStorage('{ not json at all'));
		expect(file.partners).toEqual([]);
		expect(file.identity.peerId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('keeps what is valid in a half-broken file', () => {
		const file = loadFile(
			fakeStorage(
				JSON.stringify({
					v: 1,
					identity: { peerId: 'kept', name: 'Anna' }, // no `did`
					partners: [{ peerId: 'ok', name: 'Bob' }, { name: 'no peer id' }, null]
				})
			)
		);
		expect(file.identity.peerId).toBe('kept');
		expect(file.identity.did).toBeNull();
		expect(file.partners.map((p) => p.peerId)).toEqual(['ok']);
		expect(file.pendingRevocations).toEqual([]);
	});

	it('matches partners on peer id instead of collecting duplicates', () => {
		let file = upsertPartner(emptyFile(), 'peer-1', 'Bob');
		file = patchPartner(file, 'peer-1', { theirToken: 'tok' });
		file = upsertPartner(file, 'peer-1', 'Robert'); // same person, new nickname

		expect(file.partners).toHaveLength(1);
		expect(file.partners[0].name).toBe('Robert');
		expect(file.partners[0].theirToken).toBe('tok'); // the capability survives
	});

	it('trims hostile nicknames on the way in', () => {
		const file = upsertPartner(emptyFile(), 'peer-1', 'A'.repeat(80));
		expect(file.partners[0].name).toHaveLength(24);
		expect(upsertPartner(emptyFile(), 'p', '   ').partners[0].name).toBe('Player');
	});

	it('queues a withdrawal when a partner we issued a token to is removed', () => {
		let file = patchPartner(upsertPartner(emptyFile(), 'peer-1', 'Bob'), 'peer-1', {
			ourToken: 'our-tok'
		});
		file = removePartner(file, 'peer-1');

		expect(file.partners).toEqual([]);
		expect(file.pendingRevocations).toEqual(['our-tok']);
		expect(clearRevocations(file, ['our-tok']).pendingRevocations).toEqual([]);
	});

	it('queues nothing for a partner who never got a token', () => {
		const file = removePartner(upsertPartner(emptyFile(), 'peer-1', 'Bob'), 'peer-1');
		expect(file.pendingRevocations).toEqual([]);
	});

	it('puts the most recently played partner first', () => {
		let file = upsertPartner(upsertPartner(emptyFile(), 'old', 'Old'), 'recent', 'Recent');
		file = patchPartner(file, 'recent', { lastPlayedAt: Date.now() + 10_000 });
		expect(sorted(file.partners).map((p) => p.peerId)).toEqual(['recent', 'old']);
	});
});
