# Quill Mahjong

日本式リーチ麻雀WebアプリのStep 1です。現在は牌の表示確認のみで、対局処理やタップ操作はありません。

## 現在の実装

- 全34牌種（萬子・筒子・索子各1〜9、東南西北、白發中）と赤5萬・赤5筒・赤5索。
- 画面下部に固定の14枚を1行で表示。全34種類＋赤5の一覧も開いて確認できます。
- 14列の可変幅グリッド、1pxの牌間隔、最大900pxの手牌幅。セーフエリア下端に16pxの余白を追加します。

## データモデルと描画

`src/model/tile.ts` の `TileKind` は34種の論理的な牌種です。
`Tile` は `isRed` を持ち、赤牌は数牌のrank 5だけに型で制限します。
`tileKindKey` は赤・通常の5に同じキーを返すため、将来の判定処理で共通利用できます。
物理的な牌IDや牌山生成などは今回実装していません。

`src/rendering/tile-svg.ts` は60:84のSVGを生成し、DOM要素を作る関数も提供します。
筒子は円、索子は竹の線、萬子・字牌は文字で表示します。
数字と漢字はSVG内の文字を使い、麻雀牌Unicode絵文字・画像・CDN・Webフォントには依存しません。
漢字の書体にはOS差があり得ますが、SVG内の固定座標と比率で配置します。
赤5は赤色と右上の印、各牌は読み上げラベルで識別できます。
データモデルは描画に依存せず、固定手牌は `src/data/sample-hand.ts`、画面構成はHTML/CSSと `src/main.ts` に分離しています。

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
`npm test` はNode標準テストで34種の内訳・重複、赤5、手牌14枚、全37表示のSVGを検証します。
ビルド時には `src/model/tile.typecheck.ts` で赤牌の不正な型も検証します。

確認済み：npm ci、テスト4件、ビルド。Chromiumの320・375・390・1280px幅で
手牌14枚の同一行・画面内収容・横スクロールなしを確認しました。
全牌一覧の開閉、ルート文字サイズ32pxでも横方向にはみ出しません。
実測の牌幅はそれぞれ約21.34・25.28・26.34・63.34pxです。

## GitHub Pages

既存のVite base `/quill-mahjong/` とGitHub ActionsのPagesデプロイを維持しています。
`main`へのpushで `npm ci` → `npm test` → `npm run build` → Pages公開を実行します。
リポジトリのSettings → PagesのSourceはGitHub Actionsを使用します。

公開URL: https://ak-sekine.github.io/quill-mahjong/

## iPhone実機での確認（未確認）

Safariで公開URLを縦画面で開き、14枚が見分けられることと横スクロールがないことを確認してください。
アドレスバーの展開・収納、ノッチ・ホームインジケータとの余白、ピンチズーム、端末の文字サイズ設定は実機確認が必要です。
今回のChromium検証はSafari実機確認の代替ではありません。
