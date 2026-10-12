import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { SAMPLE_HAND } from './data/sample-hand.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';

const hand = document.querySelector<HTMLUListElement>('#sample-hand')!;
for (const tile of SAMPLE_HAND) {
  const item = document.createElement('li');
  item.append(createTileElement(tile));
  hand.append(item);
}

const gallery = document.querySelector<HTMLUListElement>('#tile-gallery')!;
for (const tile of [...TILE_KINDS.map(ordinaryTile), ...SUITS.map(redFive)]) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = tileLabel(tile);
  item.append(createTileElement(tile), label);
  gallery.append(item);
}
