import type { GameActionPayload } from './protocol.ts';
import type { PlayerGameView, PublicMeld, PublicTile } from './game-view.ts';
import { createTileElement, tileLabel } from '../rendering/tile-svg.ts';
import { renderDepositSticks } from '../rendering/deposit-sticks.ts';
import { applyRiverLayout, applyRiverTilePlacement, calculateRiverLayout, riverPositionFor } from '../rendering/river-layout.ts';
import { renderDoraIndicators } from '../rendering/dora.ts';
import { renderSeatLabel, renderTableRoundInfo, setActionStatus } from '../rendering/shared-table-components.ts';
import { TILE_KINDS, tileKindKey } from '../model/tile.ts';

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
  return view as PlayerGameView;
}

export class OnlineGameController {
  private readonly root = document.querySelector<HTMLElement>('#online-match')!;
  private readonly scores = document.querySelector<HTMLElement>('#online-score-strip')!;
  private readonly playerHand = document.querySelector<HTMLUListElement>('#online-player-hand')!;
  private readonly actionStatus = document.querySelector<HTMLElement>('#online-game-action-status')!;
  private view: PlayerGameView | null = null;
  private selectedTileId: string | null = null;
  private actionPending = false;
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

  constructor() {
    this.playerHand.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
      if (!button || button.disabled) return;
      this.selectedTileId = this.selectedTileId === button.dataset.tileId ? null : button.dataset.tileId ?? null;
      this.render();
    });
    document.querySelector<HTMLButtonElement>('#online-discard')!.addEventListener('click', () => {
      const tileId = this.discardTileId();
      if (tileId) this.send({ type: 'discard', tileId });
    });
    document.querySelector<HTMLButtonElement>('#online-riichi')!.addEventListener('click', () => {
      if (this.selectedTileId) this.send({ type: 'declare-riichi', tileId: this.selectedTileId });
    });
    document.querySelector<HTMLButtonElement>('#online-tsumo')!.addEventListener('click', () => this.send({ type: 'declare-tsumo' }));
    document.querySelector<HTMLButtonElement>('#online-kyuushu')!.addEventListener('click', () => this.send({ type: 'declare-kyuushu-kyuuhai' }));
    document.querySelector<HTMLButtonElement>('#online-ron')!.addEventListener('click', () => this.sendDecision({ type: 'declare-ron' }));
    document.querySelector<HTMLButtonElement>('#online-pass-ron')!.addEventListener('click', () => this.sendDecision({ type: 'pass-ron' }));
    document.querySelector<HTMLButtonElement>('#online-pass-call')!.addEventListener('click', () => this.sendDecision({ type: 'pass-call' }));
    document.querySelector<HTMLButtonElement>('#online-kan-options')!.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-online-kan]');
      if (button?.dataset.onlineKan) this.send({ type: 'declare-kan', optionId: button.dataset.onlineKan });
    });
    document.querySelector<HTMLButtonElement>('#online-kan')!.addEventListener('click', () => {
      this.kanChoicesOpen = true;
      this.render();
      document.querySelector<HTMLElement>('#online-kan-controls')!.scrollIntoView({ block: 'nearest' });
    });
    document.querySelector<HTMLButtonElement>('#online-cancel-kan')!.addEventListener('click', () => {
      this.kanChoicesOpen = false;
      this.render();
    });
    document.querySelector<HTMLButtonElement>('#online-call-options')!.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-online-call]');
      if (button?.dataset.onlineCall) this.sendDecision({ type: 'declare-call', optionId: button.dataset.onlineCall });
    });
    document.querySelector<HTMLButtonElement>('#online-next-round')!.addEventListener('click', () => this.send({ type: 'next-round' }));
    document.querySelector<HTMLButtonElement>('#online-return-local')!.addEventListener('click', () => this.returnToLocalGame());
  }

  setActionSender(sender: ActionSender): void { this.sender = sender; }

  receive(message: Record<string, unknown>): void {
    if (message.type === 'online-session-ended') {
      this.stopDecisionCountdown();
      this.view = null;
      this.finalRanks = null;
      this.actionPending = false;
      this.kanChoicesOpen = false;
      this.root.hidden = true;
      this.setTableClasses(false);
      document.body.classList.remove('online-game-active');
      document.querySelector<HTMLButtonElement>('#new-game')!.disabled = false;
      return;
    }
    if (message.type === 'game-action-result') {
      this.actionPending = false;
      if (message.ok === false) this.actionStatus.textContent = '操作が受け付けられませんでした。最新状態を確認してください。';
      this.render();
      return;
    }
    if (message.type === 'game-aborted') {
      this.stopDecisionCountdown();
      this.actionPending = false;
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
    if (!next || this.view && next.gameRevision < this.view.gameRevision) return;
    if (!this.view || next.gameRevision !== this.view.gameRevision) {
      this.selectedTileId = null;
      this.kanChoicesOpen = false;
    }
    this.view = next;
    this.actionPending = false;
    this.setTableClasses(true);
    this.root.hidden = false;
    document.body.classList.add('online-game-active');
    document.querySelector<HTMLButtonElement>('#new-game')!.disabled = true;
    this.render();
  }

  private send(action: GameActionPayload): void {
    const view = this.view;
    if (!view || !this.sender || this.actionPending ||
        (view.status !== 'playing' && !(action.type === 'next-round' && view.status === 'round-ended'))) return;
    this.actionPending = true;
    this.actionStatus.textContent = 'サーバーで操作を確認しています…';
    this.render();
    this.sender(action, view.gameRevision);
  }

  private sendDecision(action: DecisionAction): void {
    const view = this.view;
    const decision = view?.self.decision;
    if (!view || !decision || decision.answered || !this.sender || this.actionPending) return;
    this.actionPending = true;
    this.actionStatus.textContent = '回答をサーバーへ送信しています…';
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
    renderTableRoundInfo(
      document.querySelector<HTMLElement>('#online-table-round')!,
      document.querySelector<HTMLElement>('#online-wall-count')!,
      { ...view.round, liveWallCount: view.liveWallCount },
    );
    this.renderSeatLabels(view);
    this.renderHandsAndMelds(view);
    this.renderRivers(view);
    this.renderDora(view);
    this.renderResult(view);
    this.renderActions(view);
  }

  private renderSeatLabels(view: PlayerGameView): void {
    for (const seat of view.seats) {
      const position = riverPositionFor(view.viewerSeat, seat.seat);
      const label = this.scores.querySelector<HTMLElement>(`[data-online-label="${position}"]`);
      if (!label) continue;
      renderSeatLabel(label, {
        name: this.displayName(view, seat),
        wind: seat.wind,
        points: seat.points,
        isDealer: seat.isDealer,
        isSelf: seat.seat === view.viewerSeat,
        isActive: view.status === 'playing' && view.turnPlayerId === seat.seat,
        isRiichi: seat.riichi,
        isConnected: seat.connected,
      });
    }
  }

  private displayName(view: PlayerGameView, seat: PlayerGameView['seats'][number]): string {
    if (seat.control !== 'cpu') return seat.name;
    const cpuSeats = view.seats.filter(candidate => candidate.control === 'cpu').sort((a, b) => a.seat - b.seat);
    const index = cpuSeats.findIndex(candidate => candidate.seat === seat.seat);
    return index < 0 ? seat.name : `CPU${index + 1}`;
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
      meldNode.className = 'open-melds';
      meldNode.replaceChildren(...seat.melds.map(meld => this.renderMeld(meld, seat.seat)));
      handNode.replaceChildren();
      if (position === 'bottom' && seat.hand) {
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
      const visible = seat.revealedHand;
      const tiles = visible ?? Array.from({ length: seat.concealedCount }, () => null);
      handNode.setAttribute('aria-label', `${this.displayName(view, seat)}の${visible ? '公開手牌' : '裏向き手牌'} ${tiles.length}枚`);
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

  private renderRivers(view: PlayerGameView): void {
    for (const seat of view.seats) {
      const position = riverPositionFor(view.viewerSeat, seat.seat);
      const river = document.querySelector<HTMLElement>(`[data-online-river="${position}"]`);
      if (!river) continue;
      river.className = `river river-${position}`;
      const declarationIndex = seat.riichiDeclarationTileId
        ? seat.river.findIndex(tile => tile.id === seat.riichiDeclarationTileId)
        : -1;
      const layout = calculateRiverLayout(position, seat.river.length, declarationIndex);
      applyRiverLayout(river, layout);
      river.replaceChildren(...seat.river.map((tile, index) => {
        const item = document.createElement('div');
        item.className = 'river-tile';
        const placement = layout.placements[index];
        applyRiverTilePlacement(item, placement);
        item.dataset.tileId = tile.id;
        item.dataset.riichiDeclaration = String(placement.declaration);
        item.append(face(tile));
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
    section.append(text('h2', `東${result.roundNumber}局 ${result.honba}本場 · ${result.reason === 'draw' ? '流局' : result.reason === 'ron' ? 'ロン' : result.reason === 'tsumo' ? 'ツモ' : result.reason === 'nagashi-mangan' ? '流し満貫' : '途中流局'}`));
    for (const winner of result.winners) {
      const seat = view.seats[winner.winnerId];
      section.append(text('p', `${this.displayName(view, seat)} ${winner.method === 'tsumo' ? 'ツモ' : `ロン（${this.displayName(view, view.seats[winner.discarderId ?? 0])}から）`} · ${winner.yakumanCount ? `${winner.yakumanCount}役満` : `${winner.han}翻 ${winner.fu ?? '—'}符`} · ${winner.totalPoints.toLocaleString('ja-JP')}点`));
      section.append(text('p', winner.yaku.map(yaku => yaku.id).join('・')));
    }
    section.append(text('p', `点数：${result.after.map((points, seat) => `${this.displayName(view, view.seats[seat])} ${points.toLocaleString('ja-JP')}点 (${result.deltas[seat] >= 0 ? '+' : ''}${result.deltas[seat].toLocaleString('ja-JP')})`).join(' · ')}`));
    for (const payment of result.payments) {
      section.append(text('p', `${this.displayName(view, view.seats[payment.payerId])} → ${this.displayName(view, view.seats[payment.recipientId])}：${payment.points.toLocaleString('ja-JP')}点`));
    }
    if (result.tenpai) section.append(text('p', `テンパイ：${result.tenpai.map((tenpai, seat) => tenpai ? this.displayName(view, view.seats[seat]) : null).filter(Boolean).join('・') || 'なし'}`));
    if (view.status === 'match-ended') {
      const ranks = this.finalRanks ?? view.round.points.map((points, playerId) => ({ playerId, points, rank: 0 }))
        .sort((a, b) => b.points - a.points || a.playerId - b.playerId)
        .map((player, index) => ({ ...player, rank: index + 1 }));
      section.append(text('h3', `東風戦終了 · ${ranks.map(player => `${player.rank}位 ${this.displayName(view, view.seats[player.playerId])} ${player.points.toLocaleString('ja-JP')}点`).join(' · ')}`));
    }
  }

  private renderActions(view: PlayerGameView): void {
    const active = view.status === 'playing';
    const decision = view.self.decision;
    const discarding = view.self.discardableTileIds.length > 0 && !decision;
    const selected = this.discardTileId();
    const discard = document.querySelector<HTMLButtonElement>('#online-discard')!;
    discard.hidden = !discarding;
    discard.textContent = view.seats[view.viewerSeat].riichi ? 'ツモ切り' : '打牌する';
    discard.disabled = !active || this.actionPending || !selected;
    const riichi = document.querySelector<HTMLButtonElement>('#online-riichi')!;
    riichi.hidden = !active || !selected || !view.self.riichiTileIds.includes(selected);
    riichi.disabled = this.actionPending;
    const tsumo = document.querySelector<HTMLButtonElement>('#online-tsumo')!;
    tsumo.hidden = !active || !view.self.canTsumo;
    tsumo.disabled = this.actionPending;
    const kyuushu = document.querySelector<HTMLButtonElement>('#online-kyuushu')!;
    kyuushu.hidden = !active || !view.self.canKyuushuKyuuhai;
    kyuushu.disabled = this.actionPending;
    const kanButton = document.querySelector<HTMLButtonElement>('#online-kan')!;
    kanButton.hidden = !active || view.self.kanOptions.length === 0 || decision !== null;
    kanButton.disabled = this.actionPending;
    const kanGroup = document.querySelector<HTMLElement>('#online-kan-controls')!;
    kanGroup.hidden = !this.kanChoicesOpen || !active || view.self.kanOptions.length === 0 || decision !== null;
    const kanOptions = document.querySelector<HTMLElement>('#online-kan-options')!;
    kanOptions.replaceChildren(...view.self.kanOptions.map(option => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'control-option-button'; button.dataset.onlineKan = option.id; button.disabled = this.actionPending;
      button.append(text('span', option.type === 'ankan' ? '暗カン ' : '加カン '));
      for (const tile of option.tiles) button.append(face(tile));
      return button;
    }));
    const ron = document.querySelector<HTMLElement>('#online-ron-controls')!;
    const canAnswerRon = Boolean(decision?.type === 'ron' && !decision.answered && view.self.canRon);
    ron.hidden = !decision || decision.type !== 'ron';
    document.querySelector<HTMLElement>('#online-game-controls')!.classList.toggle('ron-pending', canAnswerRon);
    const calls = document.querySelector<HTMLElement>('#online-call-controls')!;
    calls.hidden = !decision || decision.type !== 'call';
    const callOptions = document.querySelector<HTMLElement>('#online-call-options')!;
    callOptions.replaceChildren(...view.self.callOptions.map(option => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'control-option-button'; button.dataset.onlineCall = option.id;
      button.disabled = this.actionPending || Boolean(decision?.answered) || this.decisionSeconds(decision) === 0;
      button.append(text('span', option.type === 'pon' ? 'ポン ' : option.type === 'chi' ? 'チー ' : '大明カン '));
      for (const tile of option.tiles) button.append(face(tile));
      return button;
    }));
    const secondsLeft = this.decisionSeconds(decision);
    const expired = Boolean(decision && secondsLeft === 0);
    const ronStatus = document.querySelector<HTMLElement>('#online-ron-status')!;
    const callStatus = document.querySelector<HTMLElement>('#online-call-status')!;
    const statusText = !decision ? '' : expired
      ? '判断期限が過ぎました。サーバーの確定を待っています。'
      : decision.answered
        ? `回答済みです。他のプレイヤーの回答を待っています。残り ${secondsLeft} 秒。`
        : `${decision.type === 'ron' ? 'ロン' : '鳴き'}判断の残り ${secondsLeft} 秒です。`;
    ronStatus.textContent = statusText;
    callStatus.textContent = statusText;
    const ronTarget = document.querySelector<HTMLElement>('#online-ron-target')!;
    if (canAnswerRon && view.self.ronTile) {
      ronTarget.replaceChildren(face(view.self.ronTile), text('p', `${tileLabel(view.self.ronTile.tile)} · この牌でロンできます`));
    } else ronTarget.replaceChildren();
    document.querySelector<HTMLButtonElement>('#online-ron')!.disabled = this.actionPending || !canAnswerRon || expired;
    document.querySelector<HTMLButtonElement>('#online-pass-ron')!.disabled = this.actionPending || !canAnswerRon || expired;
    document.querySelector<HTMLButtonElement>('#online-pass-call')!.disabled = this.actionPending || Boolean(decision?.answered) || expired;
    this.syncDecisionCountdown(decision);
    const next = document.querySelector<HTMLButtonElement>('#online-next-round')!;
    next.hidden = view.status !== 'round-ended' || !view.self.isHost;
    next.disabled = this.actionPending || view.seats.some(seat => seat.control === 'human' && !seat.connected);
    const returnLocal = document.querySelector<HTMLButtonElement>('#online-return-local')!;
    returnLocal.hidden = view.status !== 'match-ended' && view.status !== 'aborted';
    const roundActions = document.querySelector<HTMLElement>('#online-round-result-actions')!;
    roundActions.hidden = next.hidden && returnLocal.hidden;

    let message: string;
    if (this.actionPending) message = 'サーバーで操作を確認しています…';
    else if (decision?.answered) message = '回答を受け付けました。他のプレイヤーの回答を待っています。';
    else if (decision) message = statusText;
    else if (view.status === 'round-ended') message = view.self.isHost ? '局が終了しました。結果を確認してください。' : 'ホストが次局へ進めるまでお待ちください。';
    else if (view.status === 'match-ended') message = '東風戦が終了しました。最終結果を確認できます。';
    else if (view.status === 'aborted') message = view.abortReason === 'participant-left'
      ? '参加者が明示的に退出したため、対局を中断しました。'
      : 'この対局は中断されました。';
    else if (view.phase === 'awaiting-ron') message = 'ロン判断を待っています。';
    else if (view.phase === 'awaiting-call') message = '鳴き判断を待っています。';
    else if (view.turnPlayerId !== view.viewerSeat) message = `${this.displayName(view, view.seats[view.turnPlayerId])}の手番です。`;
    else if (view.self.discardableTileIds.length) message = this.selectedTileId ? '牌を選択中です。' : '打牌する牌を選択してください。';
    else message = 'サーバーの更新を待っています。';
    setActionStatus(this.actionStatus, message);
  }

  private returnToLocalGame(): void {
    if (!this.view || (this.view.status !== 'match-ended' && this.view.status !== 'aborted')) return;
    this.stopDecisionCountdown();
    this.view = null;
    this.finalRanks = null;
    this.actionPending = false;
    this.root.hidden = true;
    this.setTableClasses(false);
    document.body.classList.remove('online-game-active');
    document.querySelector<HTMLButtonElement>('#new-game')!.disabled = false;
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
