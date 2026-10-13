export type DepositDenomination = 1000 | 5000 | 10000;
export interface DepositDisplayStick {
  readonly points: DepositDenomination;
  readonly count: number;
}

/** Display-only exchange. The match continues to store 1000-point units. */
export function getDepositDisplaySticks(depositSticks: number): readonly DepositDisplayStick[] {
  if (!Number.isSafeInteger(depositSticks) || depositSticks < 0 || !Number.isSafeInteger(depositSticks * 1000)) {
    throw new RangeError('Deposit sticks must be a nonnegative safe integer amount');
  }
  let remaining = depositSticks;
  const result: DepositDisplayStick[] = [];
  for (const points of [10000, 5000, 1000] as const) {
    const units = points / 1000;
    const count = Math.floor(remaining / units);
    if (count) result.push(Object.freeze({ points, count }));
    remaining %= units;
  }
  return Object.freeze(result);
}

/** Ivory bodies match the tile faces; dot arrangements distinguish values. */
export function depositSvgMarkup(points: DepositDenomination): string {
  const dot = (x: number, y: number, radius: number, color: string) =>
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`;
  const marks = points === 1000 ? dot(30, 6, 2.3, '#bc2532')
    : points === 5000 ? [24, 30, 36].map(x => dot(x, 6, 1.7, '#bc2532')).join('')
    : [24, 30, 36].flatMap(x => [3.8, 8.2].map(y => dot(x, y, 1.3, '#172b64'))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 12" aria-hidden="true" focusable="false"><rect x=".5" y=".5" width="59" height="11" rx="2" fill="#fffdf7" stroke="#d6caa4"/><path d="M3 9.5h54" stroke="#e8dfc7"/>${marks}</svg>`;
}

export function renderDepositSticks(element: HTMLElement, depositSticks: number): void {
  const sticks = getDepositDisplaySticks(depositSticks);
  element.hidden = sticks.length === 0;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', `供託合計 ${depositSticks * 1000}点。${sticks.map(s => `${s.points}点棒${s.count}本`).join('、')}`);
  const children: HTMLElement[] = [];
  for (const stick of sticks) for (let i = 0; i < stick.count; i++) {
    const item = document.createElement('span');
    item.className = 'deposit-stick';
    item.dataset.points = String(stick.points);
    item.setAttribute('aria-hidden', 'true');
    item.innerHTML = depositSvgMarkup(stick.points);
    children.push(item);
  }
  element.replaceChildren(...children);
}
