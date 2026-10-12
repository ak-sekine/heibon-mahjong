import type { Tile, Honor } from '../model/tile.ts';

const HONOR_LABELS: Record<Honor, string> = {
  east: '東', south: '南', west: '西', north: '北', white: '白', green: '發', red: '中',
};
const SUIT_LABELS = { man: '萬', pin: '筒', sou: '索' } as const;

export function tileLabel(tile: Tile): string {
  return tile.category === 'honor' ? HONOR_LABELS[tile.honor]
    : `${tile.isRed ? '赤' : ''}${tile.rank}${SUIT_LABELS[tile.suit]}`;
}

/** Local vector shapes, a fixed 60:84 ratio, and text (never Mahjong emoji). */
export function tileSvgMarkup(tile: Tile): string {
  const label = tileLabel(tile);
  const color = tile.isRed ? '#bd2835' : tile.category === 'suited'
    ? { man: '#263b35', pin: '#245b91', sou: '#19704d' }[tile.suit]
    : tile.honor === 'green' ? '#19704d' : tile.honor === 'red' ? '#bd2835' : '#263b35';
  let face: string;
  if (tile.category === 'honor') {
    face = tile.honor === 'white'
      ? '<rect x="13" y="19" width="34" height="43" rx="2" fill="none" stroke="#245b91" stroke-width="3"/><text x="30" y="48" font-size="22">白</text>'
      : `<text x="30" y="57" font-size="40">${HONOR_LABELS[tile.honor]}</text>`;
  } else {
    const rank = `<text x="30" y="29" font-size="27" font-family="Arial, sans-serif">${tile.rank}</text>`;
    if (tile.suit === 'man') {
      face = `${rank}<text x="30" y="65" font-size="32">萬</text>`;
    } else {
      const points = Array.from({ length: tile.rank }, (_, i) => {
        const columns = tile.rank <= 3 ? 1 : tile.rank <= 6 ? 2 : 3;
        const rows = Math.ceil(tile.rank / columns);
        return { x: 30 + (i % columns - (columns - 1) / 2) * 15,
          y: 52 + (Math.floor(i / columns) - (rows - 1) / 2) * 13 };
      });
      const marks = points.map(({ x, y }) => tile.suit === 'pin'
        ? `<circle cx="${x}" cy="${y}" r="4.6" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="1.4"/>`
        : `<path d="M${x - 2} ${y - 4}v8m4-8v8m-5-6h6m-6 4h6" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`).join('');
      face = `${rank}${marks}<text x="30" y="75" font-size="9">${SUIT_LABELS[tile.suit]}</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" role="img" aria-label="${label}" class="tile-svg">
    <title>${label}</title>
    <rect x="1" y="1" width="58" height="82" rx="5" fill="#d9d3c3"/>
    <rect x="1" y="1" width="58" height="77" rx="5" fill="#fffdf5" stroke="#b4b7a7"/>
    <g fill="${color}" text-anchor="middle" font-family="'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', serif" font-weight="700">${face}</g>
    ${tile.isRed ? '<path d="M47 4h9v9Z" fill="#bd2835"/>' : ''}
  </svg>`;
}

export function createTileElement(tile: Tile): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = tileSvgMarkup(tile);
  return template.content.firstElementChild as SVGSVGElement;
}
