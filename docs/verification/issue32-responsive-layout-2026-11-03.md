# Issue #32 レスポンシブレイアウト — 2026-11-03

[Issue #32](https://github.com/ak-sekine/heibon-mahjong/issues/32) のスマートフォン・タブレット・PC向けレイアウトと、操作可能性の回帰検証を記録します。Issue は iPhone Safari のユーザー実機確認後に完了判断するため、実装・公開後も Open のまま維持します。

## Git作業基準

- 作業開始時のcleanな `work` branch HEADは `716fcf567abc690eaa8ceb2c7073faefd24fe14b` でした。
- `git fetch origin` は最初プロキシ接続不可でした。承認済みネットワーク実行で再取得し、最新 `origin/main` は `ef4fcc202515437ee638cb3494d72c6cadd23101` と確認しました。開始HEADはmainより16 commit behind・0 aheadだったため、fast-forwardで最新mainを基準にしました。
- 初回実装 `19880bb17afcd915b8a6849f4363920257963fed`、横画面の牌サイズと回転後の操作検証を調整した `649040561df3431fb0984c78a78cda11f190b9b2`、診断ログを追加した `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` を順にmainへfast-forward pushしました。最終Deploy run [#41633626802](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41633626802) はSHA `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` を検証・公開し、Pages／Workerの追跡記録も同じSHAです。

## 調査で確認した実装と問題

- `index.html` は `width=device-width, initial-scale=1, viewport-fit=cover` を使い、PWAのmanifestとstandalone設定を持っています。セーフエリア用 `env()` も既存CSSにあります。
- `main` は最大620px幅で、共通UIを維持しています。手牌は14列、卓は正方形で、卓・河・牌は `--table-tile-width` 等のCSS変数とContainer Query単位から計算されます。PCで卓が過度に拡大しない既存の上限は維持します。
- 低い画面高の既存ルールは卓幅だけを `100svh - 102px` に縮めていました。`.table` 内の席・河牌は既に卓のContainer Queryサイズを参照していましたが、卓の外枠グリッドの `--table-tile-width` は親 `main` の幅基準で残っていました。そのため 667×375 や 844×390 相当では、卓枠・外側の席トラックが大きい幅のまま、内側の牌だけが小さくなり、中央の河領域が狭くなる計算不一致がありました。これが今回修正した具体的なレイアウト欠陥です。
- 手牌、CPUの手牌、河、副露、ドラ表示牌と卓中央情報、共通操作パネルはオフライン／オンラインで共有するCSS変数を使います。コール候補は通常ドキュメントフローでスクロールでき、viewport変化でページ位置を強制変更しない既存対策があります。
- 新規対局・オンライン作成／参加・待機・局結果・対局結果・ルール確認・診断ログには画面高制限、内部スクロール、固定フッターまたは44px以上の操作ボタンがあります。新規対局設定の黄色スクロールインジケーター、既存のボタン色、メニュー白背景は維持します。
- CSSには重複した `max-width:350px` の操作文字指定と、隣接した幅別の見出し固定値がありました。見出しを流体サイズにまとめ、重複指定を除きました。

## 採用したレスポンシブ設計

- 同じ画面構成と操作体系を全幅で維持し、通常の卓幅上限620pxを維持します。タブレットはPCと共通配置を使います。
- 600px以上かつ高さ850px以下の短い横画面／短いウィンドウでは、卓幅を表示高から32pxの余裕を残して広く使い、外側グリッドのタイル基準値を卓幅と揃えます。既存のinline-size containerを維持し、席・河・牌のサイズを縮小後の卓コンテナに追従させます。これにより、外側の席トラックだけが大きく中央の河領域を圧迫する計算不一致を解消し、低い画面でも牌が必要以上に縮まないようにします。操作欄は通常フローに残し、必要な分だけページスクロールで到達します。
- 卓の高さ上限には `dvh` を使い、SafariのブラウザUI表示・非表示による表示領域の変化に追従します。ページは通常フローの縦スクロールを保ち、鳴き判断時に自動スクロールでユーザー位置を戻しません。
- `main` の最小高さは既存の `vh` / `svh` fallbackに `dvh` を追加します。セーフエリア余白とPWA standalone表示を維持します。
- 見出しは `clamp()` による流体サイズにし、320px付近で14px、スマートフォン幅で約16px、広い画面で最大24pxとなるようにします。小型幅の操作余白・状態文字、360px以下のオンライン座席表示、430px以下の既存副露微調整、短い画面高と結果画面専用調整は既存の根拠を維持します。
- 端末機種名には依存しません。主要境界は幅350／360／430／599／600／960pxと高さ552／650／850pxです。600pxは最大620pxの共通レイアウト内で低高の横画面を判別する境界、850pxはPCの自然な卓寸法へ切り替える境界です。500pxは今回の短い横画面テストを分類する上限で、CSSブレークポイントではありません。個別端末用の固定解像度ルールは追加していません。

## 主な変更ファイル

- `src/style.css` — 動的viewport、流体見出し、低高viewportでの卓・牌スケール修正、ルール確認スクロール上限。
- `tests/browser-mobile-table-layout.py` — Chromium／WebKitの10代表viewport、卓・牌・河・副露の寸法、横overflow、実際の手牌選択と打牌操作を検査。
- `tests/browser-create-dialog-layout.py` — 新規対局・オンライン作成ダイアログの代表viewportを拡張。本文スクロール、黄色インジケーター、固定フッター、最終項目到達を検査。
- `tests/browser-online-dialog-layout.py` — WebKitのオンライン待機室を含むダイアログ表示・操作ボタンを10代表viewportへ拡張。
- `tests/browser-round-end-ui.py` — 結果dialogを閉じた後に順位dialogを再度開くWebKit検証に、失敗時のdialog・ボタン状態と入力イベントの診断を追加。
- `tests/run-browser-regressions.py` と `tests/test_browser_regressions_selection.py` — WebKitの卓レイアウト検証をmatrixへ登録し、ブラウザー選択件数を更新。
- `docs/verification/README.md`、`docs/ROADMAP.md` — 検証記録への導線とIssue状態を更新。

## 検証結果

### 初回Actions runで見つかった検証上の問題

- Deploy run [#41630015368](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41630015368)、実装SHA `19880bb17afcd915b8a6849f4363920257963fed` はverify成功でした。`docs-check` は記録ファイル末尾の余分な空行を検出したため、その空行を削除しました。
- Chromium／WebKitの両Browser UI jobは、打牌後にCPU手番へ移った画面を使ってviewportを回転し、操作ボタンが0件であることを失敗と判定しました。これは手番外で操作ボタンが隠れる既存動作を見たテスト手順の問題でした。回転後に新しい局を開始し、手牌を選択してから、打牌ボタンの表示領域・44px以上の大きさ・クリック先を検査するよう修正しました。このrunのBrowser UI失敗は成功扱いせず、再実行結果を下表へ追記します。

### WebKitの結果dialog再オープン再検証

- Deploy run [#41631621731](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41631621731)、SHA `649040561df3431fb0984c78a78cda11f190b9b2` はverifyとChromiumがsuccessでした。WebKitは局の結果dialogを閉じてから順位dialogを再度開く既存シナリオでタイムアウトし、matrix auditにより公開されませんでした。
- 入力イベントと全dialogの状態を失敗時に記録する診断を追加しました。最終run [#41633626802](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41633626802) ではWebKitの同じ再オープンシナリオを含むmatrix全体がsuccessとなり、診断出力を要する失敗は発生しませんでした。前回のタイムアウト原因が再現したとは扱いません。

### 最終検証・公開

- Deploy run [#41633626802](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41633626802) は実装・テストSHA `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` でverify、Chromium、WebKit、matrix audit、release freshness、Worker deploy、Worker production test、Pages build／deployがすべてsuccessでした。Browser UI manifestのChromium 38、WebKit 28、合計66 scenarioが完了しました。
- 10代表viewportの卓・手牌・河・副露と実打牌、縦横の回転相当、新規対局設定の本文末尾・固定フッター・黄色インジケーター、オンライン作成／参加／待機室のボタンと座席、結果dialog、既存PWA、複数チー候補とスクロールをChromium／WebKitの既存回帰matrixで検証しました。Playwrightのviewport emulation結果であり、実機結果ではありません。
- Cloudflare Worker `https://heibon-mahjong-online.ak-sekine.workers.dev` のdeployとHTTPS／ルーム／WebSocket／再接続／認証・プライバシーproduction testがsuccessしました。結果ログには5つの本番シナリオ成功が記録されています。
- GitHub Pages `https://ak-sekine.github.io/heibon-mahjong/` のbuildとdeployがsuccessしました。既存のGitHub Deployment SHA追跡に記録された値はWorker・Pages双方 `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` です。
- Codex実行環境からの公開URLへの直接HTTP取得はネットワークproxyの403で実施できませんでした。公開確認は、ActionsのWorker production test・Pages deploy成功・双方のDeployment SHA記録を根拠にしています。
- Issue #32はOpenです。ユーザー本人のiPhone Safari実機確認後にClose可否を判断します。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 80ファイル／テストグループ成功、合計80 pass、fail 0、skip 0（Issue #32変更後） |
| `npm run build` | 成功。TypeScript、Vite、PWA shell生成を含む |
| `npm run typecheck:worker` | 成功 |
| Browser UI matrix selection | 6項目成功。Chromium 38、WebKit 28、合計66 scenarioの選択を検証 |
| Python Browser UI構文確認 | 成功 |
| `git diff --check` | 成功（ローカルの現行差分） |
| Chromium／Playwright Browser UI | Deploy run [#41633626802](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41633626802)で38 scenario success。PWA・対局操作・10代表viewportを含む |
| WebKit／Playwright Browser UI | 同runで28 scenario success。PWA・オンラインdialog／待機室・チー候補・結果dialog再オープン・10代表viewportを含む |
| GitHub Actions・実装SHA | run `41633626802`、検証・デプロイSHA `2d89d476ddbf85ffc08af350b6ec169d7c05b64f`。verify、matrix audit、release freshnessを含む全ジョブsuccess |
| GitHub Pages・Cloudflare Worker公開SHA | Pages build/deploy、Worker deploy/production-test success。Deployment SHA追跡はいずれも `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` |

Browser UIをCodex Cloud内で実行した結果としては扱いません。プロジェクト規約に従い、ブラウザー検証は既存GitHub ActionsのChromium／WebKit matrixとDeploy gateで確認しました。Codexから直接取得できなかった公開URLは、Action deploymentのsuccessとSHA追跡を根拠に確認しています。

## 実機確認と残る範囲

- iPhone Safari実機確認：ユーザー本人による実施待ち。以下のチェックリストを使い、結果が届くまでIssue #32をOpenに保ちます。
- Android実機確認：未実施。PlaywrightのChromium結果と区別します。
- タブレット実機確認：未実施。代表viewportのブラウザー検証と区別します。
- Browser UIのviewport検証は機種実機のブラウザUI、ソフトウェアキーボード、端末固有のsafe areaを完全に再現するものではありません。

### iPhone Safari実機確認チェックリスト

各項目に **OK／NG／未確認** を付けてください。NGの場合は viewport、Safariのアドレスバー状態、操作手順も記載してください。

| 結果 | 操作 | 期待結果 |
| --- | --- | --- |
|  | Safari縦画面でオフライン対局を開始し、14枚の手牌から牌を1枚選び「打牌」を押す | 牌が選択状態になり、44px以上の打牌ボタンが押せて局が進む。牌・ボタンが横にはみ出さない |
|  | 対局中に上下へスクロールし、チー候補が複数ある局面で各チー候補と「見送る」を順に操作 | 候補すべてを選択でき、「見送る」で判断が進む。指を離した後にページ位置が勝手に戻らない |
|  | 鳴き候補を表示したままSafariのアドレスバーを表示／収納する | 表示領域が変わっても候補と操作ボタンへスクロールで到達でき、横はみ出しや重なりがない |
|  | 端末を横向きにし、手牌選択と打牌を行う | 卓が縮小され、河・副露が卓内に収まる。操作領域へスクロールしてボタンを押せる |
|  | 新規対局→ルール設定を開き、本文を最後までスクロールして一番下の設定を変更し、キャンセルする | 黄色スクロールインジケーターが本文位置に追従し、固定フッターと操作ボタンが本文に隠れない |
|  | オンラインルーム作成／参加後、待機室の座席一覧と「準備完了」「退出」を操作する | 座席名と状態が読め、操作ボタンが画面内に表示されるかスクロールで到達できる |
|  | 局結果を開き、本文末尾までスクロールし「次の局へ」を押す | 本文末尾と固定フッターのボタンへ到達でき、結果・順位が切れない |
|  | ホーム画面に追加したPWAのstandalone表示で縦横を切り替える | セーフエリア内に表示され、横スクロールなしで対局とメニューを操作でき、オフライン起動できる |
|  | iPhoneの文字拡大またはSafariページ拡大を有効にし、操作ボタンとダイアログを操作する | 重要な操作が隠れず、ダイアログ本文はスクロールでき、ボタンが画面外に固定されない |
|  | ルーム作成／参加のプレイヤー名入力欄でソフトウェアキーボードを開き、閉じる | 入力欄と確定・閉じる操作へ到達でき、キーボードの表示・非表示後に横overflowや固定フッターの重なりがない |

## 追加修正: タッチ端末のキーボード案内 — 2026-11-03

### 報告と調査

- Issue #32 の追加報告では、iPhoneのホーム画面から開いたPWAでは対局操作欄の下に「Tabで牌とボタンへ移動、Enter／Spaceで選択・確定」が見え、同じアプリをSafariで開くと見えないとのことです。提供された実機スクリーンショットではPWA側の案内表示を確認したという報告です。この環境ではiPhone実機、Safari/PWAの実画面、SafariのCSS viewport値を直接測定していません。
- `index.html` の案内は `#game-controls-template` の `.keyboard-help` に1つあります。`src/ui/action-panel.ts` の `mountActionPanel()` はこのテンプレートを複製し、オフラインでは `#local-game-controls`、オンラインでは `#online-game-controls` として使います。モード別に案内を表示する分岐はありません。
- 現行CSSの案内非表示条件は、幅350px以下、高さ650px以下、ロン判断待ちの `.ron-pending > .keyboard-help` です。幅・高さ条件はタッチ種別を見ません。`index.html` は `width=device-width, initial-scale=1, viewport-fit=cover` を指定し、manifestはstandalone表示を宣言します。`.keyboard-help` に対する `display-mode`、User-Agent、機種判定はありません。
- Safariとホーム画面PWAで表示が違った直接原因は、このコードと報告だけからは特定できません。画面高650px以下の既存メディアクエリが表示差を作った可能性はありますが、実際のSafari/PWA viewport値や局面が不明なので推測として扱います。PWA固有の不具合とは断定しません。

### 修正と設計判断

- `.keyboard-help` の基本スタイル直後に `@media (hover: none) and (pointer: coarse)` を追加し、主入力がタッチである環境では案内を `display:none` にします。画面モード、幅、高さを条件にしません。`display:none` のため操作欄内に余白は残りません。
- 既存の幅350px以下・高さ650px以下・ロン判断待ち条件はそのまま残します。タッチ向け条件も非表示だけを指定するため、既存の狭幅・低高表示や操作パネルの余白ルールは変わりません。新しい条件は既存条件を上書きせず、タッチ主入力時に画面サイズを問わず非表示を追加します。
- メディア機能はCSSが報告する主入力の性質で判定します。display-mode standalone、User-Agent、特定端末名を使いません。タッチ対応PCでも主入力がマウスなら案内は表示されます。タッチ主入力端末でTab／Enter／Spaceを使う機能はDOMのボタンとキーボード処理として残し、削除・変更していません。
- オフライン／オンラインは同一テンプレートを複製するため、同じCSS条件が適用されます。他の操作パネル・ダイアログのCSSは変更していません。
- PWAのCSSはビルド時にハッシュ付きアセットとなり、Service Workerはアプリシェルと同じ版のアセットを版付きCache Storageへ保存します。更新版のService Workerは新しいシェルを準備してから更新通知を出し、ユーザーが「更新する」を選んだ時に再読み込みします。したがって既存PWAを開いたままの場合は更新通知から更新してください。更新通知が出ない場合は、オンラインに接続してPWAを閉じて再起動し、更新を再確認してください。旧CSSと新CSSの混在はPWA Browser UIテストの更新・キャッシュ回帰でも確認します。

### 変更ファイル

- `src/style.css` — タッチ主入力時の `.keyboard-help` 非表示条件。
- `tests/browser-keyboard-help.py` — Chromium／WebKitでタッチCSSメディア機能、通常表示とChromium standalone emulationの一致、共通のoffline/onlineパネル、手牌選択・打牌・ポン、PCのTab／Enter／Space操作を検査。
- `tests/run-browser-regressions.py` と `tests/test_browser_regressions_selection.py` — Chromium／WebKit双方のBrowser UI matrixに新しい検証を登録。
- 本検証記録 — 今回の追加修正結果を追記。先行するIssue #32の記録・チェックリストは保持。

### 今回の自動検証と公開記録

| 検証 | 結果 |
| --- | --- |
| `npm test` | 80テストファイル成功、80 pass、fail 0、skip 0 |
| `npm run build` | 成功。TypeScript、Vite、版付きPWA shell生成を含む |
| `npm run typecheck:worker` | 成功 |
| Browser UI selection | 6件成功。Chromium 39、WebKit 29、合計68 scenarioを選択 |
| Browser UI Python構文確認 | 成功 |
| `git diff --check` | 成功 |
| Chromium Browser UI / Deploy gate | push後のrun ID・結果を追記予定 |
| WebKit Browser UI / Deploy gate | push後のrun ID・結果を追記予定 |
| 修正コミットSHA | commit後に追記予定 |
| Pages / Worker公開SHA | Deploy gate後に追記予定 |

Browser UIは既存ルールに従いGitHub Actionsで実行し、Playwright emulationをiPhone実機確認と扱いません。Issue #32はOpenのままです。公開後にユーザー本人がSafariとPWAの双方で案内非表示を再確認するまで完了判断を保留します。

### 初回Deploy gateのテスト修正記録

- Deploy run [#41644817445](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41644817445) はunit/integration、Worker型チェック、buildに成功しましたが、ChromiumとWebKitの新規テストがタイムアウトし、matrix auditで公開を停止しました。
- 次のrun [#41645699473](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41645699473) でも同じ待機箇所が失敗しました。GitHub check annotationで、タッチ表示確認時の `wait_for_selector()` が非表示を期待する `.keyboard-help` を既定の `visible` 状態で待っていたことを確認しました。PWA Browser UIの前後既存シナリオは両runで成功しました。
- 要素を `attached` 状態で待ってから計算済み `display:none` と0高さを調べるよう直しました。2回の失敗はテストの待機条件によるもので、製品CSSの表示差異検証結果としては扱いません。実装SHA `569df38a5ef3970eeec0c6c660f48ea91f471280` のrunは失敗し、Deploy／Pages公開はありません。再検証する最終runの結果と公開SHAは成功後に下表を更新します。
- Deploy run [#41646364720](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41646364720) では二つの検証ハーネス問題が見つかりました。ChromiumのCDP `Emulation.setEmulatedMedia` はこのrunの環境で `display-mode:standalone` を有効にせず、WebKit側はテンプレート比較用の複製パネルをホスト要素と取り違えて残し、同じ `#discard` IDを重複させていました。いずれも製品CSSの失敗ではありません。
- standalone比較をChromeの `--app` ウィンドウで確認し、比較用パネルは複製したroot自体を取り除くよう直しました。run `41646364720` もBrowser UIの失敗でmatrix auditが止まり、公開はありません。最終再検証runの結果を後述の公開記録へ追記します。
