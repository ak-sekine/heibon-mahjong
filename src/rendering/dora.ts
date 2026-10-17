import type { PhysicalTile } from '../model/game.ts';
import { ordinaryTile } from '../model/tile.ts';
import { doraKindFromIndicator } from '../analysis/dora.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';

const BACK_TILE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" aria-hidden="true"><rect x="1" y="1" width="58" height="82" rx="4" fill="#315877" stroke="#e5dfc5" stroke-width="2"/><rect x="5" y="5" width="50" height="74" rx="3" fill="none" stroke="#91abc0" stroke-width="2"/></svg>';

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
export function renderDoraIndicators(region: HTMLElement, exposed: readonly PhysicalTile[], ura: readonly PhysicalTile[] = []): void {
  if (exposed.length > 5) throw new RangeError('At most five dora indicators');
  if (ura.length > 5) throw new RangeError('At most five ura indicators');
  const uraCount = Math.min(ura.length, exposed.length);
  region.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const item = document.createElement('div');
    const isUra = index >= exposed.length && index < exposed.length + uraCount;
    const physical = isUra ? ura[index - exposed.length] : exposed[index];
    item.className = 'dora-slot';
    if (!physical) {
      item.className += ' tile-back';
      item.setAttribute('role', 'img');
      item.setAttribute('aria-label', `未公開のドラ表示牌${index + 1}`);
      item.setAttribute('aria-hidden', 'true');
      item.innerHTML = BACK_TILE;
      return item;
    }
    const indicatorName = tileLabel(physical.tile);
    const doraName = tileLabel(ordinaryTile(doraKindFromIndicator(physical.tile)));
    item.dataset.tileId = physical.id;
    item.setAttribute('role', 'group');
    item.setAttribute('aria-label', isUra ? `裏ドラ表示牌${index - exposed.length + 1}：${indicatorName}` : `ドラ表示牌${index + 1}：${indicatorName}、ドラ：${doraName}`);
    const label = document.createElement('span');
    label.textContent = `表示牌${index + 1}`;
    const svg = createTileElement(physical.tile);
    svg.setAttribute('aria-label', `ドラ表示牌：${indicatorName}`);
    const dora = document.createElement('span');
    dora.className = 'dora-kind';
    dora.textContent = isUra ? '裏ドラ' : `ドラ：\n${doraName}`;
    if (isUra) item.className += ' ura-indicator';
    item.append(label, svg, dora);
    return item;
  }));
}
