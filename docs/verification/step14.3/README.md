# Step 14.3 検証

## ローカル検証

2026-10-20に最終ソースに対して実行しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。49テストファイル、49成功、失敗0件 |
| `npm run build` | 成功。TypeScript型検査とVite production build |
| Python構文解析 | 成功。既存Browser UI用Pythonスクリプト38件 |
| `git diff --check` / staged diff check | tracked差分および全41 staged filesで成功。初回staged checkが開発ノートの末尾空白2件を検出し、1回修正後に成功 |
| Worker typecheck | Workerを変更していないため実行対象外 |

最終検証コマンドの開始・終了時刻、実行回数、終了コードは[処理時間記録](../codex-performance/ui-unification.md)を参照してください。テスト出力の一度の取得がツール上限で切り詰められたため、成功コードを保持した一度の最終再実行を記録しています。

## Browser UI verification

既存の[Browser UI verification workflow](../../../.github/workflows/browser-ui.yml)に次の実測比較を追加し、main push後のActionsで確認します。Codex Cloud内ではChromiumを起動しません。

- オンラインとオフラインの局サマリー、4席ラベル、卓、中央局・牌山・ドラ、河、操作領域、状態メッセージ、打牌ボタンの位置と寸法を320・375・390・430・1280pxで比較します。
- 4席回転、リーチ宣言牌、1・6・7・18枚の河について、牌SVGの位置・間隔・重なりを測定します。
- 右上メニューのコンパクトな見た目、44px以上のタップ領域、ルーム操作の利用条件、外側クリック・Escape・項目選択とフォーカス操作を確認します。
- オンラインCPU1・CPU2の表示名と席風を分け、ビューアー席の回転後も名前が維持されることを確認します。
- 他家の非公開牌IDがオンラインDOMに露出しないことを既存テストで確認します。

### Actions run 39507823447

対象SHA `3930cea127c18ca5d3cd857cce95201cba5fdad2`。GitHubコネクターでrun metadataとjob一覧を確認しました。

| Job | 結果 |
| --- | --- |
| `verify`（regression、Worker typecheck、build） | 成功 |
| `browser-ui / browser-ui` | 失敗。`tests/browser-table-ui.py`が320px・通常局面で検査を停止 |
| Worker deploy、production test、Pages build/deploy | 依存するBrowser UI失敗によりskip |

原因はUI配置ではなく、`tests/browser-table-ui.py`が`document.querySelector('.center-info')`で非表示のオンライン用パネルを選んでいたことです。取得した診断値では選ばれたオンライン側の中央パネルが0×0でしたが、ローカル側の局情報と牌山表示はそれぞれ28.80×14.39px、35.48×14.39pxで描画されていました。Actions artifactの320px診断画像にも卓・ドラ牌の重なりはありませんでした。

同じグローバルクラス参照を持つオフライン検査10本を`#local-table`配下へ修正し、幅・位置・重なりの期待値は緩めていません。修正版は次の1回のmain pushでBrowser UIを再確認します。run 39507823447の明示的なrerunは0回です。

### Actions run 39508741032

対象SHA `64e7830c75b488a845a79a6c5f9e17cdd2e9117a`。`verify`は成功しました。Browser UIは`tests/browser-table-ui.py`の`kan-test.html` 320pxケースで失敗し、Worker deploy、production test、Pages build/deployはskipされました。

このrunは先に`tests/browser-riichi-discard-layout.py`を実行し、320・355・375・390・430・1280pxで4席の河とリーチ宣言牌を検査しました。通常牌間のSVG面の隙間は3.83〜7.41px、宣言牌の両隣は0.99〜1.02px、最大の行起点ずれは0.02pxで、全席・宣言位置に合格しました。

続く`kan-test.html`ケースで、共通操作テンプレートに必要な`return-local`がなく、ページ初期化時に`Game controls part is missing: return-local`となっていました。検証ページの操作テンプレートへ非表示ボタンを追加し、`tests/action-panel-template.test.ts`で`index.html`と`kan-test.html`の全必須部品を照合するテストを加えました。対象の単体テストは1/1成功、buildと`git diff --check`も成功です。3回目のBrowser UI runで後続検査を確認します。明示的なActions rerunは0回です。

iPhone Safari実機での確認は未実施です。
