import type { GameActionPayload } from './protocol.ts';
import type { PlayerGameView, PublicMeld, PublicTile } from './game-view.ts';
import { createTileElement, tileLabel, wrapRiverTileFace } from '../rendering/tile-svg.ts';
import { renderDepositSticks } from '../rendering/deposit-sticks.ts';
import { applyRiverLayout, applyRiverTilePlacement, calculateRiverLayout, riverPositionFor } from '../rendering/river-layout.ts';
import { renderDoraIndicators } from '../rendering/dora.ts';
import { renderSeatLabel, renderTableRoundInfo } from '../rendering/shared-table-components.ts';
import { TILE_KINDS, tileKindKey } from '../model/tile.ts';
import { ActionPanel, type ActionPanelEvent } from '../ui/action-panel.ts';
import { ResultDialog } from '../ui/result-dialog.ts';
import { createOnlineActionPanelState } from './action-panel-state.ts';
import { renderOnlineWinSummary } from './result-content.ts';
import { onlinePlayerName } from './player-name.ts';
import { DeclarationBubbleRenderer } from '../rendering/declaration-bubbles.ts';
import type { PublicDeclarationEvent } from '../model/declaration.ts';
import { collectRecentDeclarations } from './declaration-cursor.ts';
import { riichiRiverReference } from '../rendering/riichi-river-reference.ts';
import { diagnosticLog, recordGameRenderFailure } from './diagnostics.ts';

