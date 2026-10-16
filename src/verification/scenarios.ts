import { ankanGame, kakanGame, kanGame } from './kan-fixture.ts';
import { discardTile } from '../game/discard.ts';

export const scenarioHelp = {
  ankan: '「カン」→「暗カン」を選択。嶺上牌を選んで「打牌する」、または「ツモ和了」で結果を確認。',
  daiminkan: 'CPUの打牌に対して「大明カン」を選択。嶺上牌を打牌するか「ツモ和了」。見送る操作も可能です。',
  kakan: '「カン」→「加カン」を選択。ポンへの重なりと追加ドラを確認し、打牌またはツモ和了。',
  chankan: '「CPUの加カンを開始」→「ロン和了」で槍槓を確認。「見逃す」では加カンが成立して通常進行します。再読込して両方を確認できます。',
  rinshan: '「カン」→「暗カン」→「ツモ和了」。結果の「嶺上開花 1翻」と得点を確認。',
  multiple: '「カン」から東または赤5を含む五萬の暗カンを選択。もう一度「カン」から残りを選び、ドラ表示牌が計3枚になることを確認。その後は牌を選んで打牌。',
} as const;
export type Scenario = keyof typeof scenarioHelp;

/** Same physical-wall fixtures and setup actions as browser-step13-5.py. */
export function scenarioGame(mode: Scenario) {
  if (mode === 'ankan' || mode === 'rinshan') return ankanGame();
  if (mode === 'kakan') return kakanGame();
  if (mode === 'daiminkan') {
    const g = kanGame({ hands: { 0: ['111z','234m','456p','678s','2z'] }, turn: 3, draw: 'east', rinshan: ['south'] });
    return discardTile(g, 3, g.players[3].drawnTile!.id);
  }
  if (mode === 'chankan') return kanGame({ turn: 1, draw: 'man-1', melds: { 1: [{ type: 'pon', group: '111m' }] }, hands: { 1: ['234p','678s','22z','45s'], 0: ['23m','456p','789s','333z','66s'] } });
  return kanGame({ hands: { 0: ['1111z','5550m','234p','67s'] }, draw: 'sou-8', rinshan: ['west','north'] });
}
