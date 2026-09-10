import { describe, it, expect } from 'vitest';
import { acts, asObject } from './text';

describe('log grammar', () => {
	it('gives the pronoun subject the bare verb', () => {
		expect(acts('You', 'drive')).toBe('You drive');
		expect(acts('You', 'discard')).toBe('You discard');
		expect(acts('You', 'reach')).toBe('You reach');
	});

	it('gives every other name the third-person form', () => {
		expect(acts('AI', 'drive')).toBe('AI drives');
		expect(acts('Player 2', 'discard')).toBe('Player 2 discards');
		expect(acts('Host', 'take')).toBe('Host takes');
	});

	it('takes an explicit form for irregular verbs', () => {
		expect(acts('You', 'are driving', 'is driving')).toBe('You are driving');
		expect(acts('AI', 'are driving', 'is driving')).toBe('AI is driving');
	});

	it('lowercases the pronoun in object position', () => {
		expect(asObject('You')).toBe('you');
		expect(asObject('AI')).toBe('AI');
		expect(asObject('Player 1')).toBe('Player 1');
	});
});
