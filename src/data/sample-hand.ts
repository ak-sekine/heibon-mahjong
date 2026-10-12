import { ordinaryTile, redFive } from '../model/tile.ts';
import type { Tile, Suit, Rank, Honor } from '../model/tile.ts';

const suited = (suit: Suit, rank: Rank) => ordinaryTile({ category: 'suited', suit, rank });
const honor = (honor: Honor) => ordinaryTile({ category: 'honor', honor });

export const SAMPLE_HAND: readonly Tile[] = Object.freeze([
  suited('man', 1), suited('man', 3), suited('man', 5), redFive('man'),
  suited('pin', 2), suited('pin', 5), redFive('pin'),
  suited('sou', 1), suited('sou', 5), redFive('sou'),
  honor('east'), honor('white'), honor('green'), honor('red'),
]);
