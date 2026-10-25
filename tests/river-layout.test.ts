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

test('1–18 self and opposite discards keep their established six-column order', () => {
  for (const direction of ['bottom', 'top'] as const) {
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

test('the first riichi tile preserves its start slot in reversed rivers', () => {
  for (const direction of ['right', 'top'] as const) {
    const layout = calculateRiverLayout(direction, 18, 0);
    const declaration = layout.placements[0];
    const nextLaneStart = layout.placements[direction === 'right' ? 8 : 6];

    assert.equal(declaration.declaration, true);
    assert.equal(direction === 'right' ? declaration.top : declaration.left,
      direction === 'right' ? nextLaneStart.top : nextLaneStart.left);
  }
});

test('self and opposite rivers preserve six-by-four placement beyond 18 discards', () => {
  const fourthRowStart: Readonly<Record<'bottom' | 'top', readonly [number, number]>> = {
    bottom: [3, 0], top: [-1, 5],
  };
  const fourthRowEnd: Readonly<Record<'bottom' | 'top', readonly [number, number]>> = {
    bottom: [3, 5], top: [-1, 0],
  };
  for (const direction of ['bottom', 'top'] as const) {
    for (const count of [19, 20, 23, 24, 25, 30, 70]) {
      const layout = calculateRiverLayout(direction, count);
      assert.equal(layout.placements.length, count);
      assert.equal(new Set(layout.placements.map(({ row, column }) => `${row},${column}`)).size, count);
      if (count > 24) assert.ok(layout.tileScale < 1, `${direction} overflow rivers shrink after 24 discards`);
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
});

test('side rivers pack eight ordered tiles across three mirrored lanes', () => {
  const expected: Readonly<Record<'right' | 'left', readonly [number, number][]>> = {
    right: [
      ...Array.from({ length: 8 }, (_, index) => [7 - index, 0] as const),
      ...Array.from({ length: 8 }, (_, index) => [7 - index, 1] as const),
      ...Array.from({ length: 8 }, (_, index) => [7 - index, 2] as const),
    ],
    left: [
      ...Array.from({ length: 8 }, (_, index) => [index, 2] as const),
      ...Array.from({ length: 8 }, (_, index) => [index, 1] as const),
      ...Array.from({ length: 8 }, (_, index) => [index, 0] as const),
    ],
  };
  for (const direction of ['right', 'left'] as const) {
    for (const count of [8, 9, 16, 17, 18, 19, 20, 23, 24]) {
      const layout = calculateRiverLayout(direction, count);
      assert.equal(layout.rows, 3);
      assert.equal(layout.placements.length, count);
      assert.deepEqual(layout.placements.map(({ row, column }) => [row, column]), expected[direction].slice(0, count));
      assert.equal(new Set(layout.placements.map(({ row, column }) => `${row},${column}`)).size, count);
      assert.match(layout.width, /var\(--river-tile-height\) \* 3/);
      assert.match(layout.height, /var\(--river-tile-width\) \* 6/);
    }
  }
  assert.deepEqual([
    calculateRiverLayout('right', 19).placements[18].row,
    calculateRiverLayout('right', 19).placements[18].column,
  ], [5, 2]);
  assert.deepEqual([
    calculateRiverLayout('left', 19).placements[18].row,
    calculateRiverLayout('left', 19).placements[18].column,
  ], [2, 0]);
  assert.match(calculateRiverLayout('right', 24).width, /\* 3/);
  assert.match(calculateRiverLayout('right', 24).height, /\* 6/);
  for (const direction of ['right', 'left'] as const) {
    const thirtyTwo = calculateRiverLayout(direction, 32);
    const thirtyThree = calculateRiverLayout(direction, 33);
    assert.equal(thirtyTwo.rows, 4);
    assert.equal(thirtyThree.rows, 5);
    assert.equal(thirtyTwo.placements.length, 32);
    assert.equal(thirtyThree.placements.length, 33);
    assert.ok(thirtyThree.tileScale < thirtyTwo.tileScale);
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

test('CPU1 right river preserves its first 18 positions and gives discard 19 an eighth-column third-lane slot', () => {
  const before = calculateRiverLayout('right', 18);
  const after = calculateRiverLayout('right', 19);
  assert.deepEqual(after.placements.slice(0, 18), before.placements);
  assert.deepEqual([after.placements[18].row, after.placements[18].column], [5, 2]);
  assert.deepEqual([after.placements[18].width, after.placements[18].height], [
    'var(--river-tile-height)', 'var(--river-tile-width)',
  ]);
  const riichi = calculateRiverLayout('right', 19, 18).placements[18];
  assert.equal(riichi.declaration, true);
  assert.deepEqual([riichi.width, riichi.height], [
    'var(--river-tile-width)', 'var(--river-tile-height)',
  ]);
});
