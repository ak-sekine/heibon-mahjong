import { getCallOptions, declareCall, resolveCallResponses } from '../game/calls.ts';
import { discardTile } from '../game/discard.ts';
import { drawOrStop } from '../game/draw.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import { getRonCandidates, passRon } from '../game/ron.ts';
import { startGame } from '../game/start.ts';
import type { GameState, PlayerId } from '../model/game.ts';

/** Replay legal game actions to a fixed human discard turn. No state is patched. */
const fixtureSeeds: Readonly<Record<number, number>> = { 17: 1, 18: 276, 19: 5 };

function seeded(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export const riverTestUnsupportedReason =
  '23・24・25枚の河を持つ、人間席が打牌待ちになる合法な一局を固定シードの進行から確認できていません。';

export function createRiverTestState(discardCount: number): GameState {
  const seed = fixtureSeeds[discardCount];
  if (seed === undefined) throw new RangeError(riverTestUnsupportedReason);

  const choice = seeded(seed * 9973 + 23);
  const dealt = startGame(seeded(seed));
  const players = dealt.players.map(player => ({ ...player, control: 'human' as const })) as unknown as GameState['players'];
  let game: GameState = { ...dealt, players };

  for (let operation = 0; operation < 400; operation++) {
    if (game.phase === 'awaiting-discard' && game.turnPlayerId === 0 && game.players[0].river.length === discardCount) {
      const cpuSeats = game.players.map(player => ({
        ...player,
        control: player.id === 0 ? 'human' as const : 'cpu' as const,
      })) as unknown as GameState['players'];
      return { ...game, players: cpuSeats };
    }
    if (game.phase === 'awaiting-ron') {
      while (game.phase === 'awaiting-ron') {
        const candidates = getRonCandidates(game);
        if (!candidates.length) break;
        game = passRon(game, candidates[Math.floor(choice() * candidates.length)].winnerId);
      }
      continue;
    }
    if (game.phase === 'awaiting-call') {
      const options = [0, 1, 2, 3].flatMap(seat => getCallOptions(game, seat as PlayerId));
      const option = options.length ? options[Math.floor(choice() * options.length)] : null;
      game = option ? declareCall(game, option.playerId, option.id) : resolveCallResponses(game, []);
      continue;
    }
    if (game.phase === 'awaiting-draw') {
      game = drawOrStop(game);
      continue;
    }
    if (game.phase !== 'awaiting-discard') break;

    const player = game.players[game.turnPlayerId];
    const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
      .filter(tile => !isForbiddenDiscard(player, tile.id));
    if (!candidates.length) break;
    game = discardTile(game, player.id, candidates[Math.floor(choice() * candidates.length)].id);
  }
  throw new RangeError(`合法な${discardCount}枚開始局面を固定シードで再現できませんでした。`);
}
