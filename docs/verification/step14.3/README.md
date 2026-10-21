# Step 14.3 検証

## ローカル検証

2026-10-20に最終ソースに対して実行しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。50テストファイル、50成功、失敗0件 |
| `npm run build` | 成功。TypeScript型検査とVite production build |
| Python構文解析 | 成功。既存Browser UI用Pythonスクリプト38件 |
| `git diff --check` / staged diff check | tracked差分および全41 staged filesで成功。初回staged checkが開発ノートの末尾空白2件を検出し、1回修正後に成功 |
| Worker typecheck | Workerを変更していないため実行対象外 |

最終検証コマンドの開始・終了時刻、実行回数、終了コードは[処理時間記録](../codex-performance/ui-unification.md)を参照してください。テスト出力の一度の取得がツール上限で切り詰められたため、成功コードを保持した一度の最終再実行を記録しています。

## Browser UI verification

既存の[Browser UI verification workflow](../../../.github/workflows/browser-ui.yml)に次の実測比較を追加し、main push後のActionsで確認しました。Codex Cloud内ではChromiumを起動していません。

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

同じグローバルクラス参照を持つオフライン検査10本を`#local-table`配下へ修正し、幅・位置・重なりの期待値は緩めていません。run 39508741032では検証ページの起動後に別のHTML構造差が見つかりました。run 39507823447の明示的なrerunは0回です。

### Actions run 39508741032

対象SHA `64e7830c75b488a845a79a6c5f9e17cdd2e9117a`。`verify`は成功しました。Browser UIは`tests/browser-table-ui.py`の`kan-test.html` 320pxケースで失敗し、Worker deploy、production test、Pages build/deployはskipされました。

このrunは先に`tests/browser-riichi-discard-layout.py`を実行し、320・355・375・390・430・1280pxで4席の河とリーチ宣言牌を検査しました。通常牌間のSVG面の隙間は3.83〜7.41px、宣言牌の両隣は0.99〜1.02px、最大の行起点ずれは0.02pxで、全席・宣言位置に合格しました。

続く`kan-test.html`ケースで、共通操作テンプレートに必要な`return-local`がなく、ページ初期化時に`Game controls part is missing: return-local`となっていました。検証ページの操作テンプレートへ非表示ボタンを追加し、`tests/action-panel-template.test.ts`で`index.html`と`kan-test.html`の全必須部品を照合するテストを加えました。対象の単体テストは1/1成功、buildと`git diff --check`も成功です。明示的なActions rerunは0回です。

### Actions run 39509493851

対象SHA `a260af310d17f47445024fa5b46f53c2516af845`。`verify`は成功し、Browser UIは失敗しました。production test、Worker deploy、Pages build/deployはskipされました。

このrunも`tests/browser-riichi-discard-layout.py`の6幅・4席・宣言牌検査に合格しました。続く`browser-table-ui.py`は`kan-test.html`で`#local-table`を検索して矩形を得られず、`Cannot read properties of null`になりました。通常の`index.html`には同IDがありますが、検証ページは卓ルートのclassだけを持っていました。

3回目の失敗を受け、オフラインの2つのHTMLページとテスト条件をまとめて確認しました。検証ページにも`id="local-table"`を付け、同テストを拡張し、両ページに卓ルートが1つずつあること、点数欄・中央欄・操作領域のテンプレート内容が一致すること、4席・中央情報・オンライン／オフライン操作部品がすべて揃うことを検査します。修正後のローカル全テストは50/50成功、buildと`git diff --check`も成功しました。4回目のActions runで後続ブラウザースクリプトを確認します。明示的なrerunは各runとも0回です。

### Actions run 39510437512

対象SHA `3e93e5dca3d63f1b76084c34a3133539fc614ced`。`verify`は成功しました。Browser UIは一連のページ・レイアウト、河、4席副露配置（432 layout）、28個の正方卓シーン、10個のカン操作配置、得点シナリオまで進んだ後、最後の`browser-online-waiting-room.py`で失敗しました。production test、Worker deploy、Pages build/deployはskipされました。

同ブラウザーテストは、オンライン／オフラインの寸法比較、CPU番号と席風、席回転、他家の非公開牌ID非露出を通過し、自分の打牌を送信しました。失敗したのは、その後にオンライン状態メッセージが「テスト参加者の手番」を含むことを待つ箇所です。共通化後の`OnlineGameController`は「手番：テスト参加者」と表示しており、旧表示「テスト参加者の手番です。」と文言が変わっていました。

既存の状態メッセージを維持し、`テスト参加者の手番です。`に戻しました。テスト期待値は緩和していません。変更後のローカル`npm test`は50/50成功、buildと`git diff --check`も成功しました。明示的なActions rerunは0回です。

### Actions run 39511674963

対象SHA `abff375a8f11709902c29a0866570b19eb872d6b`。2026-10-20 22:56:43 UTCに開始し、23:05:46 UTCに全体成功で終了しました。実行時間は9分03秒です。

| Job | 結果 |
| --- | --- |
| `verify`（regression、Worker typecheck、build） | 成功 |
| `browser-ui / browser-ui` | 成功 |
| `deploy-worker` | 成功 |
| `production-test` | 成功 |
| `pages-build` | 成功 |
| `pages-deploy` | 成功 |

Browser UIログでは、320・355・375・390・430・1280pxの河とリーチ宣言牌の実測、オンライン・オフラインの画面寸法・席情報・操作状態・メニュー比較、CPU名と席回転、他家の非公開牌ID非露出、300 UI scenes、360中央ドラ・供託配置、432副露配置、28正方卓シーン、10カン操作配置、得点とオンライン待機室の各シナリオが成功しました。通常牌間のSVG面の隙間は3.83〜7.41px、宣言牌の隣は0.99〜1.02px、行起点の最大ずれは0.02pxでした。

iPhone Safari実機での確認は未実施です。

## 2026-10-21 オンライン待機ダイアログ追補

対象SHA `8272be811eb59f11766e98d4ad18cefc97b655e2`。ローカルの`npm test`は50/50成功、`npm run build`は成功しました。Browser UIスクリプトのPython構文解析と`git diff --check`も成功しました。Codex Cloud内ではChromiumを起動せず、既存Actionsを使いました。

### Actions run 39538777308

[対象run](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39538777308)は03:28:40 UTCに開始し、03:35:10 UTCに成功して終了しました（6分30秒）。対象SHAは`8272be811eb59f11766e98d4ad18cefc97b655e2`です。

| Job | 結果 |
| --- | --- |
| `verify`（regression、Worker typecheck、build） | 成功 |
| `browser-ui / browser-ui` | 成功 |
| `deploy-worker` | 成功 |
| `production-test` | 成功 |
| `pages-build` | 成功 |
| `pages-deploy` | 成功 |

Browser UIログの待機ダイアログ実測幅は、320px画面で282px、375pxで337px、390pxで352px、430pxで392pxでした。全幅で画面外へのはみ出し、ダイアログ内・フォーム内の横スクロールがないことを確認しています。表示名・コードが足りないときの無効状態、不足項目の補助文、両方が有効になった後の参加、作成・参加と待機ルームの既存シナリオも成功しました。

iPhone Safari実機での確認は未実施です。処理時間の内訳は[記録](../codex-performance/online-waiting-dialog.md)を参照してください。
