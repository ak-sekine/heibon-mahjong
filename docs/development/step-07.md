## Step 7：基本役判定エンジン
> **歴史資料:** 以下は整理前READMEのStep記録です。実施当時の仕様・未実装項目・検証結果を示し、現在の仕様を表すものではありません。現在の仕様は [SPEC](../SPEC.md)、実装状況は [ROADMAP](../ROADMAP.md) を参照してください。

`src/analysis/yaku.ts`の`analyzeYaku(tiles: readonly Tile[], context: WinningContext): YakuAnalysis`は、Step 6の`analyzeWinningShapes()`の検証・返却分解を利用する純粋関数です。GameStateから情報を取得せず、入力配列・牌・コンテキストを変更しません。Step 8では薄いゲーム処理を通して自分のツモ和了と画面に接続します。

| 対応役 | 翻数／役満 |
| --- | --- |
| 門前清自摸和 | 1翻（ツモのみ） |
| 断么九 | 1翻 |
| 役牌：白・發・中・自風・場風 | 該当条件ごとに1翻 |
| 平和 | 1翻 |
| 一盃口 | 1翻 |
| 七対子 | 2翻 |
| 対々和 | 2翻 |
| 国士無双 | 1役満 |

```ts
import { analyzeYaku } from './src/analysis/yaku.ts';
import { ordinaryTile } from './src/model/tile.ts';
import type { Rank } from './src/model/tile.ts';

const tiles = ([1, 2, 3, 4, 5, 6, 7] as Rank[]).flatMap(rank => [
  ordinaryTile({ category: 'suited', suit: 'man', rank }),
  ordinaryTile({ category: 'suited', suit: 'man', rank }),
]);
const result = analyzeYaku(tiles, {
  winMethod: 'ron',
  winningTile: { category: 'suited', suit: 'man', rank: 4 },
  seatWind: 'east',
  roundWind: 'south',
});
console.log(result.isWinningShape); // true（形としての成立）
console.log(result.hasSupportedYaku); // true（今回対応した役がある候補の存在）
console.log(result.candidates.length); // 4（通常形3候補と七対子1候補）
```

`WinningContext`は`winMethod: 'tsumo' | 'ron'`、完成14枚に含まれる`winningTile: TileKind`、`seatWind`（自風）、`roundWind`（場風）を必須とします。風は`east / south / west / north`です。赤5と通常5は同じ牌種です。任意の`isClosed?: true`は省略時も門前を意味し、開いた手牌を渡す`false`は拒否します。鳴き対応は将来別途追加する必要があります。

返却値は`isWinningShape`、`hasSupportedYaku`、`candidates`です。候補は安定した`id`、`shape: standard / seven-pairs / thirteen-orphans`、成立役`yaku`（安定ID、`han`、`yakuman`）、通常翻合計`totalHan`、役満数`yakumanCount`を持ちます。通常形には`decompositionId`、Step 6の`decomposition`、和了牌の`assignment`（雀頭、または0始まりの`meldIndex`と`tileIndex`）、`wait`を保存します。刻子の`tileIndex: 0`は同種3枚の代表位置です。七対子は`pairs`、和了対子の`pairIndex`、`wait: tanki`、国士無双は`duplicate`と`assignment / wait: null`を返します。

平和は全4面子が順子、雀頭が役牌以外、和了した順子が両面待ちの場合だけ成立します。和了牌を含む雀頭・各面子を割り当て候補として列挙し、中央牌は`kanchan`（嵌張）、123の3と789の7は`penchan`（辺張）、その他の順子端は`ryanmen`（両面）とします。23→1の123と78→9の789は両面です。雀頭は`tanki`（単騎）、刻子は`shanpon`（双碰）とし、平和を付けません。同じ牌種が雀頭や複数の順子にある場合は割り当てごとに評価します。

役牌は通常形の刻子のみです。雀頭は役牌役を生みません。自風と場風は別ID（`yakuhai-seat-wind` / `yakuhai-round-wind`）で、東場・東家の東刻子は2翻です。白・發・中も個別IDで加算します。平和では三元牌・自風・場風の雀頭を拒否し、それ以外の風牌雀頭を認めます。

各分解・各割り当ての役は独立し、異なる候補の役を合算しません。通常形はStep 6の安定した分解順、割り当ては雀頭→面子順、最後に七対子→国士無双の順です。同一分解の同一面子が複数ある場合、対称な割り当ては最初の面子位置を代表にして重複を除きます。`11223344556677m`の七対子候補に通常形の平和・一盃口・対々和・役牌刻子を混ぜません。一盃口は重複順子が何組あっても1翻のみです。二盃口が成立する特殊ケースでも、Step 7の判定対象は一盃口のみで、二盃口は未実装です。

国士無双は`han: 0 / yakuman: 1`、候補は`totalHan: 0 / yakumanCount: 1`です。13翻として計上せず、ツモ等の通常役も合算しません。十三面待ちによるダブル役満は扱いません。符・点数未実装のため最終得点・最高得点候補は決定しません。

14枚以外、牌種5枚以上、不正な牌、存在しない和了牌、不正な和了牌種・風・和了方法・開いた手牌指定は`RangeError`で拒否します。正常な不成立手牌は両フラグがfalse、候補なしです。形成立でも今回の役がゼロなら`hasSupportedYaku: false`ですが、未対応役があるため実際の役なし・和了不可を保証しません。

固定テストは役ごとの成立・不成立、全待ち方、役牌雀頭と風の組合せ、同一分解の複数割り当て、通常形と七対子の同時成立、異なる分解での役の分離、役満分離、入力拒否、凍結入力・順序安定・重複排除を確認しました。既存59件を維持しています。

未対応：立直・ダブル立直、一発、海底・河底、三色同順・一気通貫、混全帯么九・純全帯么九、混一色・清一色、二盃口、三暗刻・三槓子、小三元・混老頭、その他役満、ドラ・赤ドラ、符・点数、フリテン、鳴き・カン、和了処理・宣言UI・CPU和了宣言、リーチ・テンパイ・シャンテン判定。未対応役を成立扱いにしません。Step 7 API自体は和了処理を行わず、Step 8のゲーム層で宣言条件を検証します。
