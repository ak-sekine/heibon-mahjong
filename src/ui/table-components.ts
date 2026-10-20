export type TableComponentMode = 'local' | 'online';

const SCORE_IDS: Readonly<Record<string, string>> = {
  top: 'label-2',
  right: 'label-1',
  bottom: 'label-0',
  left: 'label-3',
};

const TABLE_INFO_IDS: Readonly<Record<string, string>> = {
  round: 'table-round',
  wall: 'wall-count',
  dora: 'dora-indicators',
  deposits: 'deposit-sticks',
};

function cloneTemplate(selector: string): HTMLElement {
  const template = document.querySelector<HTMLTemplateElement>(selector);
  if (!template?.content.firstElementChild) throw new Error(`Table component template is missing: ${selector}`);
  return template.content.firstElementChild.cloneNode(true) as HTMLElement;
}

/** Mount the same four-seat score strip with local or viewer-relative bindings. */
export function mountScoreStrip(host: HTMLElement, mode: TableComponentMode): HTMLElement {
  const root = cloneTemplate('#score-strip-template');
  root.id = mode === 'local' ? 'local-table-summary' : 'online-table-summary';
  root.setAttribute('aria-label', mode === 'local' ? '点数と席情報' : 'オンライン卓の点数と席情報');
  if (mode === 'online') root.dataset.onlineSummary = '';
  const scoreStrip = root.querySelector<HTMLElement>('.score-strip');
  if (!scoreStrip) throw new Error('Score strip is missing');
  scoreStrip.id = mode === 'online' ? 'online-score-strip' : 'local-score-strip';
  for (const [position, localId] of Object.entries(SCORE_IDS)) {
    const label = root.querySelector<HTMLElement>(`[data-seat-position="${position}"]`);
    if (!label) throw new Error(`Score strip position is missing: ${position}`);
    if (mode === 'local') label.id = localId;
    else label.dataset.onlineLabel = position;
  }
  host.replaceWith(root);
  return root;
}

/** Mount the same round, wall, dora, and deposit panel in either table. */
export function mountTableInfoPanel(host: HTMLElement, mode: TableComponentMode): HTMLElement {
  const root = cloneTemplate('#table-info-template');
  if (mode === 'online') root.dataset.onlineCenterInfo = '';
  for (const [part, localId] of Object.entries(TABLE_INFO_IDS)) {
    const node = root.querySelector<HTMLElement>(`[data-table-info-part="${part}"]`);
    if (!node) throw new Error(`Table information part is missing: ${part}`);
    node.id = mode === 'local' ? localId : `online-${localId}`;
  }
  host.replaceWith(root);
  return root;
}
