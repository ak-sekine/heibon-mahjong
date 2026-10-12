# Quill Mahjong

日本式リーチ麻雀のStep 7（基本役判定エンジン追加）。自分（東）→CPU1（南）→CPU2（西）→CPU3（北）の順で、ツモ・打牌を牌山終了まで繰り返せます。和了・鳴き・リーチ・点数計算は今回実装していません。

## 操作と画面

既存の4人卓、牌モデル、牌山生成・シャッフル・配牌、SVG牌デザイン、開発用牌一覧を維持しています。親は自分に固定し、配牌直後は13枚＋右端の追加牌1枚から、ツモなしで打牌します。以降は生きた牌山の先頭から1枚ツモし、14枚から1枚打牌します。

自分の牌をタップすると物理牌IDで選択します。別の牌で選択変更、同じ牌で解除し、「打牌する」で確定する2段階操作です。選択だけではGameStateを変更しません。TabとEnter／Spaceでも操作できます。ツモ牌は右端に間隔を空け、自分の打牌直後は13枚、CPU進行中は操作を無効にします。

CPUはそれぞれ自動的にツモ・打牌し、各打牌の前に300ms待ちます。CPU3の打牌後は自分が自動的にツモし、次の選択ができます。現在の手番は席の強調表示と中央情報で示します。左右（CPU1・CPU3）と対面（CPU2）の裏向き手牌表示を削除し、名前・風・手牌枚数・親・手番表示を維持しました。CPUの牌面・物理牌IDは引き続きDOMに出しません。

河の牌SVGは、自分0°、右CPU1 270°、対面CPU2 180°、左CPU3 90°にCSSで回転します。内部配列とDOMは打牌順を維持し、描画時に各牌のgridRow/gridColumnだけを席に合わせて変換します。席視点で6枚ずつ左上から右へ、次の段へ進む配置を回転した結果、画面上では上下6列×3行、左右3列×6行になります。右は左下から上へ進み、6枚ごとに右の列へ、左は右上から下へ進み、6枚ごとに左の列へ、対面は右下から左へ進み、6枚ごとに上の段へ進みます。空の状態から18枚分を確保し、河の内部スクロールは使いません。

河のSVGは幅20〜24px（375px幅では約20.25px）で、左右の牌は縦横を入れ替えたセルに収めます。CPU手牌の削除と横向き牌による高さ圧縮で、下部操作に余裕を作りました。打牌操作エリアは通常の文書配置を保ったposition:sticky / bottom:0で下端に追従し、12px＋safe-area-inset-bottomの内側余白を確保します。ページ下端にも16px＋セーフエリアの余白があります。高さ不足時はページ全体を縦スクロールでき、手牌と操作を一緒に表示できます。手牌14枚の1行表示と44px以上の打牌ボタンを維持しています。

中央には実際の生きた牌山枚数・王牌枚数・手番を表示します。未管理の局数・点数は表示しません。

## 状態と純粋なゲーム処理

`src/model/game.ts`の既存GameStateを再利用し、phaseを以下の3状態にしました。

- `awaiting-draw`：turnPlayerIdのプレイヤーがツモ待ち。
- `awaiting-discard`：同じプレイヤーが13枚＋drawnTile1枚で打牌待ち。配牌直後もこの状態。
- `wall-exhausted`：次のツモ時に生きた牌山が空だったため停止。turnPlayerIdはツモできなかったプレイヤー。

`src/game/turn.ts`が順序とツモ待ちの検証・牌山終了を担当します。`draw.ts`の`drawTile()`は現在手番・ツモ待ち・hand13枚・drawnTile=null・生きた牌山ありを要求し、先頭牌をdrawnTileへ移動します。handと王牌は変えません。不正操作と空の牌山への直接ツモはRangeErrorです。`drawOrStop()`は正しいツモ待ちで牌山が空なら停止へ遷移します。

