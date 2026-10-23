# 結果ダイアログの和了手牌サイズ統一

確認日: 2026-10-23

## 原因と修正

牌SVGの元データはすべて `viewBox="0 0 60 84"` で、牌の外枠も共通でした。サイズ差はSVGや牌種ごとの描画ではなく、和了手牌のCSSにありました。13列を `1fr`、14列目を `1.25fr` とし、さらに `.winning-draw` に左paddingを付けていたため、末尾の北は和了牌でなくても大きくなり、和了牌に指定された6筒は小さくなっていました。

14列を均等にし、各セルに牌と同じ縦横比を指定しました。牌SVGはセル全体へ描画されます。ローカル・オンラインの結果と公開手牌で同じCSSを使います。牌画像、ゲームロジック、点数計算は変更していません。

## 検証

- `npm test`: 54ファイル成功、失敗0。
- `npm run build`: 成功。
- `git diff --check`: 成功。
- `tests/browser-result-hand-layout.py` をBrowser UI verificationへ追加しました。添付例の6筒・末尾の北を含む14枚、萬子・筒子・索子・字牌34種、結果表示のローカル／オンライン領域を確認し、セル・SVG・外枠の実寸と下端が揃うこと、横はみ出しがないことを検査します。Chromiumは320・375・390・414・1280px、WebKitは320・375・390・414pxで実行します。
- [Browser UI verification run 39956868118](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39956868118): commit `f4e403d` で成功。追加した寸法検証を含む既存UI回帰が通過しました。
- [Deploy run 39956868090](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39956868090): commit `f4e403d` で成功。GitHub PagesとCloudflare Workersへのdeployが完了しました。
- WebKitの狭幅検証は成功しました。iPhone Safari実機では未確認です。
