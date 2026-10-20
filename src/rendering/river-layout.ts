/** A river's location after rotating the table to the viewer's seat. */
export type RiverPosition = 'bottom' | 'right' | 'top' | 'left';

const POSITIONS: readonly RiverPosition[] = ['bottom', 'right', 'top', 'left'];

/** Convert absolute seat numbers into positions around the viewer. */
export function riverPositionFor(viewerSeat: number, seat: number): RiverPosition {
  return POSITIONS[(seat - viewerSeat + 4) % 4];
}

export type RiverTilePlacement = Readonly<{
  row: number;
  column: number;
  declaration: boolean;
  width: string;
  height: string;
  left: string;
  top: string;
}>;

export type RiverLayout = Readonly<{
  width: string;
  height: string;
  placements: readonly RiverTilePlacement[];
}>;

const GAP = 1;
const MAX_DISCARDS = 18;

function compactOffset(index: number): string {
  return index === 0 ? '0px'
    : `calc(var(--river-tile-height) * ${index * 0.5} + var(--river-tile-width) * ${index * 0.5} + ${index * GAP}px)`;
}

function fullOffset(index: number): string {
  return index === 0 ? '0px' : `calc(var(--river-tile-height) * ${index} + ${index * GAP}px)`;
}

function compactSpan(cellCount: number): string {
  const intervals = cellCount - 1;
  return `calc(var(--river-tile-height) + var(--river-tile-height) * ${intervals * 0.5} + var(--river-tile-width) * ${intervals * 0.5} + ${intervals * GAP}px)`;
}

function fullSpan(cellCount: number): string {
  return `calc(var(--river-tile-height) * ${cellCount} + ${(cellCount - 1) * GAP}px)`;
}

/**
 * Keep every slot fixed across discard counts and declaration positions.
 * Along the river, centers are half-way between a regular face and a sideways
 * declaration face apart, plus the 1px gap. Across rows, reserve the full
 * tile length. A declaration changes only its own face dimensions.
 */
export function calculateRiverLayout(
  position: RiverPosition,
  discardCount: number,
  declarationIndex = -1,
): RiverLayout {
  if (!Number.isInteger(discardCount) || discardCount < 0 || discardCount > MAX_DISCARDS) {
    throw new RangeError(`River must contain 0–${MAX_DISCARDS} discards`);
  }
  if (!Number.isInteger(declarationIndex) || declarationIndex < -1 || declarationIndex >= discardCount) {
    throw new RangeError('Riichi declaration must refer to a discard in the river');
  }

  const side = position === 'right' || position === 'left';
  const width = side ? fullSpan(3) : compactSpan(6);
  const height = side ? compactSpan(6) : fullSpan(3);
  const centerInSlot = (face: string): string => `calc((var(--river-tile-height) - var(${face})) * .5)`;
  const add = (offset: string, centered: string): string => offset === '0px'
    ? centered
    : `calc(${offset} + ${centered})`;

  const placements = Array.from({ length: discardCount }, (_, index) => {
    const row = Math.floor(index / 6);
    const column = index % 6;
    const screenRow = position === 'right' ? 5 - column
      : position === 'left' ? column
        : position === 'top' ? 2 - row : row;
    const screenColumn = position === 'right' ? row
      : position === 'left' ? 2 - row
        : position === 'top' ? 5 - column : column;
    const declaration = index === declarationIndex;
    const widthFace = side
      ? declaration ? '--river-tile-width' : '--river-tile-height'
      : declaration ? '--river-tile-height' : '--river-tile-width';
    const heightFace = side
      ? declaration ? '--river-tile-height' : '--river-tile-width'
      : declaration ? '--river-tile-width' : '--river-tile-height';
    const leftInSlot = side
      ? add(fullOffset(screenColumn), centerInSlot(widthFace))
      : add(compactOffset(screenColumn), centerInSlot(widthFace));
    const topInSlot = side
      ? add(compactOffset(screenRow), centerInSlot(heightFace))
      : add(fullOffset(screenRow), centerInSlot(heightFace));

    return {
      row: screenRow,
      column: screenColumn,
      declaration,
      width: `var(${widthFace})`,
      height: `var(${heightFace})`,
      left: leftInSlot,
      top: topInSlot,
    };
  });
  return { width, height, placements };
}

export function applyRiverLayout(container: HTMLElement, layout: RiverLayout): void {
  container.style.display = 'block';
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';
  container.style.width = layout.width;
  container.style.height = layout.height;
}

export function applyRiverTilePlacement(element: HTMLElement, placement: RiverTilePlacement): void {
  element.dataset.riverRow = String(placement.row);
  element.dataset.riverColumn = String(placement.column);
  element.style.position = 'absolute';
  element.style.width = placement.width;
  element.style.height = placement.height;
  element.style.left = placement.left;
  element.style.top = placement.top;
}
