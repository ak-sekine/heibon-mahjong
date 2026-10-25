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
  rows: number;
  width: string;
  height: string;
  placements: readonly RiverTilePlacement[];
}>;

const GAP = 1;
const COLUMNS = 6;
const MIN_ROWS = 3;

function compactOffset(index: number, declarationFirst: boolean, declarationBefore: boolean): string {
  const inset = declarationFirst ? '' : ' + var(--river-tile-height) * .5 - var(--river-tile-width) * .5';
  const declarationLength = declarationBefore ? ' + var(--river-tile-height) - var(--river-tile-width)' : '';
  if (index === 0 && declarationFirst) return '0px';
  return `calc(var(--river-tile-width) * ${index} + ${index * GAP}px${inset}${declarationLength})`;
}

function fullOffset(index: number): string {
  return index === 0 ? '0px' : `calc(var(--river-tile-height) * ${index} + ${index * GAP}px)`;
}

function compactSpan(cellCount: number): string {
  const intervals = cellCount - 1;
  // Reserve the widest possible line: six tiles, including one sideways
  // declaration between the two end half-cells.
  return `calc(var(--river-tile-height) * 2 + var(--river-tile-width) * ${cellCount - 2} + ${intervals * GAP}px)`;
}

function fullSpan(cellCount: number): string {
  return `calc(var(--river-tile-height) * ${cellCount} + ${(cellCount - 1) * GAP}px)`;
}

/**
 * Pack each line from the actual displayed face lengths. Ordinary neighbors
 * keep a 1px edge gap; a sideways declaration adds its extra face length only
 * to the following tile on that line. Across lines, reserve a full tile length.
 */
export function calculateRiverLayout(
  position: RiverPosition,
  discardCount: number,
  declarationIndex = -1,
): RiverLayout {
  if (!Number.isSafeInteger(discardCount) || discardCount < 0) {
    throw new RangeError('River discard count must be a non-negative safe integer');
  }
  if (!Number.isInteger(declarationIndex) || declarationIndex < -1 || declarationIndex >= discardCount) {
    throw new RangeError('Riichi declaration must refer to a discard in the river');
  }

  const side = position === 'right' || position === 'left';
  // Eighteen is the usual exhaustive-draw river length. Calls can alter turn
  // distribution, so the layout grows by rows instead of enforcing a game cap.
  const rows = Math.max(MIN_ROWS, Math.ceil(discardCount / COLUMNS));
  const width = side ? fullSpan(rows) : compactSpan(COLUMNS);
  const height = side ? compactSpan(COLUMNS) : fullSpan(rows);
  const centerInSlot = (face: string): string => `calc((var(--river-tile-height) - var(${face})) * .5)`;
  const add = (offset: string, centered: string): string => offset === '0px'
    ? centered
    : `calc(${offset} + ${centered})`;

  const slots = Array.from({ length: discardCount }, (_, index) => {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    // Keep the traditional three rows exactly where they have always been.
    // Additional coordinates continue each river in its seat-relative direction.
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
    return {
      row: screenRow,
      column: screenColumn,
      declaration,
      widthFace,
      heightFace,
    };
  });

  const declarationSlot = slots.find(slot => slot.declaration);
  const placements = slots.map(slot => {
    const line = side ? slot.column : slot.row;
    const axis = side ? slot.row : slot.column;
    const declarationLine = declarationSlot && (side ? declarationSlot.column : declarationSlot.row);
    const declarationAxis = declarationSlot && (side ? declarationSlot.row : declarationSlot.column);
    const declarationFirst = declarationLine === line && declarationAxis === 0;
    const declarationBefore = declarationLine === line && declarationAxis !== undefined && declarationAxis < axis;
    const compactPosition = compactOffset(axis, declarationFirst, declarationBefore);
    const leftInSlot = side
      ? add(fullOffset(slot.column), centerInSlot(slot.widthFace))
      : compactPosition;
    const topInSlot = side
      ? compactPosition
      : add(fullOffset(slot.row), centerInSlot(slot.heightFace));

    return {
      row: slot.row,
      column: slot.column,
      declaration: slot.declaration,
      width: `var(${slot.widthFace})`,
      height: `var(${slot.heightFace})`,
      left: leftInSlot,
      top: topInSlot,
    };
  });
  return { rows, width, height, placements };
}

export function applyRiverLayout(container: HTMLElement, layout: RiverLayout): void {
  container.style.display = 'block';
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';
  container.dataset.riverRows = String(layout.rows);
  if (layout.rows > 4) {
    // Keep exceptional long rivers inside roughly the four-row footprint.
    // Normal 1–24 tile rivers retain their original face dimensions.
    const scale = Math.min(4 / layout.rows, 1.15 / (.76 * (layout.rows - 3)));
    container.style.setProperty('--river-tile-width', `calc(var(--table-tile-width) * .76 * ${scale})`);
    container.style.setProperty('--river-tile-height', `calc(var(--table-tile-height) * .76 * ${scale})`);
  } else {
    container.style.removeProperty('--river-tile-width');
    container.style.removeProperty('--river-tile-height');
  }
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
