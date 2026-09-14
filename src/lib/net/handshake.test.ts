import { describe, it, expect } from 'vitest';
import { readHello, settleNames } from './handshake';

describe('handshake', () => {
	it('names both seats from the peer greeting, host first', () => {
		expect(settleNames('Anna', { peerId: 'p1', name: 'Bob' })).toEqual(['Anna', 'Bob']);
	});

	it('falls back to the old names when the peer never says hello', () => {
		// An older build: no greeting arrives before the grace period expires.
		expect(settleNames('Anna', null)).toEqual(['Anna', 'Guest']);
		expect(settleNames('', null)).toEqual(['Host', 'Guest']);
	});

	it('cleans names that came off the wire', () => {
		const [, them] = settleNames('Anna', { peerId: 'p1', name: 'B'.repeat(50) });
		expect(them).toHaveLength(24);
		expect(settleNames('Anna', { peerId: 'p1', name: '   ' })[1]).toBe('Player');
	});

	it('accepts a well-formed greeting and rejects the rest', () => {
		expect(readHello({ peerId: 'p1', name: 'Bob' })).toEqual({ peerId: 'p1', name: 'Bob' });
		expect(readHello({ peerId: 'p1' })).toEqual({ peerId: 'p1', name: 'Player' });
		expect(readHello({ name: 'Bob' })).toBeNull();
		expect(readHello({ peerId: '' })).toBeNull();
		expect(readHello({ peerId: 'x'.repeat(65) })).toBeNull();
	});
});
