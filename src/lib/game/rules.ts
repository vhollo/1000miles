import type { Card, Hazard, Remedy, Safety, DistanceValue } from './cards';
import { SAFETY_FOR } from './cards';
import type { PlayerState } from './state';

export const GOAL = 1000;

export const topBattle = (p: PlayerState): Card | undefined => p.battle[p.battle.length - 1];
export const topSpeed = (p: PlayerState): Card | undefined => p.speed[p.speed.length - 1];

export const hasSafety = (p: PlayerState, s: Safety): boolean => p.safeties.includes(s);

export function totalMiles(p: PlayerState): number {
	let sum = 0;
	for (const c of p.distance) if (c.kind === 'distance') sum += c.value;
	return sum;
}

/**
 * Is the player "rolling" (allowed to play mileage)?
 *
 * A hazard is only ever stacked on top of a green light, so removing it later
 * re-reveals that Roll — which is why we can infer the rolling state purely from
 * the top of the battle pile. Right of Way is a permanent green light and is
 * immune to Stop, so it rolls unless an *uncovered* blocking hazard sits on top.
 */
export function isRolling(p: PlayerState): boolean {
	const top = topBattle(p);
	if (top?.kind === 'hazard') return false; // unremedied hazard blocks movement
	if (hasSafety(p, 'rightOfWay')) return true; // permanent green light
	return top?.kind === 'remedy' && top.remedy === 'roll';
}

export function isSpeedLimited(p: PlayerState): boolean {
	if (hasSafety(p, 'rightOfWay')) return false; // immune to Speed Limit
	const top = topSpeed(p);
	return top?.kind === 'hazard' && top.hazard === 'speedLimit';
}

export function isProtectedFrom(p: PlayerState, hazard: Hazard): boolean {
	return hasSafety(p, SAFETY_FOR[hazard]);
}

/** May the current player advance by `value` miles right now? */
export function canPlayDistance(p: PlayerState, value: DistanceValue): boolean {
	if (!isRolling(p)) return false;
	if (isSpeedLimited(p) && value > 50) return false;
	if (totalMiles(p) + value > GOAL) return false;
	if (value === 200 && p.twoHundredsPlayed >= 2) return false;
	return true;
}

/** May `hazard` be played against `target` right now? */
export function canAttackWith(target: PlayerState, hazard: Hazard): boolean {
	if (isProtectedFrom(target, hazard)) return false;
	if (hazard === 'speedLimit') {
		// Speed Limit can be applied whether the opponent is rolling or stopped,
		// as long as they aren't already limited.
		return !isSpeedLimited(target);
	}
	// Accident / Out of Gas / Flat Tire / Stop: only on a rolling opponent.
	return isRolling(target);
}

/** May the player play `remedy` on themselves right now? */
export function canPlayRemedy(p: PlayerState, remedy: Remedy): boolean {
	const top = topBattle(p);
	switch (remedy) {
		case 'repairs':
			return top?.kind === 'hazard' && top.hazard === 'accident';
		case 'gasoline':
			return top?.kind === 'hazard' && top.hazard === 'outOfGas';
		case 'spareTire':
			return top?.kind === 'hazard' && top.hazard === 'flatTire';
		case 'endOfLimit':
			return isSpeedLimited(p);
		case 'roll': {
			if (hasSafety(p, 'rightOfWay')) return false; // never needs a Roll
			if (!top) return true; // initial green light
			if (top.kind === 'hazard') return top.hazard === 'stop'; // a Roll clears a Stop
			if (top.kind === 'remedy') return top.remedy !== 'roll'; // resume after a fix
			return false;
		}
	}
}

/** A safety can always be revealed on your own turn. */
export function canPlaySafety(): boolean {
	return true;
}
