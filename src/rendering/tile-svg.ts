import type { Tile, Honor, Rank } from '../model/tile.ts';

const HONOR_LABELS: Record<Honor, string> = {
  east: '東', south: '南', west: '西', north: '北', white: '白', green: '發', red: '中',
};
const SUIT_LABELS = { man: '萬', pin: '筒', sou: '索' } as const;
const INK = '#304641';
const BLUE = '#316482';
const GREEN = '#277451';
const RED = '#c64246';

export function tileLabel(tile: Tile): string {
  return tile.category === 'honor' ? HONOR_LABELS[tile.honor]
    : `${tile.isRed ? '赤' : ''}${tile.rank}${SUIT_LABELS[tile.suit]}`;
}

type Point = readonly [number, number];
// Base positions; seven and eight use the traditional suit-specific layouts.
const PATTERNS: Record<Rank, readonly Point[]> = {
  1: [[30, 42]],
  2: [[30, 25], [30, 59]],
  3: [[17, 22], [30, 42], [43, 62]],
  4: [[17, 25], [43, 25], [17, 59], [43, 59]],
  5: [[17, 22], [43, 22], [30, 42], [17, 62], [43, 62]],
  6: [[17, 22], [43, 22], [17, 42], [43, 42], [17, 62], [43, 62]],
  7: [[16, 18], [30, 28], [44, 38], [17, 51], [43, 51], [17, 66], [43, 66]],
  8: [[17, 16], [43, 16], [17, 33], [43, 33], [17, 51], [43, 51], [17, 68], [43, 68]],
  9: [[16, 22], [30, 22], [44, 22], [16, 42], [30, 42], [44, 42], [16, 62], [30, 62], [44, 62]],
};

