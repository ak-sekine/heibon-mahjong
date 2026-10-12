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
// Symmetric arrangements keep every count recognizable at hand size.
const PATTERNS: Record<Rank, readonly Point[]> = {
  1: [[30, 42]],
  2: [[30, 25], [30, 59]],
  3: [[17, 22], [30, 42], [43, 62]],
  4: [[17, 25], [43, 25], [17, 59], [43, 59]],
  5: [[17, 22], [43, 22], [30, 42], [17, 62], [43, 62]],
  6: [[17, 22], [43, 22], [17, 42], [43, 42], [17, 62], [43, 62]],
  7: [[16, 20], [30, 20], [44, 20], [20, 42], [40, 42], [20, 63], [40, 63]],
  8: [[17, 16], [43, 16], [17, 33], [43, 33], [17, 51], [43, 51], [17, 68], [43, 68]],
  9: [[16, 22], [30, 22], [44, 22], [16, 42], [30, 42], [44, 42], [16, 62], [30, 62], [44, 62]],
};

function circleMark([x, y]: Point, radius: number, color: string): string {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>
    <circle cx="${x}" cy="${y}" r="${radius * .57}" fill="#fffdf7"/>
    <circle cx="${x}" cy="${y}" r="${radius * .24}" fill="${color}"/>`;
}

function bambooMark([x, y]: Point, height: number, color: string): string {
  return `<g transform="translate(${x} ${y})">
    <rect x="-3.3" y="${-height / 2}" width="6.6" height="${height}" rx="2.8" fill="${color}"/>
    <path d="M-4.4 ${-height / 2 + 3}h8.8M-4.4 ${height / 2 - 3}h8.8" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M-.8 ${-height / 2 + 4}v${height - 8}" stroke="#fffdf7" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
  </g>`;
}

// An original, simple bird silhouette for the traditional one bamboo tile.
function bambooBird(): string {
  return `<g fill="${GREEN}" stroke-linejoin="round">
    <path d="M26 47Q15 46 12 37Q23 38 29 32Q38 28 42 39Q47 57 28 61L17 70L21 57Q18 53 26 47Z"/>
    <path d="M28 34Q24 22 31 17Q41 13 44 22L42 35Z"/>
    <path d="M42 22L51 26L42 29Z" fill="${RED}"/>
    <path d="M28 42Q33 39 36 42Q38 49 29 53" fill="none" stroke="#fffdf7" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="37" cy="22" r="1.9" fill="#fffdf7"/><circle cx="37.4" cy="22" r=".9" fill="${INK}"/>
    <path d="M29 60v7m8-10v10m-11 0h7m1 0h7" fill="none" stroke="${GREEN}" stroke-width="2.3" stroke-linecap="round"/>
  </g>`;
}

/** Original local vector artwork; fixed 60:84 ratio and no external assets. */
export function tileSvgMarkup(tile: Tile): string {
  const label = tileLabel(tile);
  let face: string;
  if (tile.category === 'honor') {
    const color = tile.honor === 'green' ? GREEN : tile.honor === 'red' ? RED : INK;
    face = tile.honor === 'white'
      ? '<rect x="12" y="15" width="36" height="53" rx="4" fill="#fffefa" stroke="#8fa8b5" stroke-width="2.5"/><rect x="16" y="19" width="28" height="45" rx="2" fill="none" stroke="#dce5e8" stroke-width="1.2"/>'
      : `<text x="30" y="58" font-size="44" fill="${color}">${HONOR_LABELS[tile.honor]}</text>`;
  } else if (tile.suit === 'man') {
    face = `<text x="30" y="34" font-size="32" fill="${tile.isRed ? RED : INK}">${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][tile.rank]}</text>
      <text x="30" y="69" font-size="33" fill="${RED}">萬</text>`;
  } else if (tile.suit === 'sou' && tile.rank === 1) {
    face = bambooBird();
  } else {
    face = PATTERNS[tile.rank].map((point, i) => {
      if (tile.suit === 'pin') {
        const color = tile.isRed ? RED : tile.rank === 5 && i === 2 ? RED : BLUE;
        return circleMark(point, tile.rank === 1 ? 18 : tile.rank >= 7 ? 5.7 : 7.2, color);
      }
      return bambooMark(point, tile.rank === 8 ? 13 : 16, tile.isRed ? RED : GREEN);
    }).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" role="img" aria-label="${label}" class="tile-svg">
    <title>${label}</title>
    <rect x="1" y="2" width="58" height="81" rx="6" fill="#dfd9c9"/>
    <rect x="1" y="1" width="58" height="78" rx="6" fill="#fffdf7" stroke="#c4c7bb" stroke-width="1"/>
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
