/** Logical tile kinds: red fives share the same kind as ordinary fives. */
export type Suit = 'man' | 'pin' | 'sou';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Honor = 'east' | 'south' | 'west' | 'north' | 'white' | 'green' | 'red';
export type TileKind =
  | Readonly<{ category: 'suited'; suit: Suit; rank: Rank }>
  | Readonly<{ category: 'honor'; honor: Honor }>;

export type Tile =
  | Readonly<{ category: 'suited'; suit: Suit; rank: Rank; isRed: false }>
  | Readonly<{ category: 'suited'; suit: Suit; rank: 5; isRed: true }>
  | Readonly<{ category: 'honor'; honor: Honor; isRed: false }>;

export const SUITS = ['man', 'pin', 'sou'] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const HONORS = ['east', 'south', 'west', 'north', 'white', 'green', 'red'] as const;
export const TILE_KINDS: readonly TileKind[] = Object.freeze([
  ...SUITS.flatMap(suit => RANKS.map(rank => Object.freeze({ category: 'suited' as const, suit, rank }))),
  ...HONORS.map(honor => Object.freeze({ category: 'honor' as const, honor })),
]);

/** Stable identity for future hand evaluation; intentionally ignores red status. */
export function tileKindKey(tile: TileKind): string {
  return tile.category === 'suited' ? `${tile.suit}-${tile.rank}` : tile.honor;
}

export function ordinaryTile(kind: TileKind): Tile {
  return Object.freeze({ ...kind, isRed: false });
}

export function redFive(suit: Suit): Tile {
  return Object.freeze({ category: 'suited', suit, rank: 5, isRed: true });
}