`discard.ts`の`discardFromPlayer()`を共用し、`discardTile()`を全員・全巡に拡張しました。現在手番・打牌待ち・13枚＋追加牌を要求し、指定された物理牌IDの牌を本人の河の末尾へ移します。handから捨てた場合はツモ牌をhandに取り込み、ツモ牌を捨てた場合はhandを維持します。結果はhand13枚・drawnTile=null、次のプレイヤーのツモ待ちです。手番違い・連続打牌・不明ID・不正な手牌・停止後の操作は拒否します。

状態更新はDOM非依存の純粋関数です。元のGameStateや配列・物理牌を変更せず、既存の物理牌を移動するので赤5と同牌種のIDを保存します。

## CPUと自動進行

`src/game/cpu.ts`の`chooseRandomDiscard()`はhand13枚とdrawnTile1枚の14候補から等確率で1枚のIDを選びます。乱数源を注入でき、範囲外・非有限値は拒否します。手牌評価は行いません。`DiscardStrategy`として独立しているので、将来のCPU思考に差し替えられます。

`src/game/automatic-turns.ts`の`AutomaticTurnRunner`は、純粋なツモ・打牌処理を呼び、CPUの待機を制御します。乱数源・選択戦略・待機関数を注入でき、テストでは時間待ちを省略できます。実行中の再起動は拒否し、AbortControllerと世代番号で古い処理を無効にします。標準待機はキャンセル時にタイマーを解除します。キャンセルを無視する待機関数でも、await後の世代検証によって古い状態を反映しません。古い処理のfinallyも新しい実行を解除しません。

`src/ui/controller.ts`のGameControllerが現在のGameStateと選択IDを保持します。確定時に同期的に1枚だけ打牌し、選択を消して自動進行を開始します。進行中の選択・確定を拒否するので連打でも複数枚動きません。「新しい対局」は進行をキャンセルして再配牌し、河・選択・手番・牌山を初期化します。`src/rendering/table.ts`がDOM描画、`src/main.ts`が操作と描画通知の接続を担当します。

## 牌山終了

通常ツモに使うのは生きた牌山だけです。最後の1枚をツモしたプレイヤーは通常どおり打牌でき、その次のツモが必要になった時点で「牌山がなくなりました」と表示し停止します。王牌14枚は使用せず、停止後のツモ・打牌・CPU進行は禁止します。「新しい対局」は利用できます。標準の配牌では追加ツモ69回・打牌70回で停止します。

## 開発・検証

Node.js 24を使用します。外部npmライブラリの追加はありません。

```sh
npm ci
npm test
npm run build
npm run dev
```

自動テスト125件（10ファイル、既存59件＋役判定66件）。既存の牌・牌山・配牌・描画・選択テストを維持し、Step 4の停止／CPU制限の期待値を更新しました。ツモの条件検証、全員の打牌、14候補と乱数再現、CPU順序・二重実行防止、リセットによる古い処理無効化、最後のツモ・打牌・停止と再初期化を検証します。20対局で生きた牌山を全消費し、各遷移で136枚・ID重複なし・34牌種各4枚・赤5計3枚・王牌14枚・元状態不変を確認します。待機を省略したControllerによる全対局も検証します。

個別ケースの出力が必要なら以下を使えます。

```sh
node --test --test-isolation=none tests/*.test.ts
```

任意のブラウザ検証にはPython PlaywrightとChromiumを使います（アプリ／npm testの依存には含みません）。

```sh
npm run preview -- --host 0.0.0.0
# 別ターミナル
python tests/browser-check.py
```

`--url`と`--screenshots`で対象URLと画像出力先を指定できます。320×568、375×667、390×844、414×896、1280×800で、両方の打牌操作、キーボード、CPU順序と河更新、複数巡、CPU進行中のリセット、CPU情報非公開、横スクロールと領域の非重複を検証します。牌山を全消費する部分ではPlaywrightの時計を進め、実際のゲーム処理とDOMを通して最後の打牌・停止・リセットを確認します。

