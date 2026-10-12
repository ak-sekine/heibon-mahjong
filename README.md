# Quill Mahjong

日本式リーチ麻雀のStep 3。プレイヤー1人とCPU3人の配牌直後を4人卓で表示します。打牌やツモなどの進行処理はまだありません。

## 画面

プレイヤーIDで席を固定しています。0は下（自分）、1は右（CPU1）、2は上（CPU2）、3は左（CPU3）です。各席の風、親、枚数は `PlayerState` と `GameState` から描画します。自分の手牌13枚は牌種順、追加牌は右端に間隔を空けて表示します。表向き牌には物理牌IDを `data-tile-id` として付けています。CPU牌は同じCSS製の裏向き牌を手牌枚数だけ表示し、牌面もIDもDOMへ出しません。スクリーンリーダーにはCPUの名前、風、枚数だけを伝えます。

中央には上下左右それぞれ独立した空の河を確保し、生きた牌山と王牌の枚数を表示します。河への捨て牌追加は未実装です。「新しい対局」はページ遷移せず `startGame()` で配牌し直します。全34牌種と赤5の一覧は閉じた状態の開発用表示です。

## 構造

- `src/model/tile.ts`、`src/model/game.ts`：牌と `PhysicalTile`、`PlayerState`、`GameState`。
- `src/game/`：Step 2の136枚生成、シャッフル、王牌確保、4人配牌。配牌後の生きた牌山は69枚、王牌は14枚。
- `src/rendering/tile-svg.ts`：既存の60:84の表向き牌SVG。
- `src/rendering/table.ts`：状態から自分の手牌、CPU裏向き牌、席ラベル、中央情報を更新。河の独立コンテナは `index.html` に配置。
- `src/main.ts`：対局開始ボタンと開発用牌一覧。

## 開発と公開

Node.js 24を使用します。実行時ライブラリは追加していません。

```sh
npm ci
npm test
npm run build
npm run dev
```

Viteのbaseは `/quill-mahjong/` です。`main` へのpushでGitHub Actionsがテスト、ビルド、Pages公開を行います。公開URL: https://ak-sekine.github.io/quill-mahjong/

iPhone Safari実機では、14枚の視認性、左右のCPUラベル、アドレスバーの展開・収納、ノッチとホームインジケータの余白、文字サイズ設定を確認してください。
