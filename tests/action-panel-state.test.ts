import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalActionPanelState } from '../src/rendering/local-action-panel-state.ts';
import { createOnlineActionPanelState } from '../src/online/action-panel-state.ts';
import { actionChoicesForDisplay } from '../src/ui/action-panel.ts';
import { startMatch } from '../src/game/match.ts';
import { canDiscard } from '../src/game/discard.ts';
import { getCallOptions } from '../src/game/calls.ts';
import { getKanOptions } from '../src/game/kan.ts';
import { canDeclareKyuushuKyuuhai } from '../src/game/special-draws.ts';
import { canDeclareRon, getRonTile } from '../src/game/ron.ts';
import { canDeclareTsumo } from '../src/game/tsumo.ts';
import { getRiichiDiscardOptions } from '../src/game/riichi.ts';
import { discardTile } from '../src/game/discard.ts';
import type { GameState } from '../src/model/game.ts';
import type { PlayerGameView } from '../src/online/game-view.ts';
import { ankanGame } from './kan-fixture.ts';
import { callStart } from './calls-fixture.ts';
import { riichiStart } from './riichi-fixture.ts';
import { ronGame } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { parentKyuushuGame } from './step13-10-fixture.ts';

function onlineViewFor(game: GameState, options: {
  status?: PlayerGameView['status'];
  decision?: PlayerGameView['self']['decision'];
  host?: boolean;
  connected?: boolean;
} = {}): PlayerGameView {
  const self = game.players[0];
  const discardableTileIds = canDiscard(game, 0)
    ? [...self.hand, ...(self.drawnTile ? [self.drawnTile] : [])]
      .filter(tile => !self.riichi || tile.id === self.drawnTile?.id).map(tile => tile.id)
    : [];
  const seats = game.players.map(player => ({
    seat: player.id,
    name: player.id === 0 ? 'Player' : `CPU${player.id}`,
    control: player.control,
    connected: options.connected ?? true,
    wind: player.wind,
    isDealer: player.id === game.dealerId,
    points: 25000,
    riichi: Boolean(player.riichi),
    concealedCount: player.hand.length + Number(player.drawnTile !== null),
    ...(player.id === 0 ? {
      hand: player.hand,
      drawnTile: player.drawnTile,
    } : {}),
    river: player.river,
    melds: [],
  }));
  const decision = options.decision ?? null;
  return {
    type: 'game-state',
    roomCode: 'TEST01',
    gameRevision: 1,
    viewerSeat: 0,
    status: options.status ?? 'playing',
    round: { roundNumber: 1, dealerId: game.dealerId, honba: 0, points: [25000,25000,25000,25000], depositSticks: 0 },
    phase: game.phase,
    turnPlayerId: game.turnPlayerId,
    liveWallCount: game.liveWall.length,
    seats,
    doraIndicators: [],
    self: {
      seat: 0,
      isHost: options.host ?? true,
      discardableTileIds,
      riichiTileIds: getRiichiDiscardOptions(game, 0, 25000).map(option => option.tileId),
      canTsumo: canDeclareTsumo(game, 0),
      canKyuushuKyuuhai: canDeclareKyuushuKyuuhai(game, 0),
      kanOptions: getKanOptions(game, 0).map(option => ({
        id: option.id,
        type: option.meld.type,
        tiles: option.meld.tiles,
      })),
      callOptions: getCallOptions(game, 0).map(option => ({
        id: option.id,
        type: option.type,
        tiles: option.tiles,
        calledTileId: option.calledTileId,
        handTileIds: option.handTileIds,
      })),
      canRon: canDeclareRon(game, 0),
      ronTile: getRonTile(game),
      decision,
    },
    result: options.status === 'round-ended' ? {} : null,
  } as unknown as PlayerGameView;
}

function assertSharedButtons(local: ReturnType<typeof createLocalActionPanelState>, online: ReturnType<typeof createOnlineActionPanelState>, names: readonly (keyof typeof local.buttons)[]): void {
  for (const name of names) assert.deepEqual(online.buttons[name], local.buttons[name], `${name} should render the same in both modes`);
}