Step 5 UI改善でnpm ci・自動テスト29件（8ファイル）・ビルド、および上記5サイズのChromium検証を実施しました。全巡で各河の全牌・SVGの座標が河の内側に収まり、scrollWidth/HeightがclientWidth/Heightを超えないこと、SVGの回転行列、席に応じた配置、DOMの打牌ID順序、各河と中央情報の非重複、手牌の1行表示、横スクロールなし、CPU手牌非公開を確認します。終了時は18・18・17・17枚、計70枚が隠れずに表示されます。

390×844と375×667では、終盤でも選択メッセージ・打牌ボタン・補助説明まで縦スクロールなしで表示されます。414×896と1280×800も縦スクロール不要です。320×568ではページ全体の縦スクロールが必要で、操作エリアへスクロールして使用できます。

Safariのツールバー相当として375×547・390×724（元の高さから120px減）も検証します。終盤の14枚から実際に選択・打牌し、選択メッセージと44px以上のボタンが表示領域内にあり、手牌と操作エリアが重ならず、ボタン中心が他の要素で覆われないことを確認します。375×547は文書を下へスクロールして操作し、390×724はそのまま操作できます。これはChromiumでの高さ変化の検証で、Safari固有のツールバー動作や実機のセーフエリアは未確認です。

スクリーンショットは指定出力先に初期・中盤・終盤・終了時を保存します。確認用の終了時5サイズとツールバー相当の終盤選択状態2サイズを[docs/screenshots/ui-step5](docs/screenshots/ui-step5/)に保存しています。ゲーム処理・状態・牌SVGデザイン・Pages設定は変更していません。

## Step 6：和了形判定エンジン

`src/analysis/winning-shape.ts`は門前の14枚について通常形（4面子1雀頭）、七対子、国士無双を判定する純粋関数です。役なしでも形として成立します。対局UI・配牌・ツモ・打牌・CPU・ターン進行には接続していません。DOM・SVG・GameState・物理牌IDに依存せず、入力配列と牌を変更しません。赤5は既存の`tileKindKey()`で通常の5と統合します。

```ts
import { analyzeWinningShapes, isWinningShape } from './src/analysis/winning-shape.ts';
import { ordinaryTile } from './src/model/tile.ts';
import type { Tile } from './src/model/tile.ts';

const tiles: readonly Tile[] = [1, 2, 3, 4, 5, 6, 7].flatMap(rank => [
  ordinaryTile({ category: 'suited', suit: 'man', rank: rank as 1 | 2 | 3 | 4 | 5 | 6 | 7 }),
  ordinaryTile({ category: 'suited', suit: 'man', rank: rank as 1 | 2 | 3 | 4 | 5 | 6 | 7 }),
]);
const analysis = analyzeWinningShapes(tiles);
console.log(isWinningShape(tiles)); // true
console.log(analysis.standard.decompositions.length); // 3
console.log(analysis.sevenPairs.isWinning); // true
```

`WinningShapeAnalysis`は全体の`isWinning`、`standard`の成立フラグと全`decompositions`、`sevenPairs`の成立フラグと7種類の`pairs`、`thirteenOrphans`の成立フラグと重複牌種`duplicate`を返します。特殊形の不成立時は`pairs`／`duplicate`が`null`です。通常形の各分解は`pair: TileKind`と4面子の`melds`を保持します。面子は`type: 'sequence'`と連続3種類の`tiles`、または`type: 'triplet'`と`tile: TileKind`の判別可能な型です。返却する牌種に赤属性や物理IDはありません。

通常形は34種類のカウントを作り、2枚以上ある全牌種を雀頭候補にして2枚を取り除きます。残りの最小牌種から刻子と同色の順子（開始数1〜7）の両方へ再帰・バックトラックし、4面子で全牌を使い切る結果だけ採用します。字牌の順子、色をまたぐ順子、9から1への循環を認めません。雀頭と正規化した面子のキーで重複を除き、牌種順・面子種別順で結果を安定化します。同じ面子が複数必要な場合はその個数を保持し、面子を並べ替えただけの分解は追加しません。入力順によらず全分解を返し、通常形と七対子などの同時成立も保持します。

