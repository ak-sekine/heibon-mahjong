import type { SeatWind } from '../model/game.ts';

export type SeatLabelView = Readonly<{
  name: string;
  wind: SeatWind;
  points: number;
  isDealer: boolean;
  isSelf: boolean;
  isActive: boolean;
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

/** Render the same player identity, wind, status, and score in both game modes. */
export function renderSeatLabel(label: HTMLElement, view: SeatLabelView): void {
  label.className = 'seat-label';
  label.dataset.active = String(view.isActive);
  label.dataset.self = String(view.isSelf);

  const name = span('seat-name', view.name);
  const details = document.createElement('span');
  details.className = 'seat-details';
  details.append(span('seat-wind', WIND_LABELS[view.wind]));
  if (view.isSelf && view.name !== '自分') details.append(span('seat-self-marker', '自分'));
  if (view.isDealer) details.append(span('seat-role', '親'));
  if (view.isRiichi) details.append(span('seat-status', 'リーチ'));
  if (view.isConnected === false) details.append(span('seat-status', '切断中'));

  const score = span('seat-points', `${view.points.toLocaleString('ja-JP')}点`);
  label.replaceChildren(name, details, score);
}

export type TableRoundView = Readonly<{
  roundNumber: number;
  honba: number;
  liveWallCount: number;
  deadWallCount?: number;
}>;

export function renderRoundLabel(roundLabel: HTMLElement, view: Pick<TableRoundView, 'roundNumber' | 'honba'>): void {
  roundLabel.textContent = `東${view.roundNumber}局${view.honba > 0 ? ` ${view.honba}本場` : ''}`;
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
