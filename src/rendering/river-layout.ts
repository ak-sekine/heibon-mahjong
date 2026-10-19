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

/**
 * Give every discard a fixed square slot sized for the sideways face. A
 * riichi declaration changes only its own face dimensions; it never changes
 * another tile's slot or the row/column positions in the river.
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
  const width = side
    ? `calc(var(--river-tile-height) * 3 + ${2 * GAP}px)`
    : `calc(var(--river-tile-height) * 6 + ${5 * GAP}px)`;
  const height = side
    ? `calc(var(--river-tile-height) * 6 + ${5 * GAP}px)`
    : `calc(var(--river-tile-height) * 3 + ${2 * GAP}px)`;
  const slotOffset = (index: number): string => index === 0
    ? '0px'
    : `calc(var(--river-tile-height) * ${index} + ${index * GAP}px)`;
  const centerInSlot = (face: string): string => `calc((var(--river-tile-height) - var(${face})) * .5)`;
  const alignEndInSlot = (face: string): string => `calc(var(--river-tile-height) - var(${face}))`;

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
      ? centerInSlot(widthFace)
      : position === 'top' ? alignEndInSlot(widthFace) : '0px';
    const topInSlot = side
      ? position === 'right' ? alignEndInSlot(heightFace) : '0px'
      : centerInSlot(heightFace);

    return {
      row: screenRow,
      column: screenColumn,
      declaration,
      width: `var(${widthFace})`,
      height: `var(${heightFace})`,
      left: `calc(${slotOffset(screenColumn)} + ${leftInSlot})`,
      top: `calc(${slotOffset(screenRow)} + ${topInSlot})`,
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
  element.style.gridRow = String(placement.row + 1);
  element.style.gridColumn = String(placement.column + 1);
  element.style.position = 'absolute';
  element.style.width = placement.width;
  element.style.height = placement.height;
  element.style.left = placement.left;
  element.style.top = placement.top;
}