test('normal own turn keeps discard visible without selection and enables it after selection', () => {
  const match = startMatch(riichiStart('tsumo'));
  const drawId = match.game.players[0].drawnTile!.id;
  const localUnselected = createLocalActionPanelState(match, null, false, false);
  const onlineUnselected = createOnlineActionPanelState(onlineViewFor(match.game), null, false, false, false, null);
  assertSharedButtons(localUnselected, onlineUnselected, ['discard', 'riichi', 'tsumo', 'kan-toggle', 'kyuushu']);
  assert.equal(localUnselected.buttons.discard.visible, true);
  assert.equal(localUnselected.buttons.discard.enabled, false);
  assert.equal(localUnselected.buttons.riichi.visible, false);

  const localSelected = createLocalActionPanelState(match, drawId, false, false);
  const onlineSelected = createOnlineActionPanelState(onlineViewFor(match.game), drawId, false, false, false, null);
  assertSharedButtons(localSelected, onlineSelected, ['discard', 'riichi', 'tsumo', 'kan-toggle', 'kyuushu']);
  assert.equal(localSelected.buttons.discard.enabled, true);
  assert.equal(localSelected.buttons.riichi.visible, true);
  assert.equal(localSelected.buttons.riichi.enabled, true);
});

test('riichi and tsumo controls appear only when the local rules and server view permit them', () => {
  const match = startMatch(riichiStart('tsumo'));
  const invalid = match.game.players[0].hand.find(tile => tile.tile.category === 'suited' && tile.tile.suit === 'man' && tile.tile.rank === 1)!.id;
  const localInvalid = createLocalActionPanelState(match, invalid, false, false);
  const onlineInvalid = createOnlineActionPanelState(onlineViewFor(match.game), invalid, false, false, false, null);
  assertSharedButtons(localInvalid, onlineInvalid, ['riichi', 'tsumo']);
  assert.equal(localInvalid.buttons.riichi.visible, false);

  const tsumoMatch = startMatch(tsumoGame());
  const localTsumo = createLocalActionPanelState(tsumoMatch, null, false, false);
  const onlineTsumo = createOnlineActionPanelState(onlineViewFor(tsumoMatch.game), null, false, false, false, null);
  assertSharedButtons(localTsumo, onlineTsumo, ['discard', 'riichi', 'tsumo']);
  assert.equal(localTsumo.buttons.tsumo.visible, true);
  assert.equal(localTsumo.buttons.tsumo.enabled, true);
});

test('kan options are shared and processing disables legal controls without hiding them', () => {
  const match = startMatch(ankanGame());
  const options = getKanOptions(match.game, 0);
  assert.ok(options.length > 0);
  const local = createLocalActionPanelState(match, null, true, true);
  const online = createOnlineActionPanelState(onlineViewFor(match.game), null, true, false, true, null);
  assertSharedButtons(local, online, ['discard', 'kan-toggle', 'cancel-kan']);
  assert.equal(local.buttons['kan-toggle'].visible, true);
  assert.equal(local.buttons['kan-toggle'].enabled, false);
  assert.equal(local.kanGroup.visible, true);
  assert.equal(local.kanGroup.options[0].enabled, false);
  assert.deepEqual(local.kanGroup.options.map(option => option.id), online.kanGroup.options.map(option => option.id));

  const localRunning = createLocalActionPanelState(match, match.game.players[0].drawnTile!.id, true, false);
  assert.equal(localRunning.buttons.discard.visible, true);
  assert.equal(localRunning.buttons.discard.enabled, false);
});

test('call choices and pass state match between a local call window and server legal options', () => {
  const initial = callStart();
  const game = discardTile(initial, initial.turnPlayerId, initial.players[initial.turnPlayerId].drawnTile!.id);
  const match = startMatch(game);
  const decision: NonNullable<PlayerGameView['self']['decision']> = {
    windowId: 'call-window', type: 'call', expiresAt: Date.now() + 10_000,
    expectedGameRevision: 1, answered: false,
  };
  const local = createLocalActionPanelState(match, null, false, false);
  const online = createOnlineActionPanelState(onlineViewFor(game, { decision }), null, false, false, false, 10);
  assert.equal(local.callGroup.visible, true);
  assert.equal(online.callGroup.visible, true);
  assertSharedButtons(local, online, ['pass-call']);
  assert.deepEqual(
    actionChoicesForDisplay('call', local.callGroup.options).map(option => [option.id, option.label]),
    actionChoicesForDisplay('call', online.callGroup.options).map(option => [option.id, option.label]),
  );
  assert.equal(online.buttons['pass-call'].enabled, true);
});

