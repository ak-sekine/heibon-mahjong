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

/** Two independent five-slot rows. Callers supply only public indicators;
 * an empty ura list omits its row entirely, including on round reset. */
export function renderDoraIndicators(region: HTMLElement, exposed: readonly PhysicalTile[], ura: readonly PhysicalTile[] = []): void {
  if (exposed.length > 5) throw new RangeError('At most five dora indicators');
  if (ura.length > 5) throw new RangeError('At most five ura indicators');
  const uraCount = Math.min(ura.length, exposed.length);
  region.replaceChildren(...Array.from({ length: uraCount ? 10 : 5 }, (_, position) => {
    const index = position % 5;
    const item = document.createElement('div');
    const isUra = position >= 5;
    const physical = isUra ? (index < uraCount ? ura[index] : undefined) : exposed[index];
    item.className = isUra ? 'dora-slot ura-indicator' : 'dora-slot';
    if (!physical) {
      item.className += ' tile-back';
      item.setAttribute('role', 'img');
      item.setAttribute('aria-label', `未公開の${isUra ? '裏ドラ' : 'ドラ'}表示牌${index + 1}`);
      return item;
    }
    const indicatorName = tileLabel(physical.tile);
    const doraName = tileLabel(ordinaryTile(doraKindFromIndicator(physical.tile)));
    item.dataset.tileId = physical.id;
    item.setAttribute('role', 'group');
    item.setAttribute('aria-label', isUra ? `裏ドラ表示牌${index + 1}：${indicatorName}` : `ドラ表示牌${index + 1}：${indicatorName}、ドラ：${doraName}`);
    const label = document.createElement('span');
    label.textContent = `${isUra ? '裏' : '表'}表示牌${index + 1}`;
    const svg = createTileElement(physical.tile);
    svg.setAttribute('aria-label', `ドラ表示牌：${indicatorName}`);
    const dora = document.createElement('span');
    dora.className = 'dora-kind';
    dora.textContent = isUra ? '裏ドラ' : `ドラ：\n${doraName}`;
    item.append(label, svg, dora);
    return item;
  }));
}
