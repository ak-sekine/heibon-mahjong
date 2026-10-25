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

test('1–18 discards keep their existing ordered slots in all four directions', () => {
  for (const direction of directions) {
    for (const count of [1, 6, 7, 12, 18]) {
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

test('riichi adds its extra face length only to later tiles on the same line', () => {
  for (const direction of directions) {
    const side = direction === 'left' || direction === 'right';
    for (const count of [18, 24]) {
      const plain = calculateRiverLayout(direction, count);
      const mainOffset = (placement: (typeof plain.placements)[number]): string => side ? placement.top : placement.left;
      const mainAxis = (placement: (typeof plain.placements)[number]): number => side ? placement.row : placement.column;
      const mainLine = (placement: (typeof plain.placements)[number]): number => side ? placement.column : placement.row;
      for (const declarationIndex of [0, 5, 6, 11, 12, 17, ...(count === 24 ? [18, 23] : [])]) {
        const riichi = calculateRiverLayout(direction, count, declarationIndex);
        assert.equal(riichi.width, plain.width);
        assert.equal(riichi.height, plain.height);
        for (let index = 0; index < count; index++) {
          const before = plain.placements[index];
          const after = riichi.placements[index];
          assert.deepEqual([after.row, after.column], [before.row, before.column], `${direction} declaration ${declarationIndex}, slot ${index}`);
          if (index === declarationIndex) {
            assert.equal(after.declaration, true);
            assert.equal(after.width,
              side ? 'var(--river-tile-width)' : 'var(--river-tile-height)');
            assert.equal(after.height,
              side ? 'var(--river-tile-height)' : 'var(--river-tile-width)');
            continue;
          }

          assert.equal(after.declaration, false);
          const declaration = riichi.placements[declarationIndex];
          const followsDeclaration = mainLine(after) === mainLine(declaration) && mainAxis(after) > mainAxis(declaration);
          if (followsDeclaration) {
            assert.match(mainOffset(after), /var\(--river-tile-height\) - var\(--river-tile-width\)/,
              `${direction} declaration ${declarationIndex}, following tile ${index} reserves the sideways face length`);
          } else {
            assert.equal(mainOffset(after), mainOffset(before),
              `${direction} declaration ${declarationIndex}, unaffected tile ${index}`);
          }
        }
      }
    }
  }
});

test('19–24 discards occupy a fourth row and larger rivers grow without a fixed cap', () => {
  const fourthRowStart: Readonly<Record<RiverPosition, readonly [number, number]>> = {
    bottom: [3, 0], right: [5, 3], top: [-1, 5], left: [0, -1],
  };
  const fourthRowEnd: Readonly<Record<RiverPosition, readonly [number, number]>> = {
    bottom: [3, 5], right: [0, 3], top: [-1, 0], left: [5, -1],
  };
  for (const direction of directions) {
    for (const count of [19, 20, 23, 24, 25, 30, 70]) {
      const layout = calculateRiverLayout(direction, count);
      assert.equal(layout.placements.length, count);
      assert.equal(new Set(layout.placements.map(({ row, column }) => `${row},${column}`)).size, count);
      for (let index = 0; index < Math.min(count, 18); index++) {
        const row = Math.floor(index / 6);
        const column = index % 6;
        const expected = direction === 'bottom' ? [row, column]
          : direction === 'right' ? [5 - column, row]
            : direction === 'top' ? [2 - row, 5 - column]
              : [column, 2 - row];
        assert.deepEqual([layout.placements[index].row, layout.placements[index].column], expected);
      }
      if (count >= 19) assert.deepEqual(
        [layout.placements[18].row, layout.placements[18].column], fourthRowStart[direction]);
      if (count >= 24) assert.deepEqual(
        [layout.placements[23].row, layout.placements[23].column], fourthRowEnd[direction]);
    }
  }
  const eighteen = calculateRiverLayout('bottom', 18);
  const twentyFour = calculateRiverLayout('bottom', 24);
  assert.equal(twentyFour.placements[18].row, 3);
  assert.equal(twentyFour.placements[18].column, 0);
  assert.equal(twentyFour.placements[23].row, 3);
  assert.equal(twentyFour.placements[23].column, 5);
  assert.notEqual(twentyFour.height, eighteen.height);
  assert.throws(() => calculateRiverLayout('bottom', Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => calculateRiverLayout('bottom', -1), RangeError);
  assert.throws(() => calculateRiverLayout('bottom', 1, 1), RangeError);
});