test('ron judgement shows legal actions and focuses on server timeout or action pending state', () => {
  const game = ronGame(1, [0]);
  const match = startMatch(game);
  const decision: NonNullable<PlayerGameView['self']['decision']> = {
    windowId: 'ron-window', type: 'ron', expiresAt: Date.now() + 10_000,
    expectedGameRevision: 1, answered: false,
  };
  const local = createLocalActionPanelState(match, null, false, false);
  const onlineView = onlineViewFor(game, { decision });
  const online = createOnlineActionPanelState(onlineView, null, false, false, false, 10);
  assert.equal(local.ronGroup.visible, true);
  assert.equal(online.ronGroup.visible, true);
  assertSharedButtons(local, online, ['ron', 'pass-ron']);
  assert.equal(local.ronGroup.target?.tile !== undefined, true);

  const pending = createOnlineActionPanelState(onlineView, null, true, true, false, 10);
  assert.equal(pending.buttons.ron.visible, true);
  assert.equal(pending.buttons.ron.enabled, false);
  assert.equal(pending.buttons['pass-ron'].enabled, false);
  assert.match(pending.actionStatus, /送信しています/);
  const expired = createOnlineActionPanelState(onlineView, null, false, false, false, 0);
  assert.equal(expired.ronGroup.visible, true);
  assert.equal(expired.buttons.ron.enabled, false);
  assert.match(expired.ronGroup.status, /期限が過ぎました/);
});

test('local progression and ended round expose the shared processing and result states', () => {
  const initial = startMatch(riichiStart('tsumo'));
  const progressing = createLocalActionPanelState(initial, initial.game.players[0].drawnTile!.id, true, false);
  assert.equal(progressing.buttons.discard.visible, true);
  assert.equal(progressing.buttons.discard.enabled, false);
  assert.match(progressing.actionStatus, /進めています/);

  const ended = {
    ...initial,
    status: 'round-ended' as const,
    lastSettlement: {} as NonNullable<typeof initial.lastSettlement>,
  };
  const local = createLocalActionPanelState(ended, null, false, false);
  const onlineView = onlineViewFor(initial.game, { status: 'round-ended', host: true });
  const online = createOnlineActionPanelState(onlineView, null, false, false, false, null);
  assert.equal(local.buttons['next-round'].visible, true);
  assert.equal(local.buttons['show-result'].visible, true);
  assert.equal(local.roundActionsVisible, true);
  assert.equal(online.buttons['next-round'].visible, true);
  assert.equal(online.buttons['show-result'].visible, true);
  assert.equal(online.roundActionsVisible, true);
  assert.equal(createOnlineActionPanelState(onlineView, null, true, false, false, null).buttons['next-round'].enabled, false);
});

test('nine kinds state is derived locally and online buttons use only the matching view flags', () => {
  const game = parentKyuushuGame(9);
  const match = startMatch(game);
  const local = createLocalActionPanelState(match, null, false, false);
  const online = createOnlineActionPanelState(onlineViewFor(game), null, false, false, false, null);
  assert.equal(local.buttons.kyuushu.visible, true);
  assertSharedButtons(local, online, ['kyuushu']);
  assert.equal(online.buttons.kyuushu.visible, true);
});

test('online guests can confirm while disconnected peers wait, and results remain available after confirming', () => {
  const initial = startMatch(riichiStart('tsumo'));
  const view = onlineViewFor(initial.game, { status: 'round-ended', host: false });
  const before = createOnlineActionPanelState(view, null, false, false, false, null);
  assert.equal(before.buttons['next-round'].enabled, true);
  assert.equal(before.buttons['next-round'].visible, true);
  assert.equal(before.buttons['next-round'].label, '次の局へ');
  const after = createOnlineActionPanelState({ ...view, self: { ...view.self, nextRoundReady: true } }, null, false, false, false, null);
  assert.equal(after.buttons['next-round'].visible, true);
  assert.equal(after.buttons['next-round'].enabled, false);
  assert.equal(after.buttons['next-round'].label, '他のプレイヤーを待っています…');
  assert.equal(after.buttons['show-result'].enabled, true);
  assert.equal(after.actionStatus, '他のプレイヤーを待っています');
  const waitingForServer = createOnlineActionPanelState(view, null, true, false, false, null);
  assert.equal(waitingForServer.buttons['next-round'].visible, true);
  assert.equal(waitingForServer.buttons['next-round'].enabled, false);
  assert.equal(waitingForServer.buttons['next-round'].label, '次の局へ');
});
