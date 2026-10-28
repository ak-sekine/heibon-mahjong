import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('development tile catalog markup is absent from every built HTML entry page', () => {
  for (const file of ['index.html', 'kan-test.html', 'test.html']) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /tile-gallery|開発用：全34種類と赤5を見る/);
  }
});

test('application startup does not import tile gallery data or generate catalog tiles', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /tile-gallery|TILE_KINDS|SUITS|ordinaryTile|redFive|createTileElement|tileLabel/);
});

test('shared table and tile SVG rendering remains available to gameplay', () => {
  const table = readFileSync(new URL('../src/rendering/table.ts', import.meta.url), 'utf8');
  const svg = readFileSync(new URL('../src/rendering/tile-svg.ts', import.meta.url), 'utf8');
  assert.match(table, /createTileElement/);
  assert.match(svg, /export function createTileElement/);
  assert.match(svg, /export function tileSvgMarkup/);
});
