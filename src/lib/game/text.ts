/**
 * Grammar helpers for player-facing lines.
 *
 * The log and the status banner name whoever is acting, and in solo play that
 * name is the second-person pronoun: "You". A pronoun subject takes the bare
 * verb ("You drive") where every other name takes the third-person form ("AI
 * drives"), and as an object it is lowercase ("hits you"). Everything here is a
 * fact about that one word, so it lives with the word rather than at each of
 * the dozen call sites.
 */
const SECOND_PERSON = 'You';

/**
 * `"<name> <verb>"`, conjugated for the subject. The third-person form defaults
 * to `verb + "s"`; pass it explicitly for anything irregular
 * (`acts(name, 'are driving', 'is driving')`).
 */
export function acts(name: string, verb: string, thirdPerson = `${verb}s`): string {
	return `${name} ${name === SECOND_PERSON ? verb : thirdPerson}`;
}

/** The same name in object position: "AI hits you with Stop". */
export function asObject(name: string): string {
	return name === SECOND_PERSON ? 'you' : name;
}
