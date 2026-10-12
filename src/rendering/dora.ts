import type { PhysicalTile } from '../model/game.ts';
import { ordinaryTile } from '../model/tile.ts';
import { doraKindFromIndicator } from '../analysis/dora.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';

/** Accept only public indicators, never the dead wall or hidden ura tiles. */
export function renderDoraIndicators(region: HTMLElement, exposed: readonly PhysicalTile[]): void {
  if (exposed.length > 5) throw new RangeError('At most five dora indicators');
  region.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const item = document.createElement('div');
    const physical = exposed[index];
    item.className = 'dora-slot';
    if (!physical) {
      item.className += ' dora-placeholder';
      item.setAttribute('role', 'img');
      item.setAttribute('aria-label', `未公開のドラ表示牌${index + 1}`);
      return item;
    }
    const indicatorName = tileLabel(physical.tile);
    const doraName = tileLabel(ordinaryTile(doraKindFromIndicator(physical.tile)));
    item.dataset.tileId = physical.id;
    item.setAttribute('role', 'group');
    item.setAttribute('aria-label', `ドラ表示牌${index + 1}：${indicatorName}、ドラ：${doraName}`);
    const label = document.createElement('span');
    label.textContent = `表示牌${index + 1}`;
    const svg = createTileElement(physical.tile);
    svg.setAttribute('aria-label', `ドラ表示牌：${indicatorName}`);
    const dora = document.createElement('span');
    dora.className = 'dora-kind';
    dora.textContent = `ドラ：\n${doraName}`;
    item.append(label, svg, dora);
    return item;
  }));
}
