export type ActionPanelMode = 'local' | 'online';

const LOCAL_IDS: Readonly<Record<string, string>> = {
  root: 'local-game-controls',
  'call-controls': 'call-controls',
  'call-status': 'call-status',
  'call-options': 'call-options',
  'pass-call': 'pass-calls',
  'kan-controls': 'kan-controls',
  'kan-toggle': 'kan',
  'kan-options': 'kan-options',
  'cancel-kan': 'cancel-kan',
  'ron-controls': 'ron-controls',
  'ron-status': 'ron-status',
  'ron-target': 'ron-target',
  ron: 'ron',
  'pass-ron': 'pass-ron',
  'action-status': 'selection-status',
  discard: 'discard',
  riichi: 'riichi',
  tsumo: 'tsumo',
  kyuushu: 'kyuushu-kyuuhai',
  'round-actions': 'round-result-actions',
  'show-result': 'show-result',
  'next-round': 'next-round',
  'return-local': 'local-return-local',
};

const ONLINE_IDS: Readonly<Record<string, string>> = {
  root: 'online-game-controls',
  'call-controls': 'online-call-controls',
  'call-status': 'online-call-status',
  'call-options': 'online-call-options',
  'pass-call': 'online-pass-call',
  'kan-controls': 'online-kan-controls',
  'kan-toggle': 'online-kan',
  'kan-options': 'online-kan-options',
  'cancel-kan': 'online-cancel-kan',
  'ron-controls': 'online-ron-controls',
  'ron-status': 'online-ron-status',
  'ron-target': 'online-ron-target',
  ron: 'online-ron',
  'pass-ron': 'online-pass-ron',
  'action-status': 'online-game-action-status',
  discard: 'online-discard',
  riichi: 'online-riichi',
  tsumo: 'online-tsumo',
  kyuushu: 'online-kyuushu',
  'round-actions': 'online-round-result-actions',
  'show-result': 'online-show-result',
  'next-round': 'online-next-round',
  'return-local': 'online-return-local',
};

/** Required data parts in the shared HTML template, used by its contract test. */
export const ACTION_PANEL_TEMPLATE_PARTS = Object.freeze(
  [...new Set([...Object.keys(LOCAL_IDS), ...Object.keys(ONLINE_IDS)])],
);

/** Clone the shared controls component; game modes keep their own event handlers. */
export function mountActionPanel(host: HTMLElement, mode: ActionPanelMode): HTMLElement {
  const template = document.querySelector<HTMLTemplateElement>('#game-controls-template');
  if (!template?.content.firstElementChild) throw new Error('Game controls template is missing');
  const root = template.content.firstElementChild.cloneNode(true) as HTMLElement;
  const ids = mode === 'online' ? ONLINE_IDS : LOCAL_IDS;
  for (const [part, id] of Object.entries(ids)) {
    const node = part === 'root'
      ? root
      : root.querySelector<HTMLElement>(`[data-panel-part="${part}"]`);
    if (!node) throw new Error(`Game controls part is missing: ${part}`);
    node.id = id;
  }
  root.setAttribute('aria-label', mode === 'online' ? 'オンライン対局の操作' : '打牌操作');
  host.replaceWith(root);
  return root;
}
