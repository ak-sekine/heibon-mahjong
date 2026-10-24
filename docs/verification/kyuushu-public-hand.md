# 九種九牌の公開手牌

## 対象

- 確定した九種九牌の宣言者IDを使い、卓上と結果詳細に宣言者の14枚だけを表示する。
- オンラインでは未確定状態の秘匿、確定後の全席公開、保存状態からの復元を確認する。
- 狭幅の卓表示と、次局開始後の公開解除をブラウザー検証に含める。

## 自動検証

- `npm test`：55件成功。
- `npm run build`：TypeScriptチェックとVite本番ビルド成功。
- `npm run typecheck:worker`：成功。
- `git diff --check`：成功。
- ブラウザースクリプトは `py_compile` 成功。対象コミット `6868f2f` のGitHub Actions Browser UI verification (`40061694152`) は再実行で成功。追加したChromium・WebKitシナリオを含むブラウザー回帰全体が成功した。
- 最初のBrowser UI実行は `tests/step14-0-1.test.ts:753` のCPU手番進行待ちで失敗した。変更対象外の同期テストを含む再実行では全テストとブラウザー検証が成功した。
- GitHub Actions Deploy run `40061694248`：回帰テスト、Worker型チェック、本番Workerデプロイ、本番HTTPS/WebSocket/再接続/プライバシーテスト、Pagesビルド、Pagesデプロイがすべて成功。
- WebKit検証はPlaywrightのiPhone相当設定（タッチ・モバイル表示）で390px幅と320px幅を確認した。iPhone Safari実機の確認は未実施。

## ケース

- ローカル：人間宣言とCPU宣言、卓上14枚、他家の非公開、結果の再表示、次局での公開解除。
- オンライン：人間宣言とCPU宣言、宣言確定前の手牌非配信、確定後の全席公開、14枚の結果詳細、保存・再接続後の復元、次局での公開解除。

## 公開牌の間隔再確認（2026-10-24）

- 卓上の公開手牌コンテナを内容幅で配置し、通常手牌と同じ1px gapおよび固定牌幅を維持するよう修正。自分の公開手牌も通常手牌の固定セル幅・高さで描画する。
- `tests/browser-test-page.py` に公開14枚の牌サイズ一致、固定gap、flex縮小なし、列幅の不自然な伸長なしの検査を追加。test.htmlで自分・CPU1・CPU2・CPU3を320px・375px・390px・430pxで確認し、通常版へのテスト操作混入と既存カン検証ページも確認。
- `npm test`（56件）、`npm run build`、`npm run typecheck:worker`、`git diff --check` が成功。
- [Browser UI verification run 40076750925](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40076750925)：commit `087648e34ba7c021250259d2dcd35edd68efec29` で成功。ChromiumとWebKitの全ブラウザー回帰が成功し、和了手・流局テンパイ手牌を含む既存結果画面検証も通過。
- Chromium／WebKitのブラウザー検証結果であり、iPhone Safari実機は未確認。

## iPhone Safari 実機検証の追加報告（2026年10月24日）

- 状態：**実機確認済み・完了**。
- 確認者：ユーザー。
- 環境：iPhone Safari。
- 対象：コミット `05c73ae744bf1fc839c4a666177e6c8edae007dd` の九種九牌・公開手牌レイアウト修正。
- 結果：問題なし（OK）。公開手牌の牌幅・牌間隔を修正した後、iPhoneで表示に問題がないとの報告を受けた。
- 確認範囲：公開手牌のレイアウト表示。個別シナリオや表示項目ごとの確認は報告されていないため、全ケースの実機確認を示すものではない。
- 検証方法の区別：自動テストの結果は「自動検証」、Chromium／WebKitの結果は上記ブラウザー検証の記録を参照。今回の結果は、それらとは別のiPhone Safari実機確認。
- 上記の「実機は未確認」は、各ブラウザー検証記録時点の状態。今回の報告により、本件の現在の検証状態を実機確認済み・完了とする。