function circleMark([x, y]: Point, radius: number, color: string, centerColor = color): string {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>
    <circle cx="${x}" cy="${y}" r="${radius * .57}" fill="#fffdf7"/>
    <circle cx="${x}" cy="${y}" r="${radius * .24}" fill="${centerColor}"/>`;
}

function bambooMark([x, y]: Point, height: number, color: string): string {
  return `<g transform="translate(${x} ${y})">
    <rect x="-3.3" y="${-height / 2}" width="6.6" height="${height}" rx="2.8" fill="${color}"/>
    <path d="M-4.4 ${-height / 2 + 3}h8.8M-4.4 ${height / 2 - 3}h8.8" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M-.8 ${-height / 2 + 4}v${height - 8}" stroke="#fffdf7" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
  </g>`;
}

// Original peacock: a spread tail with eyespots, slender neck and a small crest.
function bambooBird(): string {
  const feathers: readonly Point[] = [[12, 32], [19, 23], [30, 19], [41, 23], [48, 32]];
  return `<g stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 59Q8 54 8 34Q7 23 17 24Q16 12 26 16Q30 9 34 16Q44 12 43 24Q53 23 52 34Q52 54 30 59Z" fill="${GREEN}"/>
    ${feathers.map(([x, y]) => `<path d="M30 56L${x} ${y}" stroke="#fffdf7" stroke-width="1.5"/><ellipse cx="${x}" cy="${y}" rx="3.5" ry="4.5" fill="${BLUE}" stroke="#fffdf7" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="1.3" fill="${RED}"/>`).join('')}
    <path d="M24 56Q20 49 28 44Q36 40 34 31L33 24Q33 19 38 19Q43 19 43 24Q42 28 39 29L40 44Q43 56 32 61Z" fill="${BLUE}" stroke="#fffdf7" stroke-width="1.5"/>
    <path d="M42 23L49 26L42 28Z" fill="${RED}"/>
    <path d="M36 18L34 13M38 17V12M40 18L42 13" stroke="${BLUE}" stroke-width="2"/>
    <circle cx="39" cy="23" r="1.2" fill="#fffdf7"/>
    <path d="M26 49Q33 46 35 50L29 56" fill="none" stroke="#fffdf7" stroke-width="1.8"/>
    <path d="M27 61L25 69M34 61L36 69M22 70H29M33 70H40" stroke="${GREEN}" stroke-width="2.2"/>
  </g>`;
}

const SEVEN_BAMBOO: readonly Point[] = [[30, 19], [16, 41], [30, 41], [44, 41], [16, 63], [30, 63], [44, 63]];
// Four upright marks flank four diagonal marks forming a central diamond.
const EIGHT_BAMBOO: readonly Point[] = [[12, 23], [48, 23], [12, 61], [48, 61], [24, 32], [36, 32], [24, 52], [36, 52]];
const EIGHT_BAMBOO_ANGLES = [0, 0, 0, 0, 38, -38, -38, 38] as const;

/** Original local vector artwork; fixed 60:84 ratio and no external assets. */
export function tileSvgMarkup(tile: Tile): string {
  const label = tileLabel(tile);
  let face: string;
  if (tile.category === 'honor') {
    const color = tile.honor === 'green' ? GREEN : tile.honor === 'red' ? RED : INK;
    face = tile.honor === 'white'
      ? ''
      : `<text x="30" y="58" font-size="44" fill="${color}">${HONOR_LABELS[tile.honor]}</text>`;
  } else if (tile.suit === 'man') {
    face = `<text x="30" y="34" font-size="32" fill="${tile.isRed ? RED : INK}">${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][tile.rank]}</text>
      <text x="30" y="69" font-size="33" fill="${RED}">萬</text>`;
  } else if (tile.suit === 'sou' && tile.rank === 1) {
    face = bambooBird();
  } else {
    const points = tile.suit === 'sou' && tile.rank === 7 ? SEVEN_BAMBOO
      : tile.suit === 'sou' && tile.rank === 8 ? EIGHT_BAMBOO : PATTERNS[tile.rank];
    face = points.map((point, i) => {
      if (tile.suit === 'pin') {
        const redMark = (tile.rank === 3 && i === 1)
          || (tile.rank === 5 && i === 2) || (tile.rank === 6 && i >= 2)
          || (tile.rank === 7 && i >= 3) || (tile.rank === 9 && i >= 3 && i <= 5);
        const color = tile.isRed || redMark ? RED : BLUE;
        return circleMark(point, tile.rank === 1 ? 18 : tile.rank >= 7 ? 5.7 : 7.2, color, tile.rank === 1 ? RED : color);
      }
      const redMark = (tile.rank === 5 && i === 2) || (tile.rank === 7 && i === 0)
        || (tile.rank === 9 && i % 3 === 1);
      const mark = bambooMark(point, tile.rank === 8 ? 18 : 16, tile.isRed || redMark ? RED : GREEN);
      // Keep the outer four upright and leave space around the central diamond.
      return tile.rank === 8
        ? `<g transform="rotate(${EIGHT_BAMBOO_ANGLES[i]} ${point[0]} ${point[1]})">${mark}</g>` : mark;
    }).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" role="img" aria-label="${label}" class="tile-svg">
    <title>${label}</title>
    <rect x="1" y="2" width="58" height="81" rx="6" fill="#dfd9c9"/>
    <rect x="1" y="1" width="58" height="78" rx="6" fill="#fffdf7" stroke="${tile.category === 'honor' && tile.honor === 'white' ? '#8fa49b' : '#c4c7bb'}" stroke-width="${tile.category === 'honor' && tile.honor === 'white' ? 1.8 : 1}"/>
    <path d="M8 3h44" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <g text-anchor="middle" font-family="'Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', sans-serif" font-weight="700">${face}</g>
    ${tile.isRed ? `<path d="M48 4h7v7Z" fill="${RED}"/>` : ''}
  </svg>`;
}

export function createTileElement(tile: Tile): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = tileSvgMarkup(tile);
  return template.content.firstElementChild as SVGSVGElement;
}

export function wrapRiverTileFace(face: SVGSVGElement): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'river-tile-face';
  wrapper.append(face);
  return wrapper;
}
