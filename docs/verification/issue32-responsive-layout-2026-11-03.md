# Issue #32 レスポンシブレイアウト — 2026-11-03

[Issue #32](https://github.com/ak-sekine/heibon-mahjong/issues/32) のスマートフォン・タブレット・PC向けレイアウトと、操作可能性の回帰検証を記録します。iPhone Safari／PWAの追加修正3件はユーザー報告でOKです。PCではユーザー本人が対局画面を確認し、卓の縦サイズと文字サイズの2点をNGと報告したため、PCレイアウトを追加修正し、公開後の実機再確認までIssueをOpenに保ちます。

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

- 同じ画面構成と操作体系を全幅で維持します。スマートフォン・タブレットの卓幅上限620pxは維持し、960px以上のPC配置と卓幅は下記「追加修正: PC対局レイアウト」で更新しました。タブレットは従来どおり共通配置を使います。
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
- Issue #32はOpenです。PC実機で報告された2点のNGを追加修正し、公開後にユーザー本人が再確認した結果と、他の未確認項目を合わせてClose可否を判断します。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 80ファイル／テストグループ成功、合計80 pass、fail 0、skip 0（Issue #32変更後） |
| `npm run build` | 成功。TypeScript、Vite、PWA shell生成を含む |
| `npm run typecheck:worker` | 成功 |
| Browser UI matrix selection（初回レスポンシブ変更） | 6項目成功。Chromium 38、WebKit 28、合計66 scenarioの選択を検証 |
| Python Browser UI構文確認 | 成功 |
| `git diff --check` | 成功（ローカルの現行差分） |
| Chromium／Playwright Browser UI | Deploy run [#41633626802](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41633626802)で38 scenario success。PWA・対局操作・10代表viewportを含む |
| WebKit／Playwright Browser UI | 同runで28 scenario success。PWA・オンラインdialog／待機室・チー候補・結果dialog再オープン・10代表viewportを含む |
| GitHub Actions・実装SHA | run `41633626802`、検証・デプロイSHA `2d89d476ddbf85ffc08af350b6ec169d7c05b64f`。verify、matrix audit、release freshnessを含む全ジョブsuccess |
| GitHub Pages・Cloudflare Worker公開SHA | Pages build/deploy、Worker deploy/production-test success。Deployment SHA追跡はいずれも `2d89d476ddbf85ffc08af350b6ec169d7c05b64f` |

Browser UIをCodex Cloud内で実行した結果としては扱いません。プロジェクト規約に従い、ブラウザー検証は既存GitHub ActionsのChromium／WebKit matrixとDeploy gateで確認しました。Codexから直接取得できなかった公開URLは、Action deploymentのsuccessとSHA追跡を根拠に確認しています。

## 実機確認と残る範囲

| 対象 | ユーザー実機報告 | 補足 |
| --- | --- | --- |
| iPhone Safari／ホーム画面PWAの追加修正 | OK 3件、NG 0件 | ユーザー本人の報告。個別内訳は報告に含まれていないため、操作内容や端末情報は補っていません |
| PCブラウザーの対局画面 | NG 2件 | 卓の下端と操作欄が初期表示領域から外れる、プレイヤー名・点数・卓中央情報が小さく読みづらい。OS、ブラウザー、viewportの詳細は未報告。その他のPC確認項目は未確認 |

- 以前からのiPhoneチェックリストは網羅記録として残します。
- PCブラウザーの実機確認：卓表示と文字サイズでNG報告あり。修正版の実機再確認は未実施です。ウィンドウサイズ変更、マウス、キーボード、ダイアログ、オンライン対局は今回確認された事実ではなく、未確認のまま維持します。修正版のPC実機再確認をClose判断の必須条件とします。
- Android実機確認：未実施。必須条件ではありません。PlaywrightのChromium結果と区別します。
- タブレット実機確認：未実施。必須条件ではありません。代表viewportのブラウザー検証と区別します。
- Browser UIのviewport検証は機種実機のブラウザUI、ソフトウェアキーボード、端末固有のsafe areaを完全に再現するものではありません。

### 受け入れ条件と既存のChromium／WebKit自動検証の照合

| 受け入れ条件 | 既存の自動検証・記録 | 判定と残る確認 |
| --- | --- | --- |
| スマートフォン・タブレット・PCの代表viewportで主要画面を操作できる | 既存Deploy run [#41649796576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41649796576) はChromium 39／WebKit 29 scenario、320×568〜1440×900の10代表viewportと縦横変更相当を確認。今回の追加PC検証は4 viewportをChromium／WebKitで実行 | 代表viewportは自動検証で確認。今回のPC実機報告では卓と文字がNG。公開後のユーザー本人による再確認待ち |
| 牌・ボタン・文字の重なり、意図しない横スクロール、操作不能な領域がない | 既存検証で卓・手牌・河・副露、横overflow、操作領域、ダイアログとオンライン待機室を確認。今回のPC検証ではスクロール前のヘッダー・点数・卓・操作ボタン、名前／点数／局情報の文字サイズ、18枚河、1／4副露局面の重なり、リサイズ後を検査 | PCの自動検証を追加。ユーザー実機での見え方・実操作の再確認は未実施 |
| チー複数候補、ロン、カン、結果ダイアログなどを回帰検証する | WebKit 29 scenarioで複数チー候補・見送り・スクロール・結果dialog再オープン等を確認。Chromium／WebKitの既存Browser UI matrixで対局操作・ダイアログ回帰を確認 | 自動回帰検証済み。全局面や全端末を網羅するものではない |
| iPhone Safariでユーザー本人が実機確認する | 今回報告されたiPhone Safari／PWAの追加修正3件はすべてOKとして記録 | 追加修正3件はOK。既存の広範なiPhone確認項目はチェックリスト上で個別に記録する |
| Android・タブレットの実機未確認は明記し、エミュレーションと区別する | 本記録に未実施と記載 | 明記済み。いずれも必須条件ではない |
| 設計方針・検証結果を記録する | 本記録、検証目次、ロードマップに記載 | 記録済み |
| 追加条件：ユーザー本人がPCブラウザーで実機確認する | ユーザー本人から卓サイズと文字サイズのNG 2件が報告され、今回の追加修正と自動検証を実施 | 修正版の卓表示を本人が再確認するまでIssueはOpen。下記のウィンドウ変更など他のPC項目は未確認 |

### PCブラウザー実機確認チェックリスト

PCの実ブラウザーで各項目を確認し、**OK／NG／未確認** を記録してください。少なくともOS、ブラウザー名・バージョン、画面解像度、ウィンドウサイズを併記してください。NGの場合は再現操作と画面状態も記録してください。

| 結果 | 確認項目・操作 | 期待結果 |
| --- | --- | --- |
| NG（修正版の再確認待ち） | 卓表示：広いウィンドウでオフライン対局を開始し、卓・4席・河・副露・手牌・卓中央情報を確認する | 卓が見やすい大きさで表示され、席・河・副露・情報が重ならず、ブラウザー幅に応じた横スクロールが発生しない |
| 未確認 | ウィンドウサイズ変更：対局中にウィンドウの幅と高さを広い／狭いサイズへ何度か変更し、短い横長サイズも確認する | 卓と牌が再配置・縮小し、河領域や操作欄が潰れない。意図しない横overflow、重なり、画面外に残る操作部品がない |
| 未確認 | マウス操作：手牌をクリックで選択し、打牌、チー候補、ポン、ロン／カン等の表示された操作をクリックする | ポインター位置どおりの牌・ボタンが選択され、操作が1回ずつ反映される。選択状態やカーソル位置で誤操作しない |
| 未確認 | キーボード操作：Tabでフォーカスを進め、Enter／Spaceで牌・ボタンを選択・確定する。フォーカスを見失わないか確認する | フォーカス位置が見え、案内に記載されたキー操作が機能する。マウス操作と併用しても入力が詰まらない |
| 未確認 | ダイアログ：新規対局／ルール設定、オンライン作成・参加、結果・順位などのダイアログを開閉し、本文末尾までスクロールする | タイトル・本文・閉じる操作が読める。固定フッターやボタンが本文を隠さず、開閉後に卓の操作へ戻れる |
| 未確認 | オンライン対局：PCブラウザーでルームを作成または参加し、待機室の座席・準備・退出を操作して対局を進める | 座席・接続状態・操作ボタンが読みやすく、マウスまたはキーボードで操作できる。対局中も卓・手牌・操作欄に重なりやoverflowがない |

### iPhone Safari実機確認チェックリスト

各項目に **OK／NG／未確認** を付けてください。NGの場合は viewport、Safariのアドレスバー状態、操作手順も記載してください。

| 結果 | 操作 | 期待結果 |
| --- | --- | --- |
|  | Safari縦画面でオフライン対局を開始し、14枚の手牌から牌を1枚選び「打牌」を押す | 牌が選択状態になり、44px以上の打牌ボタンが押せて局が進む。牌・ボタンが横にはみ出さない |
|  | Safariブラウザーで対局を始め、共通操作欄の案内を確認する | 「Tabで牌とボタンへ移動、Enter／Spaceで選択・確定」が表示されず、余分な空白がない。手牌選択・打牌・チー／ポン選択はタッチで操作できる |
|  | 対局を終えてからオンラインに接続し、PWAに更新案内があれば「更新する」を押して再読み込み後、ホーム画面からPWAを起動し同じ操作欄を確認する | Safariと同じく案内が表示されず、余分な空白がない。手牌選択・打牌・チー／ポン選択がタッチで動作し、Safariとの表示条件が一致する |
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
- `tests/browser-keyboard-help.py` — Chromium／WebKitでタッチCSSメディア機能、通常表示とstandaloneクエリhintを置いた表示の一致、非表示CSSルールにdisplay-mode依存がないこと、共通のoffline/onlineパネル、手牌選択・打牌・ポン、PCのTab／Enter／Space操作を検査。standalone hintはHeadless Browser内のJS状態シミュレーションで、実インストールPWA表示とは区別します。
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
| Chromium Browser UI | run [#41649796576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41649796576) で39 scenario success。新規案内検証は2.580秒でsuccess |
| WebKit Browser UI | 同runで29 scenario success。新規案内検証は2.763秒でsuccess |
| Deploy gate | run [#41649796576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41649796576) がSHA `653decf9cf06ff0e73772b4c0db765345c9330e7` でsuccess。verify、Browser UI matrix audit、release freshness、Worker deploy／production test、Pages build／deployを含む |
| 主なCSS修正コミット | `569df38a5ef3970eeec0c6c660f48ea91f471280` |
| 検証・公開SHA | Worker、GitHub Pagesとも `653decf9cf06ff0e73772b4c0db765345c9330e7` |
| GitHub Pages公開先 | [https://ak-sekine.github.io/heibon-mahjong/](https://ak-sekine.github.io/heibon-mahjong/) — deployment status success、同SHA |
| Worker | `heibon-production-worker` deployment status success、production test success、同SHA |
| GitHub Issue | [#32](https://github.com/ak-sekine/heibon-mahjong/issues/32) はOpenを維持 |

Browser UIは既存ルールに従いGitHub Actionsで実行し、Playwright emulationを実機確認と扱いません。iPhone Safari／PWAの追加修正3件はユーザー報告でOKです。PCでは卓表示と文字サイズのNGが報告され、修正後の実機再確認待ちです。Issue #32はOpenのままです。

### 初回Deploy gateのテスト修正記録

- Deploy run [#41644817445](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41644817445) はunit/integration、Worker型チェック、buildに成功しましたが、ChromiumとWebKitの新規テストがタイムアウトし、matrix auditで公開を停止しました。
- 次のrun [#41645699473](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41645699473) でも同じ待機箇所が失敗しました。GitHub check annotationで、タッチ表示確認時の `wait_for_selector()` が非表示を期待する `.keyboard-help` を既定の `visible` 状態で待っていたことを確認しました。PWA Browser UIの前後既存シナリオは両runで成功しました。
- 要素を `attached` 状態で待ってから計算済み `display:none` と0高さを調べるよう直しました。2回の失敗はテストの待機条件によるもので、製品CSSの表示差異検証結果としては扱いません。実装SHA `569df38a5ef3970eeec0c6c660f48ea91f471280` のrunは失敗し、Deploy／Pages公開はありません。後続の修正後、最終Deploy run `41649796576` で検証・公開が成功しました（結果は上表を参照）。
- Deploy run [#41646364720](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41646364720) では二つの検証ハーネス問題が見つかりました。ChromiumのCDP `Emulation.setEmulatedMedia` はこのrunの環境で `display-mode:standalone` を有効にせず、WebKit側はテンプレート比較用の複製パネルをホスト要素と取り違えて残し、同じ `#discard` IDを重複させていました。いずれも製品CSSの失敗ではありません。
- 次のDeploy run [#41647193250](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41647193250) では、headless Chromeの `--app` 起動も `display-mode:standalone` を示さないことを確認しました。Chromiumではテスト専用のstandalone media-query hintを使い、Viteから取得したCSSソースにdisplay-mode条件がないことを確認する方式に変更しました。これは実インストールPWAの描画modeを再現するものではなく、実機確認は引き続き待ちです。
- 同runのWebKit Browser UI matrixは成功しました。Chromiumだけがstandalone判定で失敗したため、matrix auditがDeployを止め、Pages更新はありません。
- Deploy run [#41647893037](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41647893037) はverify/buildに成功し、WebKit matrixもsuccessしました。Chromiumでは通常・standalone query hint双方の計算済み表示は `none` でしたが、CSSOM列挙が空結果となるテストハーネス問題で失敗しました。Viteから `src/style.css` の実ソースを取得してpointer条件とdisplay-mode非依存を確認するよう直し、次runでChromiumも通過しました。Deployはchromium matrix failureにより未実行でした。
- 最終Deploy run [#41649796576](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41649796576) はhead SHA `653decf9cf06ff0e73772b4c0db765345c9330e7` でsuccessしました。Chromium 39 scenario／WebKit 29 scenario、matrix audit、Worker deployとproduction test、Pages buildとdeployがすべてsuccessし、Worker／Pages deployment SHAは同じ `653decf9cf06ff0e73772b4c0db765345c9330e7` です。

## 追加修正: PC対局レイアウト — 2026-11-03

### 実機報告と修正対象

- ユーザー本人がPCブラウザーで対局画面を確認し、(1) 卓が大きく、卓の下端と操作欄が初期表示領域から外れる、(2) プレイヤー名・持ち点・卓中央の局情報が小さく読みづらい、と報告しました。
- 報告にはOS、ブラウザー名・バージョン、画面解像度、ウィンドウ寸法が含まれていません。実機確認で分かったのはこの2点のみです。ウィンドウ変更、マウス・キーボード操作、ダイアログ、オンライン対局は未確認として扱います。

### 現行CSSの調査

- 追加修正前は `@media (min-width:960px)` の `main` 最大幅が1000pxで、点数表示・正方形の卓・操作欄を縦に積んでいました。高さ850px以下では卓幅だけを `min(100%, 100dvh - 32px)` に調整しており、ヘッダー・点数表示・操作欄の高さを引いた余裕は計算に含まれませんでした。
- 追加修正前の `1280×720` では卓だけで688px（720−32px）、`1366×768` では736pxでした。`1440×900`／`1920×1080` はmain幅から最大1000pxの卓になり得ます。CSS上の縦積みをヘッダー44px、点数表示約48px（4行×約12px）、操作欄約107px、主なgapと上下padding約48pxとして合算すると、それぞれ約935px、983px、1247px、1247pxを要します。これはCSS寸法からの概算で、ユーザーの実機寸法の測定値ではありません。
- `.seat-label` と `.score-strip .seat-label` は10px、`.center-info` は8〜11px、`.round-summary` は12〜15pxの指定でした。卓が小さくなるほど同じ比率で文字まで縮むことが読みづらさにつながります。

### PC向けの修正

- 960px以上ではゲーム画面のmain最大幅を1440pxに広げ、卓の横に点数表示と操作欄を置きます。スマートフォン幅では `#local-game-layout` を `display:contents` とし、既存の縦方向の共通UIを維持します。
- 正方形の卓幅は `min(利用可能な列幅, 860px, 100dvh - 80px)` とします。ヘッダーと上下余白を考慮したCSS上限は `1280×720` で640px、`1366×768` で688px、`1440×900` で820px、`1920×1080` で860pxです。CSS Container Queryを引き続き使い、牌・河・ドラ・副露の寸法を卓の実幅から計算します。PCのタイル上限を52pxに広げ、座席と河の基準を揃えました。
- プレイヤー名と持ち点（`.score-strip .seat-label`）は14px、卓中央情報は14px、局ラベルは16px、残り牌数は14pxにします。文字サイズを卓縮小率に連動させず、ドラ表示牌は牌として重なり検査に含めます（見出し文字はありません）。
- オンライン対局にも同じ卓・点数・操作欄の横並びを適用します。麻雀のルール・操作イベント・ボタンの役割や配色は変更していません。

### 追加したPC Browser UI検証

- `tests/browser-pc-table-layout.py` をChromium／WebKitのBrowser UI matrixへ追加しました。`1280×720`、`1366×768`、`1440×900`、`1920×1080`で、スクロール前のヘッダー・点数表示・卓・通常手番の打牌ボタンがviewport内にあり、ボタン中心が実際にクリックできることを検証します。
- 各viewportで文字サイズを測定し、18枚の河、1面子／4面子とカンの副露局面を使って、卓中央情報やプレイヤー表示と牌・河・ドラ・副露の重なりを検査します。
- 各viewportで幅を160px、高さを80px縮めてから元へ戻し、表示位置を再検査します。マウスの牌選択と打牌、Tabで操作ボタンへ移動するEnter／Space操作も検証します。主要操作ボタンを`scroll_into_view`した後だけの確認にはしません。既存のスマートフォン縦横・タブレット検証はBrowser UI matrixに残しています。
- PC Browser UI追加直後のrun [#41659923772](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41659923772) は、テーブルをラッパー要素内に移した後の既存テストが旧 `main > .table` セレクターを使ってChromiumで失敗しました。後続run [#41661042894](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41661042894) では横並びのPC配置を既存操作欄テストが縦積み前提で判定して失敗しました。両方ともテストのDOM／配置前提を修正し、検証結果としては扱いません。
- run [#41664155236](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41664155236) では4つの指定PC viewportの追加テストがChromiumで通り、WebKitのBrowser UIも成功しました。一方、Chromiumの既存四人槓局面テストが1280×800で副露牌の卓上端はみ出しと、右側副露・下家の手牌の接触を検出しました。matrix auditが失敗し、このrunではDeploy gateと公開を実行していません。
- 角の余白を確保するためPCだけ牌幅の計算係数を15.8から16.2へ変更し、左右の副露表示の横方向offsetを内側へ調整しました。修正コミット `74570f3ccdb7c8b808822de998840937aeb26a02` は `2026-11-03` にmainへ直接pushしました。
- PC追加修正後、ローカル `npm test` は1431件成功、`npm run build` と `npm run typecheck:worker` は成功しました。Browser UI matrix selectionは7件成功し、Chromium40／WebKit30、合計70 scenarioを選びます。

### PC修正の最終検証・公開

- Deploy run [#41666741261](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41666741261) はhead SHA `74570f3ccdb7c8b808822de998840937aeb26a02` でsuccessしました。Chromium 40 scenario、WebKit 30 scenario、matrix audit、release freshness、Worker deploy、Worker production test、Pages build／deployがすべてsuccessです。
- ChromiumとWebKitの両方で4つの指定viewportを検査しました。初期表示の卓は `1280×720` で640px（上端66／下端706）、`1366×768` で688px（66／754）、`1440×900` で820px（66／886）、`1920×1080` で860px（136／996）の正方形です。ページは初期スクロール位置0で、縦横overflowがありません。
- 4サイズすべてで打牌ボタンはスクロールなしでviewport内にあり、幅・高さ44px以上でクリック可能でした。`.score-strip .seat-label` と卓内のプレイヤー表示は14px、中央局情報は14px、局表示は16pxです。18枚の河を含む1面子／4面子（大明槓を含む）の局面でも、名前・局情報と手牌・河・ドラ表示牌・副露の検査結果は重なり0件でした。
- 各サイズで幅を160px・高さを80px小さくして再検査し、元のviewportへ戻して位置を再確認しました。通常手番のマウスで牌を選択して打牌する操作、Tab／Enter／Spaceによるキーボード操作もすべて成功しました。既存の `browser-seat-kan-overlap.py` は1280×800の四人槓を含む各座席・副露局面で成功し、スマートフォン縦横・タブレットを含む既存matrixもChromium／WebKitで通過しました。
- `heibon-production-worker` と `heibon-production-pages` の最新成功Deployment SHAはどちらも `74570f3ccdb7c8b808822de998840937aeb26a02` です。Pagesの公開先は [https://ak-sekine.github.io/heibon-mahjong/](https://ak-sekine.github.io/heibon-mahjong/) です。Issue #32はOpenのままです。
- PlaywrightはGitHub ActionsのBrowser UI環境で実行し、Codex Cloud内の実ブラウザーやユーザーのPC実機確認とは区別します。本人による修正版PCの再確認までIssueはOpenを維持します。以前のiPhone Safari／PWAの追加修正3件のOK記録は維持し、ウィンドウサイズ変更・実機マウス／キーボード・ダイアログ・オンライン対局などのPC実機項目は未確認です。

## 追加修正: PCルール設定スクロールバー（2026-11-08）

- ユーザー本人のPC実機報告: **NG**。ルール設定画面の黄色いスクロールバーをマウスでドラッグしてもスクロールできない。旧実装は位置表示のみで、ドラッグ操作がなかった。
- 開始ブランチは `work`、作業ツリーはclean、未push commitなし。`git fetch origin` 成功後の `origin/main` と開始HEADはともに `31f33d8d69fb57e9516697ec4b35f2abf51fc97f`、behind/aheadは0/0。remoteは `https://github.com/ak-sekine/heibon-mahjong.git`。
- `src/ui/dialog-scroll-indicator.ts` の共通処理へマウスPointer Eventsを追加。掴んだ位置を維持して、つまみの移動可能距離と本文のscroll範囲を比例対応させ、背景クリックではクリック位置へつまみの中央を移動する。pointer captureでバー外でも追従し、終了・キャンセル・capture喪失・window blurで解除する。
- 黄色いつまみの色・幅・配置とスマートフォンUI、固定フッターの構造は維持。本文はnative scrollを維持し、既存のTab移動順を維持し、マウス操作後は名前付きregionへフォーカスを渡してキーボードスクロールを利用可能にした。装飾バーは従来どおり支援技術とTab順序から除外し、同じ機能を本文で利用できる。
- `tests/browser-create-dialog-layout.py` を拡張し、既存ActionsのChromium／WebKit双方で、新規対局・オンライン作成の上下端ドラッグ、中央への比例移動、背景クリック、バー外移動、終了後の非追従、キャンセル／capture喪失後の再操作、ホイール、キーボード、固定フッターを検査する。既存の12 viewport検査も維持する。
- タッチについては両engineでtouch pointerをキャンセルしないこととnative panning設定を検査し、ChromiumではCDPのnative touch swipeでも本文移動を検査する。Playwright WebKitには公開swipe APIがないため、WebKitのnative swipeとユーザー所有端末の実機タッチ操作は未確認として区別する。
- ローカル検証・対象コミットのActions結果は下記へ追記する。公開後のPC実機再確認はユーザー本人が行う。Issue #32はOpenを維持する。
- ローカル結果: `npm test` 1464件成功、`npm run build`（TypeScript検査を含む）成功、`python tests/test_browser_regressions_selection.py` 8件成功、Python構文検査と `git diff --check` 成功。ブラウザー自動検証はリポジトリの既知制限に従いActionsで実施する。
- 初回修正 `98b1381a4988abf5d7fcdc976c2ed712e134ad39` の[Actions #42436684947](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42436684947)はverify成功、Chromiumでは今回のスクロール検査が成功したが、既存のオンライン作成画面のTab順序検査が失敗した。本文を追加のTab停止位置にせず、プログラムによるfocusのみ許可する `tabIndex=-1` へ修正した。WebKitはCtrl+Endで本文最下部に移動せず検査がtimeoutしたため、キーボード検査をPageDown／PageUpで上下端へ到達する方法に変更した。両失敗によりDeploy gateが公開を停止した。
- `gh run view --log-failed` はログ配信先 `results-receiver.actions.githubusercontent.com` への要求がForbiddenになった。GitHub接続ツールのjob logs取得で両engineのログを読み、失敗箇所を確認した。

### スクロールバー修正の最終自動検証・公開

- 修正SHA `821dcde93a5a453626f7c32ef41e72fe4d9fcb09` の[Actions #42437041618](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42437041618)は最終的にsuccess。初回attemptのChromium 42 scenario／WebKit 32 scenarioがすべてsuccess、matrix auditとrelease freshnessもsuccess。両engineの結果JSONで、新規対局・オンライン作成の上下ドラッグ、中央への比例連動、背景クリック、captureとキャンセル解除、ホイール、PageDown／PageUp、固定フッターがすべてpassであることを確認した。
- Chromiumでは両画面のnative touch swipeもpass。WebKitではtouch pointerをキャンセルしないこととnative panning設定がpassで、native swipe自体は公開APIの制約により未確認。既存12 viewportのレイアウト検査と、既存のTab順序を含む回帰検査も両engineで成功した。
- 初回attemptはWorker公開後の本番オンライン検査で `Mixed-Origin reconnect snapshots differed (host 7, guest 6)` が発生し、Pages公開を停止した。テストの異なる時点のsnapshot比較箇所（`tests/online-production.mjs`）を確認し、ソースや条件を変えず失敗ジョブを再実行した。attempt 2のproduction-testはsuccessで、続くPages build／deployもsuccessとなった。最初の不一致の根本原因は未確定であり、成功結果で上書きしない。
- WorkerとPagesの成功DeploymentはともにSHA `821dcde93a5a453626f7c32ef41e72fe4d9fcb09`。公開先: [HEIBON MAHJONG](https://ak-sekine.github.io/heibon-mahjong/)。実装は `98b1381` と `821dcde` をmainへ直接pushし、各push後にリモートSHA一致を確認した。PRは作成していない。
- PC実機の修正版再確認は未確認。公開ページを再読み込みし、PWA更新案内があれば適用したうえで、新規対局／オンラインルーム作成の両方を開き、黄色いつまみを上下端へドラッグ、背景クリック、ホイール・キーボード操作、フッター不動をユーザー本人が確認する。以前のPC実機NG記録を残し、Issue #32はOpenのまま維持する。


## 追加修正: PC対局の縦並び化（2026-11-08）

- ユーザー本人のPC実機報告: 右側操作パネルと自分の手牌が離れており、マウス操作がしづらい。スマホ・タブレットと同じ操作順序に揃えるため、PCもヘッダー→座席・点数→正方形の卓→操作状態・ボタンの縦並びに変更する。
- 作業開始: `/workspace/heibon-mahjong`、ブランチ `work`、clean、未push commitなし。開始HEAD `31f33d8d69fb57e9516697ec4b35f2abf51fc97f`。fetch成功後の `origin/main` は `d52d55372c134e21ed3e5de510e0f0bac56d3689`、behind/ahead 3/0。fast-forwardで同期。Issue #32本文・既存コメント・検証記録を取得しOpenを確認した。
- 修正前の最新ソースはmain最大1440px、2列Grid、卓最大860px／`100dvh - 80px`、名前・点数／中央14px、局16pxだった。オフライン・オンラインは共通の点数・操作コンポーネントを使い、局結果を右列中央に表示していた。
- 修正後は両対局を同じ1列flexとし、卓・点数・操作欄・局結果を同じ幅で中央に置く。main上限1440pxと卓上限860pxを維持。卓幅は `min(利用可能幅,860px,max(450px,100dvh - 44px - 76px - 24px - 上下safe area余白 - 操作領域))`。操作領域は通常108px（キーボード案内含む）、鳴き中244px。safe area上下は各8px以上、`svh`をfallbackにする。450pxの下限で14〜16pxの文字と牌の可読性を優先し、短いウィンドウ・長い状態文・局結果は自然に縦スクロールする。スクロール位置の強制変更は追加しない。
- 自分の手牌を含む卓と操作欄のgapは8px。鳴き中は候補を表示する前から244pxを卓下に予約し、absoluteパネルの下端を維持して候補を上方向へ展開する。最大高さを予約枠に制限し、必要時はパネル内スクロールで到達可能にする。既存の種類別選択、複数候補、戻る・見送る、カン、ロン・ツモ・リーチ、結果・順位・次局のイベント経路は変更しない。
- 文字サイズは名前・点数／中央14px、局16px、主要操作14px以上を維持。卓内の河・副露・ドラ・座席配置と牌サイズの計算係数は維持。幅960px未満のスマホ・タブレット、PWA、通信・ルール・CPUは変更しない。幅960px以上のタブレット横画面はPCと同じ縦並びになる。
- 自動検証: PC4 viewportでスクロール前の矩形、卓下配置・中央揃え・同幅・正方形、初期表示とクリック可能領域、14〜16px文字と牌の非重複、マウス打牌、Tab/Enter/Space、リサイズを検査。オンラインは実際のOnlineGameControllerにサーバー用公開viewを渡して同じ矩形を検査する。通信は既存オンラインBrowser UIと本番公開検証で別途検査する。既存のスマホ320〜430px・タブレット・鳴き・カン・結果・次局・再接続のmatrixを維持する。
- ユーザー本人からPCスクロールバーの**ドラッグ操作は修正済み（実機OK）**と報告された。未報告の背景クリック・ホイールを個別の実機OKとはしない。過去のiPhone Safari／PWAのOK記録を維持する。
- PC縦並び版の実機再確認は未実施: 通常手番の卓全体・手牌・打牌ボタン、手牌との距離、文字／牌の可読性、リサイズ、小さいウィンドウでのスクロール、マウス／Tab・Enter・Space、チー複数候補・ポン・カン・戻る・見送る、ロン・ツモ・リーチ、結果／順位／次局、オンラインと再接続。Issue #32はOpenのまま維持し、本人確認後にClose可否を判断する。
- ローカル・Actions・実装SHA・公開SHAの確定結果は後続追記に記録する。未実施を成功として扱わない。

- ローカル結果: `npm test` 1464件成功、`npm run build`（TypeScript含む）、`npm run typecheck:worker`、Browser UI選択検査8件、変更Pythonの構文検査、`git diff --check` が成功。既知のブラウザー起動制限はAGENTS.mdに従い、Chromium／WebKitは既存Actions matrixで実施する。

- CSS確認で通常操作欄のキーボード案内の高さも予算に含め、通常操作の予約を108pxとした。長い「南4局 2本場」等は中央情報を同じ14〜16pxのまま必要時に折り返し、PC4 viewportの副露・河局面でも検査する。

- 初回実装 `271d10061331ca85bcf70d29489fb4a17a9e26e6` の[Actions #42441804298](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42441804298)は両engineで1280×720の縦overflowを検出しfailure。スクロール前の卓476px、点数欄75.1875px、操作欄103px、ページ高738pxで、打牌ボタンは702.1875pxまでだった。主ボタンは到達可能だが操作欄全体と安全余白が収まらなかったため公開はゲートで停止。CSS調査で既に追加していた108pxの操作予約と450pxの卓下限を、後続 `1aa498bea53a6147a55b233765b5cd269b5d2e57` の[Actions #42442235683](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42442235683)で再検査する。失敗を成功として上書きしない。

- 追加修正版のWebKitは32シナリオすべてsuccess。結果JSON・timings CSV・1280×720スクリーンショットをActions artifactから取得して確認した。通常時の卓幅は1280×720:452px／1366×768:500px／1440×900:632px／1920×1080:812px、卓上端143.1875px、操作欄高さ108px・卓とのgap8px。操作欄の下端は順に711.1875／759.1875／891.1875／1071.1875pxで、安全余白を含めviewport内に収まる。オンラインも同じ卓矩形。各サイズで南4局2本場・18枚の河・1面子／4面子と大明槓の文字対牌の重なりは0件。マウス・Tab/Enter/Space・リサイズ・小ウィンドウの到達性もsuccess。スマホ・タブレット、鳴き選択・結果・次局・オンライン再接続を含む既存WebKit matrixもsuccess。


### 縦並び版の最終自動検証・公開

- 実装コミットは `271d10061331ca85bcf70d29489fb4a17a9e26e6` と追加修正 `1aa498bea53a6147a55b233765b5cd269b5d2e57`。両方ともPRを作らずmainへ直接pushし、リモートSHA一致を確認した。
- [Actions #42442235683](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42442235683) は最終success。Chromium **42シナリオ**／WebKit **32シナリオ**がすべてsuccess。両engineのPC4 viewportの結果JSON・job logsを照合し、上記と同じ卓／操作欄矩形、中央揃え、同幅、初期スクロール0・横縦overflowなし、主要操作44px以上／14px、名前・点数・中央14px／局16px、長い局表示・河・ドラ・副露との重なり0件、マウス打牌、Tab/Enter/Space、リサイズ、短いウィンドウでの打牌操作の到達性を確認した。
- 既存のスマホ320〜430px・縦横回転・768×1024／1024×768タブレット、鳴きの種類選択と複数候補／戻る／見送る、カン、リーチ・ツモ・ロン、結果・順位・次局、オンラインと再接続の回帰検査が通過した。PCの候補表示は従来の1280×900を含む鳴きテストで確認し、4つの指定PC viewportすべてで各鳴き局面を個別に実機確認したという意味ではない。Android・タブレットの実機確認も未実施。
- Deploy gateのmatrix audit、release freshness、Worker deploy、本番オンライン検証、Pages build／deployがすべてsuccess。既存の本番オンライン検査は条件や通信仕様を変更せず、今回runでは再実行なしで成功した。
- 成功Deployment: Worker `7630886344`、Pages `7630901415`、GitHub Pages `7630898571`。いずれもSHA **`1aa498bea53a6147a55b233765b5cd269b5d2e57`**で、APIの最新statusがsuccessであることを確認。公開先: [HEIBON MAHJONG](https://ak-sekine.github.io/heibon-mahjong/)。公開URLへのCodex Cloudからの直接HTTP取得はproxyのCONNECT 403で拒否され、実ページの直接取得・再描画は未確認。公開確認の根拠はActions deployとGitHub Deploymentの成功記録であり、実機確認とは区別する。
- 最終ローカル検査は `npm test` 1464/1464成功、`npm run build`、Worker型検査、Browser UI選択8件、変更Pythonの構文検査、PCテスト内JavaScript式19箇所の構文検査、`git diff --check` が成功。PC／Safari実機確認を自動検証で代替しない。
- Issue #32のOpenを公開後にも確認した。本人による縦並び版PCの再確認まではOpenを維持する。以前のiPhone Safari／PWAのOK、今回本人報告のPCスクロールバー「ドラッグ操作OK」を維持し、背景クリックやホイールの個別実機OKは推定しない。

### 公開後の補助診断と記録反映

- 検証記録コミット `ed9d726d4c2738e751edb97dd97cb2833c2d5a47` をmainへ直接pushし、リモートSHA一致・cleanを確認。[文書チェック #42443546829](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42443546829)はsuccess。文書のみのためブラウザー再検証・再公開はskippedで、公開SHAは引き続き `1aa498bea53a6147a55b233765b5cd269b5d2e57`。
- 続く補助診断[ #42443578657](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42443578657)のattempt 1で既存の `Mixed-Origin reconnect snapshots differed (host 7, guest 6)` が再発した。ログでは再接続クライアントが経過11711msにrevision 6を取得し、hostは11751ms、再接続側は11753msにrevision 7を取得している。`tests/online-production.mjs` のsnapshot比較箇所も確認し、異なる時点のsnapshotを取得・比較する既存の競合が再現したものとして記録する。今回の公開ゲート内の本番検証successとは別の補助runのfailureであり、成功で上書きしない。
- ソース・通信仕様・テスト条件を変えず、この補助診断だけを1回再実行したattempt 2はsuccess。比較テストの不安定さは残る別途検討事項であり、今回のレイアウト修正では解消したと扱わない。Issue #32はOpenを維持する。
