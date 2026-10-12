# Quill Mahjong

日本式リーチ麻雀WebアプリのStep 2です。「新しい対局」で牌山生成・シャッフル・配牌を行います。ツモ・打牌・CPU思考などのターン進行は未実装です。

## 現在の実装

- 全34牌種（萬子・筒子・索子各1〜9、東南西北、白發中）と赤5萬・赤5筒・赤5索。
- 画面下部に自分の配牌14枚を1行で表示。13枚は萬子・筒子・索子・字牌の順に整列し、親の追加1枚は右端に離して表示。CPU3人は枚数だけ表示。全34種類＋赤5の一覧も開いて確認できます。
- 14列の可変幅グリッド、1pxの牌間隔、最大900pxの手牌幅。セーフエリア下端に16pxの余白を追加します。

## データモデルと描画

`src/model/tile.ts` の `TileKind` は34種の論理的な牌種です。
`Tile` は `isRed` を持ち、赤牌は数牌のrank 5だけに型で制限します。
`tileKindKey` は赤・通常の5に同じキーを返すため、将来の判定処理で共通利用できます。
`src/model/game.ts` の `PhysicalTile` は対局内で一意のIDと `Tile` を持ちます。
`GameState` は `dealerId`、4人の `PlayerState`、`liveWall`、`deadWall` を保持します。
各プレイヤーの `hand` は13枚、`drawnTile` は親の追加1枚（子はnull）です。
`src/game/wall.ts` は136枚生成（各5は通常3枚＋赤1枚）と末尾14枚の王牌確保、
`shuffle.ts` は入力を変更しないFisher-Yates、`deal.ts` は親から順に13巡配った後に親の追加牌を取得、
`start.ts` はこれらを組み合わせます。配牌後の生きた牌山は69枚です。
`startGame(random, dealerId)` で乱数源と親を差し替えできます。画面はMath.randomと親0を使用します。
物理牌IDは新しい対局で再利用され、対局をまたぐ識別子ではありません。

`src/rendering/tile-svg.ts` は60:84のSVGを生成し、DOM要素を作る関数も提供します。
明るいクリーム色の牌面に、控えめな縁と下端の陰影を付けています。
萬子は漢数字と赤い「萬」、筒子は大きな同心円、索子は節のある竹（一索はオリジナルの鳥）、
字牌は太めの文字、白は淡い青灰色の二重枠で表示します。通常5筒は中央のみ赤、赤5筒は全円が赤です。
参考ページ（https://www.sozai-library.com/sozai/7198）は雰囲気の参考のみとし、画像のコピー・トレース・取り込みは行っていません。
数字と漢字はSVG内の文字を使い、麻雀牌Unicode絵文字・画像・CDN・Webフォントには依存しません。
端末内のゴシック系書体を使います。漢字の書体にはOS差があり得ますが、SVG内の固定座標と比率で配置します。
赤5は赤色と右上の印、各牌は読み上げラベルで識別できます。
データモデルは描画に依存せず、旧固定手牌は描画回帰テスト用に `src/data/sample-hand.ts` に残し、画面構成はHTML/CSSと `src/main.ts` に分離しています。

## 開発・検証

Node.js 24を使用します（`nvm use`）。追加の実行時ライブラリはありません。

```sh
npm ci
npm test
npm run build
npm run dev
```

```sh
npm run preview
```

プレビューの `/quill-mahjong/` を開いてください。
`npm test` はNode標準テスト11件で牌種・SVGに加え、136枚の内訳、ID重複なし、シャッフルの保存性と再現性、入力非破壊、王牌・配牌、親変更、100種類の乱数による配牌の整合性を検証します。
ビルド時には `src/model/tile.typecheck.ts` で赤牌の不正な型も検証します。

Step 2確認済み：npm ci、テスト11件、ビルド。
Chromiumの320・375・390・1280px幅で、14枚の同一行・画面内収容・横スクロールなしを確認しました。
各幅で「新しい対局」を20回操作し、手牌更新、CPU各13枚、生きた牌山69枚、王牌14枚、追加牌の独立表示を確認しました。
全牌一覧の開閉とルート文字サイズ16・32pxでも横スクロールがなく、ボタンは48px以上の高さです。
SVGデザイン、セーフエリア、Pages設定は維持しています。

## GitHub Pages

既存のVite base `/quill-mahjong/` とGitHub ActionsのPagesデプロイを維持しています。
`main`へのpushで `npm ci` → `npm test` → `npm run build` → Pages公開を実行します。
リポジトリのSettings → PagesのSourceはGitHub Actionsを使用します。

公開URL: https://ak-sekine.github.io/quill-mahjong/

## iPhone実機での確認（未確認）

Safariで公開URLを縦画面で開き、14枚が見分けられることと横スクロールがないことを確認してください。
アドレスバーの展開・収納、ノッチ・ホームインジケータとの余白、ピンチズーム、端末の文字サイズ設定は実機確認が必要です。
今回のChromium検証はSafari実機確認の代替ではありません。

