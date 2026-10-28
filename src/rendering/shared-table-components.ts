import type { SeatWind } from '../model/game.ts';

export type SeatLabelView = Readonly<{
  name: string;
  wind: SeatWind;
  points: number;
  isDealer: boolean;
  isSelf: boolean;
  isActive: boolean;
  displayOrder: number;
  isRiichi: boolean;
  isConnected?: boolean;
}>;

const WIND_LABELS: Readonly<Record<SeatWind, string>> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

function span(className: string, content: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = content;
  return node;
}

/** Render one compact player row shared by offline and online tables. */
export function renderSeatLabel(label: HTMLElement, view: SeatLabelView): void {
  label.className = 'seat-label';
  label.dataset.active = String(view.isActive);
  label.dataset.self = String(view.isSelf);
  label.dataset.displayOrder = String(view.displayOrder);

  const name = span('seat-name', view.name);
  name.title = view.name;
  name.setAttribute('aria-label', view.name);
  const details = document.createElement('span');
  details.className = 'seat-details';
  details.append(span('seat-wind', WIND_LABELS[view.wind]));
  if (view.isDealer) details.append(span('seat-role', '・親'));

  const score = span('seat-points', `${view.points.toLocaleString('ja-JP')}点`);
  label.replaceChildren(name, details, score);

  // DOM order also carries the screen-reader order: viewer/self first, then
  // the other seats in relative turn order.
  const strip = label.parentElement;
  if (strip?.classList.contains('score-strip')) {
    const rows = Array.from(strip.children)
      .filter((child): child is HTMLElement => child.classList.contains('seat-label'))
      .sort((first, second) => Number(first.dataset.displayOrder) - Number(second.dataset.displayOrder));
    strip.append(...rows);
  }
}

export type TableRoundView = Readonly<{
  roundNumber: number;
  honba: number;
  liveWallCount: number;
  deadWallCount?: number;
}>;

export function renderRoundLabel(roundLabel: HTMLElement, view: Pick<TableRoundView, 'roundNumber' | 'honba'> & { roundWind?: 'east' | 'south' }): void {
  const wind = view.roundWind === 'south' ? '南' : '東';
  roundLabel.textContent = `${wind}${view.roundNumber}局${view.honba > 0 ? ` ${view.honba}本場` : ''}`;
  roundLabel.setAttribute('aria-label', roundLabel.textContent);
  roundLabel.title = roundLabel.textContent;
}

export function renderWallCount(wallCount: HTMLElement, view: Pick<TableRoundView, 'liveWallCount' | 'deadWallCount'>): void {
  const live = span('wall-live-count', `山${view.liveWallCount}枚`);
  const dead = view.deadWallCount === undefined
    ? null
    : span('wall-dead-count', `王牌 ${view.deadWallCount}枚`);
  wallCount.replaceChildren(live, ...(dead ? [dead] : []));
}

/** Keep the round and wall readout in the same central panel in both modes. */
export function renderTableRoundInfo(
  roundLabel: HTMLElement,
  wallCount: HTMLElement,
  view: TableRoundView,
): void {
  renderRoundLabel(roundLabel, view);
  renderWallCount(wallCount, view);
}

export function setActionStatus(status: HTMLElement, message: string): void {
  status.textContent = message;
}