type ActionSender = (action: GameActionPayload, expectedGameRevision: number) => void;
type DecisionAction = { type: 'declare-ron' } | { type: 'pass-ron' } | { type: 'declare-call'; optionId: string } | { type: 'pass-call' };
function face(tile: PublicTile): SVGSVGElement {
  const svg = createTileElement(tile.tile);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function text(tag: string, content: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

function asView(value: unknown): PlayerGameView | null {
  if (!value || typeof value !== 'object') return null;
  const view = value as Partial<PlayerGameView>;
  if (view.type !== 'game-state' || !Number.isSafeInteger(view.gameRevision) ||
      !Number.isInteger(view.viewerSeat) || view.viewerSeat! < 0 || view.viewerSeat! > 3 ||
      view.self?.seat !== view.viewerSeat || !Array.isArray(view.seats) || view.seats.length !== 4 ||
      !['playing', 'round-ended', 'match-ended', 'aborted'].includes(String(view.status))) return null;
  const declarations = view.declarations;
  if (declarations !== undefined && (!Array.isArray(declarations) || declarations.some(event =>
    !event || !Number.isSafeInteger(event.id) || !Number.isInteger(event.roundNumber) ||
    !Number.isInteger(event.dealerId) || event.dealerId! < 0 || event.dealerId! > 3 ||
    !Number.isInteger(event.honba) || event.honba! < 0 ||
    !Number.isInteger(event.seat) || event.seat! < 0 || event.seat! > 3 ||
    !['riichi', 'pon', 'kan', 'chi', 'ron'].includes(String(event.kind)) ||
    !Number.isFinite(event.occurredAt)))) return null;
  return { ...view, declarations: (declarations ?? []) as readonly PublicDeclarationEvent[] } as PlayerGameView;
}

export class OnlineGameController {
  private readonly actionPanel: ActionPanel;
  private readonly root = document.querySelector<HTMLElement>('#online-match')!;
  private readonly table = document.querySelector<HTMLElement>('#online-table')!;
  private readonly scores = document.querySelector<HTMLElement>('#online-score-strip')!;
  private readonly playerHand = document.querySelector<HTMLUListElement>('#online-player-hand')!;
  private readonly declarationBubbles = new DeclarationBubbleRenderer(this.table);
  private view: PlayerGameView | null = null;
  private declarationCursor: number | null = null;
  private selectedTileId: string | null = null;
  private actionPending = false;
  private decisionPending = false;
  private actionNotice = '';
  private roomNotice = '';
  private roomNoticeTimer: number | null = null;
  private sender: ActionSender | null = null;
  private decisionCountdownTimer: number | null = null;
  private decisionWindowId: string | null = null;
  private kanChoicesOpen = false;
  private finalRanks: readonly Readonly<{ playerId: number; points: number; rank: number }>[] | null = null;
  private readonly tileOrder = new Map(TILE_KINDS.map((tile, index) => [tileKindKey(tile), index]));

  private setTableClasses(active: boolean): void {
    const set = (element: HTMLElement | null, activeClass: string, inactiveClass: string): void => {
      if (element) element.className = active ? activeClass : inactiveClass;
    };
    set(document.querySelector<HTMLElement>('#online-table'), 'table', 'online-table');
    set(this.root.querySelector<HTMLElement>('[data-online-summary]'), 'table-summary', 'online-table-summary');
    set(this.root.querySelector<HTMLElement>('[data-online-rivers]'), 'rivers', 'online-rivers');
    set(this.root.querySelector<HTMLElement>('[data-online-center-info]'), 'center-info', 'online-center-info');
    this.root.querySelectorAll<HTMLElement>('[data-online-seat]').forEach(node => {
      const position = node.dataset.onlineSeat;
      set(node, `seat seat-${position}`, `online-seat online-seat-${position}`);
    });
    this.root.querySelectorAll<HTMLElement>('[data-online-hand]').forEach(node => {
      set(node, 'concealed-hand', 'online-concealed-hand');
    });
    this.root.querySelectorAll<HTMLElement>('[data-online-melds]').forEach(node => {
      set(node, 'open-melds', 'online-open-melds');
    });
    this.root.querySelectorAll<HTMLElement>('[data-online-river]').forEach(node => {
      const position = node.dataset.onlineRiver;
      set(node, `river river-${position}`, `online-river online-river-${position}`);
    });
  }

  constructor(
    actionPanel: ActionPanel,
    private readonly resultDialog: ResultDialog,
    private readonly onSessionEnded: () => void = () => {},
  ) {
    this.actionPanel = actionPanel;
    this.actionPanel.setHandler(event => this.handleAction(event));
    this.playerHand.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
      if (!button || button.disabled) return;
      this.selectedTileId = this.selectedTileId === button.dataset.tileId ? null : button.dataset.tileId ?? null;
      this.render();
    });
  }

  private handleAction(event: ActionPanelEvent): void {
    switch (event.type) {
      case 'discard': {
        const tileId = this.discardTileId();
        if (tileId) this.send({ type: 'discard', tileId });
        break;
      }
      case 'riichi':
        if (this.selectedTileId) this.send({ type: 'declare-riichi', tileId: this.selectedTileId });
        break;
      case 'tsumo': this.send({ type: 'declare-tsumo' }); break;
      case 'kyuushu': this.send({ type: 'declare-kyuushu-kyuuhai' }); break;
      case 'ron': this.sendDecision({ type: 'declare-ron' }); break;
      case 'pass-ron': this.sendDecision({ type: 'pass-ron' }); break;
      case 'pass-call': this.sendDecision({ type: 'pass-call' }); break;
      case 'kan-toggle':
        this.kanChoicesOpen = true;
        this.render();
        break;
      case 'cancel-kan':
        this.kanChoicesOpen = false;
        this.render();
        break;
      case 'select-kan': this.send({ type: 'declare-kan', optionId: event.optionId }); break;
      case 'select-call': this.sendDecision({ type: 'declare-call', optionId: event.optionId }); break;
      case 'next-round': this.send({ type: 'next-round' }); break;
      case 'show-result': this.resultDialog.open(document.querySelector<HTMLButtonElement>('#online-show-result')); break;
      case 'return-local': this.returnToLocalGame(); break;
    }
  }

  setActionSender(sender: ActionSender): void { this.sender = sender; }

  receive(message: Record<string, unknown>): void {
    if (message.type === 'online-session-ended') {
      this.stopDecisionCountdown();
      this.clearRoomNotice();
      this.declarationBubbles.clearAll();
      this.clearRenderedGame();
      this.view = null;
      this.declarationCursor = null;
      this.finalRanks = null;
      this.actionPending = false;
      this.decisionPending = false;
      this.actionNotice = '';
      this.kanChoicesOpen = false;
      this.root.hidden = true;
      this.setTableClasses(false);
      document.body.classList.remove('online-game-active');
      this.resultDialog.updateOnline(null);
      document.querySelector<HTMLButtonElement>('#new-game')!.disabled = false;
      this.onSessionEnded();
      return;
    }
    if (message.type === 'seat-taken-over') {
      if (typeof message.departedName === 'string' && typeof message.cpuName === 'string') {
        const hostNotice = message.hostChanged === true && typeof message.hostName === 'string'
          ? ` 新ホストは${message.hostName}です。`
          : '';
        this.clearRoomNotice();
        this.roomNotice = `${message.departedName}が退出し、${message.cpuName}が席を引き継ぎました。${hostNotice}`;
        this.roomNoticeTimer = window.setTimeout(() => {
          this.roomNotice = '';
          this.roomNoticeTimer = null;
          if (this.view) this.renderActions(this.view);
        }, 8000);
        if (this.view) this.render();
      }
      return;
    }
    if (message.type === 'game-action-result') {
      this.actionPending = false;
      this.decisionPending = false;
      this.actionNotice = message.ok === false ? '操作が受け付けられませんでした。最新状態を確認してください。' : '';
      this.render();
      return;
    }
    if (message.type === 'game-aborted') {
      this.stopDecisionCountdown();
      this.actionPending = false;
      this.decisionPending = false;
      this.actionNotice = '';
      this.view = this.view ? {
        ...this.view,
        status: 'aborted',
        abortReason: 'participant-left',
        self: { ...this.view.self, decision: null },
      } : null;
      this.render();
      return;
    }
    if (message.type === 'round-ended' || message.type === 'match-ended') {
      if (message.type === 'match-ended' && Array.isArray(message.rankings)) {
        this.finalRanks = message.rankings as readonly Readonly<{ playerId: number; points: number; rank: number }>[];
      }
      return;
    }
    if (message.type !== 'game-state' && message.type !== 'game-started') return;
    const next = asView(message.view);
    if (!next) return;
    const replacesSession = message.type === 'game-started' && this.view !== null &&
      (next.roomCode !== this.view.roomCode || this.view.status !== 'playing' || next.gameRevision < this.view.gameRevision);
    if (this.view && next.gameRevision < this.view.gameRevision && !replacesSession) return;
    if (replacesSession) {
      this.declarationBubbles.clearAll();
      this.declarationCursor = null;
      this.view = null;
    }
    if (!this.view || this.declarationCursor === null) {
      this.declarationBubbles.clearAll();
    }
    if (!this.view || next.gameRevision !== this.view.gameRevision) {
      this.selectedTileId = null;
      this.kanChoicesOpen = false;
    }
    this.view = next;
    this.actionPending = false;
    this.decisionPending = false;
    this.actionNotice = '';
    this.setTableClasses(true);
    this.root.hidden = false;
    document.body.classList.add('online-game-active');
    document.body.dataset.gameMode = 'online';
    document.querySelector<HTMLButtonElement>('#new-game')!.disabled = true;
    this.render();
  }

  private send(action: GameActionPayload): void {
    const view = this.view;
    if (!view || !this.sender || this.actionPending ||
        (view.status !== 'playing' && !(action.type === 'next-round' && view.status === 'round-ended'))) return;
    this.actionPending = true;
    this.decisionPending = false;
    this.actionNotice = '';
    this.render();
    this.sender(action, view.gameRevision);
  }

  private sendDecision(action: DecisionAction): void {
    const view = this.view;
    const decision = view?.self.decision;
    if (!view || !decision || decision.answered || !this.sender || this.actionPending) return;
    this.actionPending = true;
    this.decisionPending = true;
    this.actionNotice = '';
    this.render();
    this.sender({ ...action, windowId: decision.windowId } as GameActionPayload, decision.expectedGameRevision);
  }

  private discardTileId(): string | null {
    const view = this.view;
    if (!view || this.actionPending) return null;
    const seat = view.seats[view.viewerSeat];
    if (seat.riichi) return seat.drawnTile?.id ?? null;
    return this.selectedTileId && view.self.discardableTileIds.includes(this.selectedTileId)
      ? this.selectedTileId : null;
  }

  private render(): void {
    const view = this.view;
    if (!view) return;
    let renderStage = 'riverLayout';
    try {
      const riverLayouts: ReturnType<typeof calculateRiverLayout>[] = view.seats.map(seat => {
        const position = riverPositionFor(view.viewerSeat, seat.seat);
        if (seat.riichi && !seat.riichiDeclarationTileId) {
          throw new RangeError(`Riichi declaration tile reference is missing from online seat ${seat.seat}`);
        }
        const declaration = riichiRiverReference(seat.seat, seat.river, seat.riichiDeclarationTileId,
          view.seats.flatMap(owner => owner.melds.map(meld => ({
            ownerSeat: owner.seat, type: meld.type, calledTileId: meld.calledTileId, fromPlayerId: meld.fromPlayerId, tiles: meld.tiles,
          }))));
        if (declaration.state === 'inconsistent') {
          throw new RangeError(`Riichi declaration tile is missing from online seat ${seat.seat}'s river`);
        }
        return calculateRiverLayout(position, seat.river.length, declaration.index);
      });
      renderStage = 'roundInfo';
      renderTableRoundInfo(
        document.querySelector<HTMLElement>('#online-table-round')!,
        document.querySelector<HTMLElement>('#online-wall-count')!,
        { ...view.round, liveWallCount: view.liveWallCount },
      );
      renderStage = 'seatLabels';
      this.renderSeatLabels(view);
      renderStage = 'handsAndMelds';
      this.renderHandsAndMelds(view);
      renderStage = 'rivers';
      this.renderRivers(view, riverLayouts);
      renderStage = 'declarationEvents';
      this.renderDeclarationEvents(view);
      renderStage = 'dora';
      this.renderDora(view);
      renderStage = 'result';
      this.renderResult(view);
      renderStage = 'actions';
      this.renderActions(view);
      renderStage = 'resultDialog';
      this.resultDialog.updateOnline(view);
    } catch (error) {
      recordGameRenderFailure(diagnosticLog, {
        turnId: `online-${view.gameRevision}`, seat: view.turnPlayerId, phase: view.phase,
        riverCounts: view.seats.map(seat => seat.river.length).join(','),
      }, error, `OnlineGameController.render>${renderStage}`);
      console.error('Online game render failed', { gameRevision: view.gameRevision, stage: renderStage });
      throw error;
    }
  }

  private renderDeclarationEvents(view: PlayerGameView): void {
    const batch = collectRecentDeclarations(this.declarationCursor, view.declarations, view.round, Date.now());
    this.declarationCursor = batch.cursor;
    for (const { event, remainingMs } of batch.recent) {
      const position = riverPositionFor(view.viewerSeat, event.seat);
      const river = document.querySelector<HTMLElement>(`[data-online-river="${position}"]`);
      if (river) this.declarationBubbles.show(
        event.seat,
        event.kind,
        position,
        river,
        remainingMs,
      );
    }
  }

  private renderSeatLabels(view: PlayerGameView): void {
    for (const seat of view.seats) {
      const position = riverPositionFor(view.viewerSeat, seat.seat);
      const label = this.scores.querySelector<HTMLElement>(`[data-online-label="${position}"]`);
      if (!label) continue;
      renderSeatLabel(label, {
        name: onlinePlayerName(view, seat.seat),
        wind: seat.wind,
        points: seat.points,
        isDealer: seat.isDealer,
        isSelf: seat.seat === view.viewerSeat,
        isActive: view.status === 'playing' && view.turnPlayerId === seat.seat,
        displayOrder: (seat.seat - view.viewerSeat + 4) % 4,
        isRiichi: seat.riichi,
        isConnected: seat.connected,
      });
    }
  }

  private renderHandsAndMelds(view: PlayerGameView): void {
    this.playerHand.replaceChildren();
    for (const seat of view.seats) {
      const position = riverPositionFor(view.viewerSeat, seat.seat);
      const handNode = document.querySelector<HTMLElement>(`[data-online-hand="${position}"]`);
      const meldNode = document.querySelector<HTMLElement>(`[data-online-melds="${position}"]`);
      const seatNode = document.querySelector<HTMLElement>(`[data-online-seat="${position}"]`);
      if (!handNode || !meldNode || !seatNode) continue;
      seatNode.className = `seat ${position === 'bottom' ? 'seat-bottom' : position === 'right' ? 'seat-right' : position === 'left' ? 'seat-left' : 'seat-top'}`;
      handNode.className = 'concealed-hand';
      const visible = seat.revealedHand;
      handNode.hidden = position === 'bottom' && !visible;
      this.playerHand.hidden = position === 'bottom' && Boolean(visible);
      meldNode.className = 'open-melds';
      meldNode.replaceChildren(...seat.melds.map(meld => this.renderMeld(meld, seat.seat)));
      handNode.replaceChildren();
      if (position === 'bottom' && seat.hand && !visible) {
        const sorted = [...seat.hand].sort((a, b) =>
          (this.tileOrder.get(tileKindKey(a.tile)) ?? 99) - (this.tileOrder.get(tileKindKey(b.tile)) ?? 99) ||
          Number(a.tile.isRed) - Number(b.tile.isRed) || a.id.localeCompare(b.id));
        for (const tile of sorted) this.playerHand.append(this.renderHandButton(tile, view));
        if (seat.drawnTile) {
          const item = document.createElement('li');
          item.className = 'drawn-tile';
          item.append(this.renderHandButton(seat.drawnTile, view));
          this.playerHand.append(item);
        }
        continue;
      }
      const tiles = visible ?? Array.from({ length: seat.concealedCount }, () => null);
      handNode.setAttribute('aria-label', `${onlinePlayerName(view, seat.seat)}の${visible ? '公開手牌' : '裏向き手牌'} ${tiles.length}枚`);
      for (const tile of tiles) {
        if (!tile) {
          const back = document.createElement('span');
          back.className = 'tile-back';
          back.setAttribute('aria-hidden', 'true');
          handNode.append(back);
        } else {
          const faceTile = document.createElement('span');
          faceTile.className = 'public-hand-tile';
          faceTile.append(face(tile));
          handNode.append(faceTile);
        }
      }
    }
  }

  private renderHandButton(tile: PublicTile, view: PlayerGameView): HTMLLIElement {
    const item = document.createElement('li');
    item.dataset.tileId = tile.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile-choice';
    button.dataset.tileId = tile.id;
    button.disabled = this.actionPending || !view.self.discardableTileIds.includes(tile.id);
    button.setAttribute('aria-label', tileLabel(tile.tile));
    button.setAttribute('aria-pressed', String(this.selectedTileId === tile.id));
    if (this.selectedTileId === tile.id) button.classList.add('selected');
    button.append(face(tile));
    item.append(button);
    return item;
  }

  private renderMeld(meld: PublicMeld, playerId: number): HTMLElement {
    const group = document.createElement('div');
    group.className = 'open-meld';
    group.dataset.meldType = meld.type;
    group.setAttribute('role', 'group');
    const direction = (meld.fromPlayerId - playerId + 4) % 4;
    group.dataset.fromDirection = String(direction);
    let calledIndex = -1;
    if (meld.type === 'chi') calledIndex = meld.tiles.findIndex(tile => tile?.id === meld.calledTileId);
    else if (meld.type !== 'ankan') calledIndex = direction === 3 ? 0 : direction === 2 ? 1 : meld.tiles.length - 1;
    meld.tiles.forEach((tile, index) => {
      const item = document.createElement('span');
      if (!tile) {
        item.className = 'concealed-kan-back';
        item.setAttribute('aria-label', '裏向き牌');
      } else {
        if (tile.id === meld.calledTileId) item.className = 'called-tile';
        item.append(face(tile));
        if (meld.type === 'kakan' && tile.id === meld.calledTileId) {
          const added = meld.tiles.find(candidate => candidate?.id === meld.addedTileId);
          if (added) {
            const overlay = document.createElement('span');
            overlay.className = 'added-kan-tile';
            overlay.append(face(added));
            item.append(overlay);
          }
        }
      }
      if (index === calledIndex) item.classList.add('called-tile');
      group.append(item);
    });
    return group;
  }

  private renderRivers(view: PlayerGameView, layouts: readonly ReturnType<typeof calculateRiverLayout>[]): void {
    for (const [seatIndex, seat] of view.seats.entries()) {
      const position = riverPositionFor(view.viewerSeat, seat.seat);
      const river = document.querySelector<HTMLElement>(`[data-online-river="${position}"]`);
      if (!river) continue;
      river.className = `river river-${position}`;
      const layout = layouts[seatIndex];
      applyRiverLayout(river, layout);
      river.replaceChildren(...seat.river.map((tile, index) => {
        const item = document.createElement('div');
        item.className = view.pendingDiscard?.seat === seat.seat && view.pendingDiscard.riverIndex === index
          ? 'river-tile pending-discard-target' : 'river-tile';
        const placement = layout.placements[index];
        applyRiverTilePlacement(item, placement);
        item.dataset.tileId = tile.id;
        item.dataset.riichiDeclaration = String(placement.declaration);
        item.append(wrapRiverTileFace(face(tile)));
        return item;
      }));
    }
  }

  private renderDora(view: PlayerGameView): void {
    const area = document.querySelector<HTMLElement>('#online-dora-indicators')!;
    renderDoraIndicators(area, view.doraIndicators, view.uraDoraIndicators ?? []);
    const deposit = document.querySelector<HTMLElement>('#online-deposit-sticks')!;
    renderDepositSticks(deposit, view.round.depositSticks);
  }

  private renderResult(view: PlayerGameView): void {
    const section = document.querySelector<HTMLElement>('#online-round-result')!;
    const result = view.result;
    section.replaceChildren();
    section.hidden = !result;
    if (!result) return;
    if (renderOnlineWinSummary(section, view)) return;
    if (result.reason === 'draw') {
      section.append(text('h2', `${result.roundWind === 'south' ? '南' : '東'}${result.roundNumber}局 ${result.honba}本場・流局`, 'round-summary-winner'));
      const tenpai = result.tenpai?.map((ready, seat) => ready ? onlinePlayerName(view, seat) : null).filter(Boolean) ?? [];
      section.append(text('p', `テンパイ：${tenpai.length === 0 ? 'なし' : tenpai.join('、')}`, 'round-summary-tenpai'));
      return;
    }
    const abortiveNames = {
      'four-kans': '四開槓',
      'kyuushu-kyuuhai': '九種九牌',
      'four-winds': '四風連打',
      'four-riichi': '四家立直',
    } as const;
    if (result.reason in abortiveNames) {
      section.append(text('h2', `途中流局（${abortiveNames[result.reason as keyof typeof abortiveNames]}）`, 'round-summary-winner'));
      return;
    }
    section.append(text('h2', `${result.roundWind === 'south' ? '南' : '東'}${result.roundNumber}局 ${result.honba}本場 · ${result.reason === 'nagashi-mangan' ? '流し満貫' : result.reason === 'ron' ? 'ロン' : 'ツモ'}`));
    section.append(text('p', `点数：${result.after.map((points, seat) => `${onlinePlayerName(view, seat)} ${points.toLocaleString('ja-JP')}点 (${result.deltas[seat] >= 0 ? '+' : ''}${result.deltas[seat].toLocaleString('ja-JP')})`).join(' · ')}`));
    for (const payment of result.payments) {
      section.append(text('p', `${onlinePlayerName(view, payment.payerId)} → ${onlinePlayerName(view, payment.recipientId)}：${payment.points.toLocaleString('ja-JP')}点`));
    }
    if (result.tenpai) section.append(text('p', `テンパイ：${result.tenpai.map((tenpai, seat) => tenpai ? onlinePlayerName(view, seat) : null).filter(Boolean).join('・') || 'なし'}`));
    if (view.status === 'match-ended') {
      const ranks = this.finalRanks ?? view.round.points.map((points, playerId) => ({ playerId, points, rank: 0 }))
        .sort((a, b) => b.points - a.points || a.playerId - b.playerId)
        .map((player, index) => ({ ...player, rank: index + 1 }));
      section.append(text('h3', `${view.format === 'tonnan' ? '半荘戦' : '東風戦'}終了 · ${ranks.map(player => `${player.rank}位 ${onlinePlayerName(view, player.playerId)} ${player.points.toLocaleString('ja-JP')}点`).join(' · ')}`));
    }
  }

  private renderActions(view: PlayerGameView): void {
    this.actionPanel.update(createOnlineActionPanelState(
      view,
      this.selectedTileId,
      this.actionPending,
      this.decisionPending,
      this.kanChoicesOpen,
      this.decisionSeconds(view.self.decision),
      this.roomNotice || this.actionNotice,
    ));
    this.syncDecisionCountdown(view.self.decision);
  }

  private returnToLocalGame(): void {
    if (!this.view || (this.view.status !== 'match-ended' && this.view.status !== 'aborted')) return;
    this.stopDecisionCountdown();
    this.clearRoomNotice();
    this.declarationBubbles.clearAll();
    this.clearRenderedGame();
    this.view = null;
    this.declarationCursor = null;
    this.finalRanks = null;
    this.actionPending = false;
    this.decisionPending = false;
    this.actionNotice = '';
    this.root.hidden = true;
    this.setTableClasses(false);
    document.body.classList.remove('online-game-active');
    this.resultDialog.updateOnline(null);
    document.querySelector<HTMLButtonElement>('#new-game')!.disabled = false;
    this.onSessionEnded();
  }

  private clearRenderedGame(): void {
    this.playerHand.replaceChildren();
    this.root.querySelectorAll<HTMLElement>('[data-online-hand], [data-online-melds], [data-online-river]').forEach(node => node.replaceChildren());
    this.scores.querySelectorAll<HTMLElement>('.seat-label').forEach(node => node.replaceChildren());
    this.table.querySelectorAll<HTMLElement>('.round-label, .wall-count, .dora-indicators, .deposit-sticks').forEach(node => node.replaceChildren());
    const result = this.root.querySelector<HTMLElement>('#online-round-result');
    if (result) { result.replaceChildren(); result.hidden = true; }
    this.actionPanel.clear();
  }

  private clearRoomNotice(): void {
    if (this.roomNoticeTimer !== null) window.clearTimeout(this.roomNoticeTimer);
    this.roomNoticeTimer = null;
    this.roomNotice = '';
  }

  private decisionSeconds(decision: PlayerGameView['self']['decision']): number | null {
    return decision ? Math.max(0, Math.ceil((decision.expiresAt - Date.now()) / 1000)) : null;
  }

  private syncDecisionCountdown(decision: PlayerGameView['self']['decision']): void {
    const nextId = decision?.windowId ?? null;
    if (nextId === this.decisionWindowId) return;
    this.stopDecisionCountdown();
    this.decisionWindowId = nextId;
    if (nextId) this.decisionCountdownTimer = window.setInterval(() => {
      if (this.view) this.renderActions(this.view);
    }, 1000);
  }

  private stopDecisionCountdown(): void {
    if (this.decisionCountdownTimer !== null) window.clearInterval(this.decisionCountdownTimer);
    this.decisionCountdownTimer = null;
    this.decisionWindowId = null;
  }
}
