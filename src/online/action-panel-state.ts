import type { ActionButtonState, ActionChoiceOption, ActionPanelState } from '../ui/action-panel.ts';
import { choiceAccessibleLabel } from '../ui/action-panel.ts';
import { tileLabel } from '../rendering/tile-svg.ts';
import type { PlayerGameView } from './game-view.ts';

const button = (visible: boolean, enabled: boolean, label: string): ActionButtonState => ({ visible, enabled, label });

function displayName(seat: PlayerGameView['seats'][number]): string {
  return seat.name;
}

/** Map only the viewer-scoped, server-provided legal operations into the shared panel contract. */
export function createOnlineActionPanelState(
  view: PlayerGameView,
  selectedTileId: string | null,
  actionPending: boolean,
  decisionPending: boolean,
  kanChoicesOpen: boolean,
  secondsLeft: number | null,
  notice = '',
): ActionPanelState {
  const active = view.status === 'playing';
  const decision = view.self.decision;
  const viewer = view.seats[view.viewerSeat];
  const ownTurn = active && view.turnPlayerId === view.viewerSeat && decision === null;
  const discardTileId = viewer.riichi
    ? viewer.drawnTile?.id ?? null
    : selectedTileId && view.self.discardableTileIds.includes(selectedTileId) ? selectedTileId : null;
  const expired = Boolean(decision && secondsLeft === 0);
  const callsAllowed = Boolean(decision?.type === 'call' && !decision.answered && !expired);
  const ronAllowed = Boolean(decision?.type === 'ron' && !decision.answered && view.self.canRon && !expired);
  const callChoices: ActionChoiceOption[] = decision?.type === 'call'
    ? view.self.callOptions.map(option => {
      const label = option.type === 'pon' ? 'ポン' : option.type === 'chi' ? 'チー' : '大明カン';
      return {
        id: option.id,
        label,
        tiles: option.tiles,
        accessibleLabel: choiceAccessibleLabel(label, option.tiles, option.handTileIds.join('、')),
        enabled: callsAllowed && !actionPending,
      };
    }) : [];
  const kanChoices: ActionChoiceOption[] = view.self.kanOptions.map(option => ({
    id: option.id,
    label: option.type === 'ankan' ? '暗カン' : '加カン',
    tiles: option.tiles,
    enabled: !actionPending && active && decision === null,
  }));
  const seconds = secondsLeft === null ? 0 : secondsLeft;
  const decisionStatus = !decision ? '' : expired
    ? '判断期限が過ぎました。サーバーの確定を待っています。'
    : decision.answered
      ? `回答済みです。他のプレイヤーの回答を待っています。残り ${seconds} 秒。`
      : `${decision.type === 'ron' ? 'ロン' : '鳴き'}判断の残り ${seconds} 秒です。`;

  let actionStatus: string;
  if (actionPending) actionStatus = decisionPending
    ? '回答をサーバーへ送信しています…'
    : 'サーバーで操作を確認しています…';
  else if (notice) actionStatus = notice;
  else if (decision?.answered) actionStatus = '回答を受け付けました。他のプレイヤーの回答を待っています。';
  else if (decision) actionStatus = decisionStatus;
  else if (view.status === 'round-ended') actionStatus = view.self.nextRoundReady
    ? '他のプレイヤーを待っています' : '局が終了しました。結果を確認してください。';
  else if (view.status === 'match-ended') actionStatus = `${view.format === 'tonnan' ? '半荘戦' : '東風戦'}が終了しました。最終結果を確認できます。`;
  else if (view.status === 'aborted') actionStatus = view.abortReason === 'participant-left'
    ? '参加者が明示的に退出したため、対局を中断しました。'
    : 'この対局は中断されました。';
  else if (view.phase === 'awaiting-ron') actionStatus = 'ロン判断を待っています。';
  else if (view.phase === 'awaiting-call') actionStatus = '鳴き判断を待っています。';
  else if (view.turnPlayerId !== view.viewerSeat) actionStatus = `${displayName(view.seats[view.turnPlayerId])}の手番です。`;
  else if (view.self.discardableTileIds.length) actionStatus = discardTileId ? '牌を選択中です。' : '打牌する牌を選択してください。';
  else actionStatus = 'サーバーの更新を待っています。';

  const resultAvailable = view.result !== null;
  const showResult = resultAvailable;
  const nextRound = view.status === 'round-ended';
  const nextRoundReady = view.self.nextRoundReady;
  const returnLocal = view.status === 'match-ended' || view.status === 'aborted';

  return {
    buttons: {
      discard: button(ownTurn, ownTurn && !actionPending && discardTileId !== null, viewer.riichi ? 'ツモ切り' : '打牌する'),
      riichi: button(ownTurn && discardTileId !== null && view.self.riichiTileIds.includes(discardTileId),
        !actionPending && ownTurn && discardTileId !== null && view.self.riichiTileIds.includes(discardTileId), 'リーチ'),
      tsumo: button(ownTurn && view.self.canTsumo, ownTurn && view.self.canTsumo && !actionPending, 'ツモ和了'),
      kyuushu: button(ownTurn && view.self.canKyuushuKyuuhai, ownTurn && view.self.canKyuushuKyuuhai && !actionPending, '九種九牌'),
      'kan-toggle': button(ownTurn && kanChoices.length > 0, ownTurn && kanChoices.length > 0 && !actionPending, 'カン'),
      ron: button(decision?.type === 'ron', ronAllowed && !actionPending, 'ロン和了'),
      'pass-ron': button(decision?.type === 'ron', ronAllowed && !actionPending, '見逃す'),
      'pass-call': button(decision?.type === 'call', callsAllowed && !actionPending, '見送る'),
      'cancel-kan': button(kanChoicesOpen && ownTurn && kanChoices.length > 0,
        kanChoicesOpen && ownTurn && kanChoices.length > 0 && !actionPending, 'キャンセル'),
      'next-round': button(nextRound,
        nextRound && !nextRoundReady && !actionPending,
        nextRoundReady ? '他のプレイヤーを待っています…' : '次の局へ'),
      'show-result': button(showResult, showResult, '結果を見る'),
      'return-local': button(returnLocal, returnLocal, 'ローカル卓へ戻る'),
    },
    actionStatus,
    callGroup: { visible: decision?.type === 'call', status: decisionStatus, options: callChoices },
    kanGroup: {
      visible: kanChoicesOpen && ownTurn && kanChoices.length > 0,
      status: 'カンする面子を選択してください。',
      options: kanChoices,
    },
    ronGroup: {
      visible: decision?.type === 'ron',
      status: decisionStatus,
      target: ronAllowed && view.self.ronTile ? {
        tile: view.self.ronTile.tile,
        description: `${tileLabel(view.self.ronTile.tile)} · この牌でロンできます`,
      } : null,
    },
    roundActionsVisible: showResult || nextRound || returnLocal,
    ronPending: decision?.type === 'ron' && ronAllowed,
    gameEnded: false,
    resultAvailable,
  };
}
