import type { ActionButtonState, ActionChoiceOption, ActionPanelState } from '../ui/action-panel.ts';
import { choiceAccessibleLabel } from '../ui/action-panel.ts';
import type { MatchState } from '../model/match.ts';
import type { PlayerId } from '../model/game.ts';
import { canDeclareRiichi } from '../game/riichi.ts';
import { canDeclareTsumo } from '../game/tsumo.ts';
import { canDeclareRon, getRonTile } from '../game/ron.ts';
import { canDeclareKyuushuKyuuhai } from '../game/special-draws.ts';
import { canDiscard } from '../game/discard.ts';
import { getKanOptions } from '../game/kan.ts';
import { getCallOptions } from '../game/calls.ts';
import { tileLabel } from './tile-svg.ts';

const defaultSeatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;
const button = (visible: boolean, enabled: boolean, label: string): ActionButtonState => ({ visible, enabled, label });

/** Convert the local match state and existing rule helpers into the shared panel contract. */
export function createLocalActionPanelState(
  match: MatchState,
  selectedTileId: string | null,
  progressing: boolean,
  kanChoicesOpen: boolean,
  viewerSeat = 0,
  seatNames: readonly string[] = defaultSeatNames,
): ActionPanelState {
  const game = match.game;
  const playerId = viewerSeat as PlayerId;
  const player = game.players[playerId];
  const ownTurn = match.status === 'playing' && player.control === 'human' && canDiscard(game, playerId);
  const selected = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .find(tile => tile.id === selectedTileId);
  const discardTile = player.riichi ? player.drawnTile : selected;
  const discardVisible = ownTurn;
  const canRiichi = Boolean(ownTurn && selected && canDeclareRiichi(game, playerId, selected.id, match.points[viewerSeat]));
  const canTsumo = ownTurn && player.control === 'human' && canDeclareTsumo(game, playerId);
  const kanOptions = getKanOptions(game, playerId);
  const kyuushu = ownTurn && canDeclareKyuushuKyuuhai(game, playerId);
  const canRon = player.control === 'human' && canDeclareRon(game, playerId);
  const callOptions = game.phase === 'awaiting-call' ? getCallOptions(game, playerId) : [];
  const ronTile = canRon ? getRonTile(game) : null;
  const callChoices: ActionChoiceOption[] = callOptions.map(option => {
    const label = option.type === 'pon' ? 'ポン' : option.type === 'daiminkan' ? '大明カン' : 'チー';
    return {
      id: option.id,
      label,
      tiles: option.tiles,
      accessibleLabel: choiceAccessibleLabel(label, option.tiles, option.handTileIds.join('、')),
      enabled: !progressing,
    };
  });
  const kanChoices: ActionChoiceOption[] = kanOptions.map(option => ({
    id: option.id,
    label: option.meld.type === 'ankan' ? '暗カン' : '加カン',
    tiles: option.meld.tiles,
    enabled: !progressing,
  }));

  let actionStatus: string;
  if (progressing) actionStatus = '局を進めています。';
  else if (match.status === 'round-ended') actionStatus = '局が終了しました。結果を確認してください。';
  else if (match.status === 'match-ended') actionStatus = `${match.format === 'tonnan' ? '半荘戦' : '東風戦'}が終了しました。最終結果を確認できます。`;
  else if (game.phase === 'wall-exhausted') actionStatus = '牌山がなくなりました。';
  else if (game.phase === 'awaiting-call') actionStatus = '鳴き判断を待っています。';
  else if (game.phase === 'awaiting-ron') actionStatus = 'ロン判断を待っています。';
  else if (!ownTurn) actionStatus = `${seatNames[game.turnPlayerId]}の手番です。`;
  else if (player.riichi) actionStatus = 'リーチ中：ツモ和了 または ツモ切り';
  else if (selected) actionStatus = `選択：${tileLabel(selected.tile)}`;
  else actionStatus = 'あなたの手番：牌を選択して「打牌する」で確定';

  const ronAction = canRon && ronTile ? game.ronWindow?.kind === 'kakan'
    ? 'を加カンしようとしています'
    : game.ronWindow?.kind === 'ankan' ? 'で暗カンを宣言しました' : 'を捨てました' : '';
  const roundResultAvailable = match.lastSettlement !== null;

  return {
    buttons: {
      discard: button(discardVisible, discardVisible && !progressing && Boolean(discardTile), player.riichi ? 'ツモ切り' : '打牌する'),
      riichi: button(canRiichi, canRiichi && !progressing, 'リーチ'),
      tsumo: button(canTsumo, canTsumo && !progressing, 'ツモ和了'),
      kyuushu: button(kyuushu, kyuushu && !progressing, '九種九牌'),
      'kan-toggle': button(kanOptions.length > 0, kanOptions.length > 0 && !progressing, 'カン'),
      ron: button(canRon, canRon && !progressing, 'ロン和了'),
      'pass-ron': button(canRon, canRon && !progressing, '見逃す'),
      'pass-call': button(callChoices.length > 0, callChoices.length > 0 && !progressing, '見送る'),
      'cancel-kan': button(kanChoicesOpen && kanChoices.length > 0, kanChoicesOpen && kanChoices.length > 0 && !progressing, 'キャンセル'),
      'next-round': button(match.status === 'round-ended', match.status === 'round-ended' && !progressing, '次の局へ'),
      'show-result': button(roundResultAvailable, roundResultAvailable, '結果を見る'),
      'show-match-result': button(match.status === 'match-ended' && Boolean(match.lastSettlement?.matchEnded),
        match.status === 'match-ended' && Boolean(match.lastSettlement?.matchEnded), '対局結果'),
      'return-local': button(false, false, 'ローカル卓へ戻る'),
    },
    actionStatus,
    callGroup: { visible: callChoices.length > 0, status: '', options: callChoices },
    kanGroup: {
      visible: kanChoicesOpen && kanChoices.length > 0,
      status: 'カンする面子を選択してください。',
      options: kanChoices,
    },
    ronGroup: {
      visible: canRon,
      status: canRon && ronTile
        ? `${seatNames[game.ronWindow!.discarderId]}が${tileLabel(ronTile.tile)}${ronAction}`
        : '',
      target: canRon && ronTile ? {
        tile: ronTile.tile,
        description: game.ronWindow?.kind === 'kakan' ? '追加する牌・この牌で槍槓できます'
          : game.ronWindow?.kind === 'ankan' ? 'この牌で槍槓できます' : 'この牌でロンできます',
      } : null,
    },
    roundActionsVisible: roundResultAvailable,
    ronPending: canRon,
    gameEnded: game.phase === 'won',
    resultAvailable: roundResultAvailable,
  };
}
