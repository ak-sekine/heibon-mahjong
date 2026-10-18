## Step 6：和了形判定エンジン
> **歴史資料:** 以下は整理前READMEのStep記録です。実施当時の仕様・未実装項目・検証結果を示し、現在の仕様を表すものではありません。現在の仕様は [SPEC](../SPEC.md)、実装状況は [ROADMAP](../ROADMAP.md) を参照してください。

`src/analysis/winning-shape.ts`は門前の14枚について通常形（4面子1雀頭）、七対子、国士無双を判定する純粋関数です。役なしでも形として成立します。Step 8ではStep 7の役判定を経由して、自分のツモ和了処理に接続します。DOM・SVG・GameState・物理牌IDに依存せず、入力配列と牌を変更しません。赤5は既存の`tileKindKey()`で通常の5と統合します。

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

固定テストでは各面子構成、字牌、4枚使用、赤5、七対子、国士無双、複数分解・同時成立、不正順子、入力拒否、凍結入力・不変性・順序安定性を検証します。固定乱数の合法な14枚1000手を独立した判定オラクルと比較し、面子から生成した合法な成立手500手では成立と全分解の牌数一致・順子妥当性・重複排除を確認しました。

Step 6の形判定API自体は役・和了方法を扱いません。基本役と和了方法の評価はStep 7の独立APIを使用します。未実装：テンパイ、待ち牌の探索、シャンテン数、ドラ・赤ドラの翻数、和了宣言・ボタン、点数・符、鳴き・カン、リーチ、CPU手牌評価。国士無双十三面待ちや和了牌の取得元も判定しません。和了形成立は、役を満たして実際に和了できることとは別です。
