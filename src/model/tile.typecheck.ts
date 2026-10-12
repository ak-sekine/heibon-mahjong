import type { Tile } from './tile.ts';

// Compile-time regression checks; this module is not imported by the app.
const valid: Tile = { category: 'suited', suit: 'man', rank: 5, isRed: true };
// @ts-expect-error Only rank 5 can be red.
const invalidRank: Tile = { category: 'suited', suit: 'man', rank: 4, isRed: true };
// @ts-expect-error Honor tiles cannot be red variants.
const invalidHonor: Tile = { category: 'honor', honor: 'east', isRed: true };
void [valid, invalidRank, invalidHonor];
