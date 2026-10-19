import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateRiverLayout, riverPositionFor, type RiverPosition } from '../src/rendering/river-layout.ts';

const directions: readonly RiverPosition[] = ['bottom', 'right', 'top', 'left'];

test('online seat rotation puts each viewer at the bottom and rotates all other seats clockwise', () => {
  for (let viewer = 0; viewer < 4; viewer++) {
    assert.equal(riverPositionFor(viewer, viewer), 'bottom');
    assert.deepEqual(
      Array.from({ length: 4 }, (_, offset) => riverPositionFor(viewer, (viewer + offset) % 4)),
      ['bottom', 'right', 'top', 'left'],
    );
  }
});

test('1, 6, 7, and 18 discards use ordered, unique slots in all four directions', () => {
  for (const direction of directions) {
    for (const count of [1, 6, 7, 18]) {
      const { placements } = calculateRiverLayout(direction, count);
      assert.equal(placements.length, count);
      assert.equal(new Set(placements.map(({ row, column }) => `${row},${column}`)).size, count);
      for (let index = 0; index < count; index++) {
        const row = Math.floor(index / 6);
        const column = index % 6;
        const expected = direction === 'bottom' ? [row, column]
          : direction === 'right' ? [5 - column, row]
            : direction === 'top' ? [2 - row, 5 - column]
              : [column, 2 - row];
        assert.deepEqual([placements[index].row, placements[index].column], expected, `${direction} discard ${index + 1}`);
      }
    }
  }
});

test('riichi rotation changes only its own face and leaves all other discard coordinates fixed', () => {
  for (const direction of directions) {
    const plain = calculateRiverLayout(direction, 18);
    for (const declarationIndex of [0, 5, 6, 17]) {
      const riichi = calculateRiverLayout(direction, 18, declarationIndex);
      assert.equal(riichi.width, plain.width);
      assert.equal(riichi.height, plain.height);
      for (let index = 0; index < 18; index++) {
        const before = plain.placements[index];
        const after = riichi.placements[index];
        assert.deepEqual([after.row, after.column], [before.row, before.column], `${direction} declaration ${declarationIndex}, slot ${index}`);
        if (index !== declarationIndex) {
          assert.deepEqual([after.left, after.top], [before.left, before.top], `${direction} declaration ${declarationIndex}, tile ${index}`);
        }
        assert.equal(after.declaration, index === declarationIndex);
      }
      assert.equal(riichi.placements[declarationIndex].width,
        direction === 'left' || direction === 'right' ? 'var(--river-tile-width)' : 'var(--river-tile-height)');
      assert.equal(riichi.placements[declarationIndex].height,
        direction === 'left' || direction === 'right' ? 'var(--river-tile-height)' : 'var(--river-tile-width)');
    }
  }
});

test('a river rejects more than three rows and invalid declaration slots', () => {
  assert.throws(() => calculateRiverLayout('bottom', 19), RangeError);
  assert.throws(() => calculateRiverLayout('bottom', 1, 1), RangeError);
});
