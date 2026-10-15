import type { PhysicalTile } from '../model/game.ts';
import { ordinaryTile } from '../model/tile.ts';
import { doraKindFromIndicator } from '../analysis/dora.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';

/** Result-only row. Callers must supply only indicators this winner may see. */
export function createResultDoraRow(indicators: readonly PhysicalTile[], ura: boolean): HTMLElement {
  if (indicators.length > 5) throw new RangeError('At most five dora indicators');
  const row = document.createElement('div');
  row.className = `result-dora ${ura ? 'ura-dora-result' : 'omote-dora-result'}`;
  const name = ura ? '裏ドラ表示牌' : 'ドラ表示牌';
  const bonus = ura ? '裏ドラ' : 'ドラ';
  const heading = document.createElement('h3');
  heading.textContent = name;
  const slots = document.createElement('div');
  slots.className = 'result-dora-slots';
  const descriptions: string[] = [];
  for (let index = 0; index < 5; index++) {
    const slot = document.createElement('div');
    slot.className = 'result-dora-slot';
    slot.setAttribute('role', 'img');
    const indicator = indicators[index];
    if (indicator) {
      const indicatorName = tileLabel(indicator.tile);
      const doraName = tileLabel(ordinaryTile(doraKindFromIndicator(indicator.tile)));
      slot.dataset.tileId = indicator.id;
      slot.setAttribute('aria-label', `${name}${index + 1}：${indicatorName}、${bonus}：${doraName}`);
      const svg = createTileElement(indicator.tile);
      svg.setAttribute('aria-hidden', 'true');
      slot.append(svg);
      descriptions.push(`表示牌${index + 1}：${indicatorName} → ${bonus}：${doraName}`);
    } else {
      slot.className += ' result-dora-placeholder';
      slot.setAttribute('aria-label', `${name}${index + 1}：未使用枠`);
    }
    slots.append(slot);
  }
  const explanation = document.createElement('p');
  explanation.className = 'result-dora-description';
  explanation.textContent = descriptions.join('／');
  // Each slot already provides the same information to assistive technology.
  explanation.setAttribute('aria-hidden', 'true');
  row.append(heading, slots, explanation);
  return row;
}

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
