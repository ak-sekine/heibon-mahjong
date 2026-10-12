import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_KINDS, SUITS, RANKS, HONORS, ordinaryTile, redFive, tileKindKey } from '../src/model/tile.ts';
import { SAMPLE_HAND } from '../src/data/sample-hand.ts';
import { tileSvgMarkup, tileLabel } from '../src/rendering/tile-svg.ts';

test('34 unique kinds: nine ranks in each suit and seven honors', () => {
  assert.equal(TILE_KINDS.length, 34);
  assert.equal(new Set(TILE_KINDS.map(tileKindKey)).size, 34);
  for (const suit of SUITS) {
    assert.deepEqual(TILE_KINDS.filter(t => t.category === 'suited' && t.suit === suit)
      .map(t => t.category === 'suited' && t.rank), [...RANKS]);
  }
  assert.deepEqual(TILE_KINDS.filter(t => t.category === 'honor')
    .map(t => t.category === 'honor' && t.honor), [...HONORS]);
  assert.ok(TILE_KINDS.every(t => !ordinaryTile(t).isRed));
});

test('red fives are variants of the same logical kind', () => {
  for (const suit of SUITS) {
    const red = redFive(suit);
    const normal = ordinaryTile({ category: 'suited', suit, rank: 5 });
    assert.equal(red.isRed, true);
    assert.equal(normal.isRed, false);
    assert.equal(tileKindKey(red), tileKindKey(normal));
    assert.notEqual(tileLabel(red), tileLabel(normal));
  }
});

test('fixed sample has 14 tiles, all suits, honors and all three red fives', () => {
  assert.equal(SAMPLE_HAND.length, 14);
  for (const suit of SUITS) {
    assert.ok(SAMPLE_HAND.some(t => t.category === 'suited' && t.suit === suit && !t.isRed));
    assert.ok(SAMPLE_HAND.some(t => t.category === 'suited' && t.suit === suit && t.isRed));
  }
  assert.ok(SAMPLE_HAND.some(t => t.category === 'honor'));
});

test('all 34 kinds and three red variants produce labeled SVG without emoji', () => {
  for (const tile of [...TILE_KINDS.map(ordinaryTile), ...SUITS.map(redFive)]) {
    const svg = tileSvgMarkup(tile);
    assert.match(svg, /^<svg /);
    assert.match(svg, /viewBox="0 0 60 84"/);
    assert.ok(svg.includes(`aria-label="${tileLabel(tile)}"`));
    assert.doesNotMatch(svg, /[\u{1F000}-\u{1F02F}]/u);
    assert.doesNotMatch(svg, /<image|<script|https?:\/\/(?!www\.w3\.org)/);
  }
});