七対子は異なる7種類がそれぞれちょうど2枚ある場合のみ成立し、同種4枚を2対子にしません。国士無双は各色の1・9と字牌7種類をすべて含み、他の牌がなく、1種類だけが2枚ある場合に成立します。14枚制約の下で13種類を揃えることで重複が1組であることを保証します。

型は`readonly Tile[]`で牌の種類と赤5の制約を表し、JavaScript等からの不正入力は実行時にも検証します。14枚以外、同牌種5枚以上、未知の牌種、型に反する牌面・赤属性は`RangeError`です。正常な14枚の不成立はエラーにしません。将来はPlayerStateのhandとdrawnTileから牌面だけを取得する薄い変換処理で接続できます。

固定テストでは各面子構成、字牌、4枚使用、赤5、七対子、国士無双、複数分解・同時成立、不正順子、入力拒否、凍結入力・不変性・順序安定性を検証します。固定乱数の合法な14枚1000手を独立した判定オラクルと比較し、面子から生成した合法な成立手500手では成立と全分解の牌数一致・順子妥当性・重複排除を確認します。

Step 6の形判定API自体は役・和了方法を扱いません。基本役と和了方法の評価はStep 7の独立APIを使用します。未実装：テンパイ、待ち牌の探索、シャンテン数、ドラ・赤ドラの翻数、和了宣言・ボタン、点数・符、鳴き・カン、リーチ、CPU手牌評価。国士無双十三面待ちや和了牌の取得元も判定しません。和了形成立は、役を満たして実際に和了できることとは別です。

## Step 7：基本役判定エンジン

`src/analysis/yaku.ts`の`analyzeYaku(tiles: readonly Tile[], context: WinningContext): YakuAnalysis`は、Step 6の`analyzeWinningShapes()`の検証・返却分解を利用する純粋関数です。GameStateから情報を取得せず、入力配列・牌・コンテキストを変更しません。ゲーム進行や画面には接続していません。

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

固定テストは役ごとの成立・不成立、全待ち方、役牌雀頭と風の組合せ、同一分解の複数割り当て、通常形と七対子の同時成立、異なる分解での役の分離、役満分離、入力拒否、凍結入力・順序安定・重複排除を確認します。既存59件を維持しています。

未対応：立直・ダブル立直、一発、海底・河底、三色同順・一気通貫、混全帯么九・純全帯么九、混一色・清一色、二盃口、三暗刻・三槓子、小三元・混老頭、その他役満、ドラ・赤ドラ、符・点数、フリテン、鳴き・カン、和了処理・宣言UI・CPU和了宣言、リーチ・テンパイ・シャンテン判定。未対応役を成立扱いにしません。Step 8以降の機能は追加していません。

## GitHub Pages

既存のVite base `/quill-mahjong/` と`.github/workflows/deploy.yml`を維持します。mainへのpushでnpm ci → npm test → npm run build → Pagesデプロイを実行します。PagesのSourceはGitHub Actionsです。

公開URL: https://ak-sekine.github.io/quill-mahjong/

## 未実装とiPhone実機確認

実際の和了・ロン・ツモ和了処理、鳴き、リーチ、未対応役・シャンテン数、点数計算、ドラ表示、本場・供託・局進行、オンライン対戦は後続Stepの対象です。

Step 5のiPhone Safari実機検証は完了しています（利用者確認）。従来の「未確認」の記載を更新しました。Step 7はUIを変更していないため、新たな実機検証は実施していません。CSSはセーフエリアとsvhを考慮し、低い画面では最小限の縦スクロールを許容します。Chromium検証はSafari実機確認の代替ではありません。
