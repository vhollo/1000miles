/**
 * Card model for Mille Bornes.
 *
 * The deck has 106 cards across four kinds:
 *  - distance (mileage / "bornes")
 *  - hazard   (attacks played on an opponent)
 *  - remedy   (fix a hazard / get rolling)
 *  - safety   (permanent protection; enables the Coup Fourré)
 */

export type Hazard = 'accident' | 'outOfGas' | 'flatTire' | 'speedLimit' | 'stop';
export type Remedy = 'repairs' | 'gasoline' | 'spareTire' | 'endOfLimit' | 'roll';
export type Safety = 'drivingAce' | 'extraTank' | 'punctureProof' | 'rightOfWay';
export type DistanceValue = 25 | 50 | 75 | 100 | 200;

export type Card =
	| { id: string; kind: 'distance'; value: DistanceValue }
	| { id: string; kind: 'hazard'; hazard: Hazard }
	| { id: string; kind: 'remedy'; remedy: Remedy }
	| { id: string; kind: 'safety'; safety: Safety };

export type CardKind = Card['kind'];

/* ---- Relationships ----------------------------------------------------- */

/** The remedy that clears each hazard. */
export const REMEDY_FOR: Record<Hazard, Remedy> = {
	accident: 'repairs',
	outOfGas: 'gasoline',
	flatTire: 'spareTire',
	speedLimit: 'endOfLimit',
	stop: 'roll'
};

/** The safety that makes a player immune to each hazard. */
export const SAFETY_FOR: Record<Hazard, Safety> = {
	accident: 'drivingAce',
	outOfGas: 'extraTank',
	flatTire: 'punctureProof',
	speedLimit: 'rightOfWay',
	stop: 'rightOfWay'
};

/** Which hazards each safety protects against. */
export const SAFETY_COVERS: Record<Safety, Hazard[]> = {
	drivingAce: ['accident'],
	extraTank: ['outOfGas'],
	punctureProof: ['flatTire'],
	rightOfWay: ['stop', 'speedLimit']
};

/* ---- Deck composition (106 cards) ------------------------------------- */

export const DISTANCE_COUNTS: Record<DistanceValue, number> = {
	25: 10,
	50: 10,
	75: 10,
	100: 12,
	200: 4
};

export const HAZARD_COUNTS: Record<Hazard, number> = {
	accident: 3,
	outOfGas: 3,
	flatTire: 3,
	speedLimit: 4,
	stop: 5
};

export const REMEDY_COUNTS: Record<Remedy, number> = {
	repairs: 6,
	gasoline: 6,
	spareTire: 6,
	endOfLimit: 6,
	roll: 14
};

export const SAFETIES: Safety[] = ['drivingAce', 'extraTank', 'punctureProof', 'rightOfWay'];

/** Build a fresh, ordered 106-card deck with stable unique ids. */
export function buildDeck(): Card[] {
	const deck: Card[] = [];

	for (const [value, count] of Object.entries(DISTANCE_COUNTS)) {
		const v = Number(value) as DistanceValue;
		for (let i = 0; i < count; i++) deck.push({ id: `d${v}-${i}`, kind: 'distance', value: v });
	}
	for (const [hazard, count] of Object.entries(HAZARD_COUNTS)) {
		const h = hazard as Hazard;
		for (let i = 0; i < count; i++) deck.push({ id: `hz-${h}-${i}`, kind: 'hazard', hazard: h });
	}
	for (const [remedy, count] of Object.entries(REMEDY_COUNTS)) {
		const r = remedy as Remedy;
		for (let i = 0; i < count; i++) deck.push({ id: `rm-${r}-${i}`, kind: 'remedy', remedy: r });
	}
	for (const s of SAFETIES) deck.push({ id: `sf-${s}`, kind: 'safety', safety: s });

	return deck;
}

/* ---- Display metadata (used by the UI) -------------------------------- */

export interface CardMeta {
	label: string;
	short: string;
	emoji: string;
	/** Tailwind hue used for the card face. */
	hue: 'road' | 'rose' | 'emerald' | 'amber' | 'violet' | 'slate' | 'sky';
}

export const HAZARD_META: Record<Hazard, CardMeta> = {
	accident: { label: 'Accident', short: 'Crash', emoji: '💥', hue: 'rose' },
	outOfGas: { label: 'Out of Gas', short: 'Empty', emoji: '⛽', hue: 'rose' },
	flatTire: { label: 'Flat Tire', short: 'Flat', emoji: '🛞', hue: 'rose' },
	speedLimit: { label: 'Speed Limit', short: '50', emoji: '🚸', hue: 'amber' },
	stop: { label: 'Stop', short: 'Stop', emoji: '🛑', hue: 'rose' }
};

export const REMEDY_META: Record<Remedy, CardMeta> = {
	repairs: { label: 'Repairs', short: 'Fix', emoji: '🔧', hue: 'emerald' },
	gasoline: { label: 'Gasoline', short: 'Fuel', emoji: '⛽', hue: 'emerald' },
	spareTire: { label: 'Spare Tire', short: 'Tire', emoji: '🛞', hue: 'emerald' },
	endOfLimit: { label: 'End of Limit', short: 'No Limit', emoji: '🏁', hue: 'emerald' },
	roll: { label: 'Roll', short: 'Go', emoji: '🟢', hue: 'emerald' }
};

export const SAFETY_META: Record<Safety, CardMeta> = {
	drivingAce: { label: 'Driving Ace', short: 'Ace', emoji: '🏆', hue: 'violet' },
	extraTank: { label: 'Extra Tank', short: 'Tank', emoji: '🛢️', hue: 'violet' },
	punctureProof: { label: 'Puncture-Proof', short: 'Proof', emoji: '🛡️', hue: 'violet' },
	rightOfWay: { label: 'Right of Way', short: 'Priority', emoji: '🚦', hue: 'violet' }
};

export function cardMeta(card: Card): CardMeta {
	switch (card.kind) {
		case 'distance':
			return { label: `${card.value}`, short: `${card.value}`, emoji: '🛣️', hue: 'road' };
		case 'hazard':
			return HAZARD_META[card.hazard];
		case 'remedy':
			return REMEDY_META[card.remedy];
		case 'safety':
			return SAFETY_META[card.safety];
	}
}
