# itch.io HTML5 Draft 準備 — Issue #46

更新日: 2026-11-05

対象: `ak-sekine/heibon-mahjong` Issue [#46](https://github.com/ak-sekine/heibon-mahjong/issues/46)

実装基準: `origin/main` `73efa9daa1e5848e53d741c44dc8ab71cee7300f`
対象コードSHA: `0dda2f7c7263e2f7246590a1c22ea1e556857c4c`（機能実装 `979dd466a06d2021b84a93391ead38121b022284`、Browser UI smoke selector修正 `0dda2f7c7263e2f7246590a1c22ea1e556857c4c`）
Issue状態: Open（PC／iPhone SafariのDraft確認とOrigin実測が終わるまで維持）

## 配布仕様と分離方針

itch.ioの[公式HTML5ゲーム案内](https://itch.io/docs/creators/html5)は、複数ファイルのゲームをZIPでアップロードし、`index.html`をZIP直下に置くこと、内部参照に相対パスを使うこと、ファイル名の大文字小文字を一致させることを求めています。標準制限は展開後1000ファイル以下、パスを含むファイル名240文字以下、全ファイル合計500MB以下、単一ファイル200MB以下です。実際の生成コマンドはこれらを検査します。

| 項目 | Pages / PWA | itch.io HTML5 |
| --- | --- | --- |
| Vite mode / base | `production` / `/heibon-mahjong/` | `itch` / `./` |
| エントリ | `index.html`、`test.html`、`kan-test.html` | `index.html`のみ |
| 出力先 | `dist/` | `dist-itch/`、ZIPは`artifacts/itch/heibon-mahjong.zip` |
| PWA | manifest、アイコン、Service Worker、更新処理 | manifest参照と登録処理を除外 |
| オンライン | CIがデプロイ済みWorker URLを注入 | ビルド時に同じWorker URLをHTTPSで明示必須 |

通常の`npm run build`とPages向けHTMLは変更していません。itchビルド時はPWAアイコン等のPages専用ファイル、`test.html`、`kan-test.html`をZIPに含めません。生成物は`.gitignore`対象です。itch用のService Workerは生成しません。itch版のPWAインストールとオフライン動作は提供・確認済みとして扱いません。CPU対局のオフライン動作はネットワークを切ったDraft実機で確認してください。

## ビルド・ZIP生成

GitHub Actionsの直近のWorkerデプロイ記録にあるURLを使います。再ビルド前に最新の成功したWorker URLを確認し、異なるURLへ推測で置き換えないでください。

```sh
VITE_ONLINE_API_URL=https://heibon-mahjong-online.ak-sekine.workers.dev npm run build:itch
```

コマンドはTypeScript型検査、Vite itch mode build、ZIP作成を続けて実行します。Worker URL未指定・HTTP・バンドルにURLが入らない場合は失敗します。ZIP作成後に`index.html`直下、相対参照、実在ファイルとの大文字小文字一致、ファイル件数、各パス長、展開容量、単一ファイル容量を検査します。パッケージは固定タイムスタンプ・整列済みファイル順で作ります。

ZIP単体の展開検査と内容一覧は次でも確認できます。

```sh
python -m zipfile -t artifacts/itch/heibon-mahjong.zip
python -m zipfile -l artifacts/itch/heibon-mahjong.zip
```

Pages/PWA成果物は従来どおりです。

```sh
npm run build
```

このコマンドは`dist/`を作り、`scripts/build-pwa.mjs`がmanifest用アイコンと`sw.js`を生成します。itch用buildは別の`dist-itch/`へ出力し、Pagesの`dist/`を上書きしません。

## itch.io Draftの作成・確認手順

1. itch.io Dashboardから新規Projectを作り、Kind of projectを **HTML Game** にします。
2. Visibilityを **Draft** にして保存します。公開や有料販売には切り替えません。
3. 上記コマンドで生成した`artifacts/itch/heibon-mahjong.zip`をUploadsへ追加し、ZIPを **This file will be played in the browser** にします。
4. DesktopのEmbed optionは **Click to launch in fullscreen** を推奨します。公式上、クリック後に利用可能な画面全体へ展開し、固定幅・高さを指定しません。本ゲームの卓UIはviewportサイズを基準にレスポンシブに配置するため、固定寸法を設定する **Embed in page** より、利用可能な高さを確保しやすい設定です。Embed in pageはページ説明とゲームを同時に見せられますが、表示枠の幅・高さを指定して小画面で枠内が窮屈にならないか調整する必要があります。
5. **Click to Play**を有効にします。重いゲームではありませんが、利用者の明示操作で起動する設定にします。Fullscreen buttonはClick-to-launch modeでは不要です。
6. **Mobile Friendly**はiPhone Safari確認の後で有効にします。公式によると、モバイルのitch.ioページではDesktop Embed設定に関係なくClick to launch in fullscreenで起動します。Mobile Friendlyが無効なら、動作保証がない旨の注意が表示されます。
7. DraftのプレビューをPC Chromium系ブラウザで開き、ゲーム起動、CPU対局、サイズ、画面描画を確認します。
8. iPhone SafariからDraftのプレビューを開き、起動、縦画面表示、タッチ操作、CPU対局を確認します。外部端末からDraftを開けるかはVisibility、ログイン状態、itch.io側のDraftアクセス設定に依存します。アクセスできない場合は、公開範囲を変更せず作成者としてログインした状態で確認できる方法を使い、外部から確認できたと記録しないでください。
9. PCブラウザの開発者ツールでNetworkを開き、REST API requestまたはOPTIONSのRequest Headersに実際に付く`Origin`を記録します。WebSocket接続のHandshake Request HeadersにあるOriginも別に記録し、同一値か確認します。iframe親ページのOriginや推測したitch.ioホスト名を代用しません。iPhoneではMac SafariのWeb Inspectorを接続し、同様にネットワーク要求を確認します。
10. 実測したOriginをユーザーが確認してから、Workerの許可設定を正確なOrigin値1件だけ追加し、単体Originテストと既存CIのWorker deploy／production testを行います。その後、Pages版とitch版で両方向のルーム作成・参加・再接続を実機確認します。混在Originの本番通信テストは`ONLINE_TEST_ORIGIN=https://ak-sekine.github.io ONLINE_SECONDARY_TEST_ORIGIN=<実測値> ONLINE_API_URL=<最新Worker URL> npm run test:online:production`で実行できます。このシナリオは両方向でHTTP作成・参加、WebSocket、準備・席確定、開始、打牌同期を検査します。
11. 実機結果とOrigin制約を確認して一般公開可否を判断します。一般公開への切り替えは本Issueの作業では行いません。

**Draftで確認可能:** 作成者アカウントからのアップロード後プレビュー、埋め込み表示、ZIPリソース、PCと手元のiPhone上のUI・CPU対局、Networkの実際のOrigin（ブラウザ開発者ツールにアクセスできる場合）。Draftが外部共有可能か、iPhoneから確認可能か、Draft上でログイン制限を越えて他の人とオンライン通信できるかはアカウント設定に依存し、現時点では未確認です。

**追加設定が必要:** itch OriginのWorker許可追加、itch↔Pagesの相互通信、一般利用者のアクセス、一般公開。Draft Originを測定する前に本番Workerの許可設定を変更しません。

## Origin・オンライン・セキュリティ

現行Workerの許可Originは`https://ak-sekine.github.io`、`http://localhost:5173`、`http://127.0.0.1:5173`です。Origin無し・未許可は403です。OPTIONSも先にOrigin検査し、許可ヘッダーは`Authorization`と`Content-Type`に限定されます。REST API、ticket、WebSocketはいずれも同じWorker入口でOrigin検査され、WebSocketは同じDurable Objectへの接続を使います。既存のトークン認証、ticket、レート制限、Durable Object認可・状態同期は変更していません。

許可は完全一致値だけにします。`Access-Control-Allow-Origin: *`、ワイルドカード許可、欠落Originの許可は行いません。itch.ioが共有CDN Originを使う場合、同じOriginから配信される別ゲームをOriginのみで区別できないセキュリティ制約があります。そのOriginが実測された場合も、Origin許可だけをアプリ認証とみなさず、既存トークン・ticket・認可・レート制限を維持した上で、この共有Originリスクを明示して判断します。

本コードのオンライン契約はWebSocket subprotocol `heibon-mahjong.v1`と共有JSON payloadです。別リリース間の完全な互換性は未実証です。更新時はWorkerを先に後方互換にデプロイし、Pagesを同じSHAでデプロイ後、そのSHAのitch ZIPをDraftで確認します。破壊的なpayload変更をする場合は、同時更新が完了するまで旧クライアント互換経路を残します。itch.ioのZIP差替えは手動です。itch版にはPWAの自動更新通知がありません。

## 公開ページ素材案

- **タイトル:** HEIBON MAHJONG
- **短い紹介文:** CPU3人と打つ、オフライン対応の四人打ちリーチ麻雀。ルームコードでオンライン対局も。
- **ゲーム内容:** 日本語の四人打ちリーチ麻雀。CPU3人とのオフライン対局と、ルームコードを使ったオンライン対局に対応。牌を選び、打牌・リーチ・和了・鳴き操作を画面ボタンで進めます。
- **基本操作:** PCは牌・ボタンをクリック、Tabでフォーカスを移動しEnter／Spaceで選択・確定。タッチ端末は牌と画面ボタンをタップします。対局操作はメニューと画面内の対局ボタンから行います。
- **通信:** CPU対局は端末内で進行します。オンライン対局ではルーム作成・参加、状態同期にインターネット接続が必要です。
- **対応環境案:** PCの最新Chromium系ブラウザ、iPhone SafariをDraft検証対象とします。対応端末・ブラウザの公開保証はDraft実機確認後に決めます。現時点でAndroid、Firefox、iPad、全画面・全回転の実機確認は未実施です。
- **料金案:** 無料公開（価格・寄付は設定しない）。itch.ioのHTML5ページでは公式案内上、通常販売ではなく寄付が扱われるため、設定画面で無料・寄付なしを選べることを保存前に確認します。
- **PWA案内:** ホーム画面追加、standalone起動、更新通知、オフラインCPU対局を使う場合は[GitHub Pages版](https://ak-sekine.github.io/heibon-mahjong/)を案内します。
- **カバー・スクリーンショット:** 既存のローカル生成タイルアイコン（`public/icons/icon-512.png`）を候補素材として再利用できます。ゲーム画面は現行Pages/Draftから撮影し、PC卓、縦画面のCPU対局、オンライン待機画面を候補にします。過去の開発検証画像は現行表示と一致することを確認してから選びます。配信用に最終確認したcover／screenshotファイルはまだ作成していません。新規画像を作る場合は、麻雀卓と自作牌のみを使うオリジナル素材、横長cover 16:9、画面内文字なし・余白ありの仕様とし、既存画像・権利情報確認前に作成・公開しません。
- **素材・権利:** `public/icons/`は`build-pwa.mjs`が生成するオリジナルPNGアイコンです。牌面は`src/rendering/tile-svg.ts`のローカルベクター描画です。生成ZIPにはHTML・CSS・アプリJavaScriptの3ファイルのみで、外部画像・フォント・音声・実行時依存ライブラリは含まれません。ソースの`package.json`にあるnpm依存は開発用です。`public/`に写真・第三者画像ファイルは見つかりませんでした。コード依存ライセンス、ゲーム名称、ルール説明の第三者権利を網羅的に法的確認したものではありません。権利未確認の素材を公開可能とは判定しません。

## Origin実測記録

| 通信 | 実測Origin | Worker許可 |
| --- | --- | --- |
| itch.io REST / OPTIONS | 未確認（Draft未作成） | 追加していない |
| itch.io WebSocket handshake | 未確認（Draft未作成） | 追加していない |
| Pages版 | `https://ak-sekine.github.io` | 既存許可を維持 |

テストの`https://example.invalid`は拒否動作を確かめる専用の合成値で、itch.io Originではありません。

## 自動検証結果

下表はローカルとGitHub Actionsの自動検証を記入します。Pages版のPWA自動テストとitch ZIPテスト、Worker Originテストを区別します。実機確認は別表のまま未確認です。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。84/84テスト、失敗0（ローカルと対象SHAのActions） |
| `npm run typecheck:worker` | 成功（ローカルとActions） |
| Pages `npm run build` とPWA成果物 | 成功。`index.html`、`test.html`、`kan-test.html`、manifest、4アイコン、`sw.js`を生成。Pages deployも成功 |
| `VITE_ONLINE_API_URL=… npm run build:itch` | 成功。実URL `https://heibon-mahjong-online.ak-sekine.workers.dev`をローカルとPages build jobの両方でバンドルに確認 |
| ZIP root `index.html`、相対参照、大文字小文字、除外物、サイズ制限 | 成功。ローカル生成ZIPは3ファイル、展開後332,565 bytes、87,077 bytes、最大単一ファイル258,598 bytes、最大パス24文字。CRC展開検査成功。対象SHAのActions生成ZIPは87,076 bytesで、Actions artifactは外側の保存用ZIPを含め87,210 bytes |
| Pages buildとの分離 | itch build前後のPages `dist/index.html`、`dist/sw.js`、`dist/manifest.webmanifest` SHA-256が一致 |
| Pages Origin / 未許可 / Origin欠落 / OPTIONS / WebSocket / token | 自動テスト追加済み。全ケース成功。実測していないitch Originは未許可のまま |
| GitHub Actions Browser UI（Chromium / WebKit）とitch CPU／打牌smoke test | run [#42042381292](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42042381292) attempt 3、SHA `0dda2f7c7263e2f7246590a1c22ea1e556857c4c`で成功。matrix auditも成功 |
| Worker deploy、production-test、Pages build/deploy | 同じrun attempt 3で全job success |
| Production Worker diagnostics | run [#42048287656](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42048287656) success。2人対局、切断・再接続、ホスト交代・CPU引継ぎ等の5シナリオ |
| Pages PWA回帰 | Browser UIのChromium／WebKit自動検証は成功。iPhone SafariでのPWA起動・更新・オフラインCPU対局は未確認 |

**Actionsの再試行記録:** SHA `0dda2f7`のattempt 1では既存`browser-round-end-ui.py`がWebKit 320×480のダイアログ再クリックで失敗しました（同じシナリオは直近の成功runで通過）。失敗jobだけのattempt 2はattempt別dist artifactを取得できず、テストは実行されませんでした。全jobを再実行したattempt 3では同じWebKitシナリオを含む全行列が成功しました。最初のクリック失敗の原因は未特定で、成功した再試行を実機確認とは扱いません。

**Draftアップロード用:** Actions artifact [itch-html5-0dda2f7c7263e2f7246590a1c22ea1e556857c4c-3](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42042381292/artifacts/13426290667)には、runのWorker deploy後に同じ本番Worker URLで生成したゲームZIPが含まれます。artifactをダウンロードして外側を展開し、中の`heibon-mahjong.zip`をitch.ioへアップロードしてください。workspaceには同じソースSHA・本番Worker URLで作った直接アップロード可能な`artifacts/itch/heibon-mahjong.zip`もあります。

## Draft実機チェックリスト（初版記録時点ですべて未確認）

この表は2026-11-05の初版作成時点です。後日ユーザーから提示されたiPhone報告は本書末尾の追加記録に分けて記載します。確認日・端末・OS／ブラウザバージョンとともにOK／NG／未確認を記録し、自動テストの成功で置き換えません。

| # | 確認項目 | 結果 |
| --- | --- | --- |
| 1 | PCブラウザでitch.io Draftを起動できる | 未確認 |
| 2 | iPhone Safariでitch.io Draftを起動できる | 未確認 |
| 3 | 両環境でCPU対局を開始・操作できる | 未確認 |
| 4 | Pages版が作成したルームへitch版が参加できる | 未確認（実Origin未測定） |
| 5 | itch版が作成したルームへPages版が参加できる | 未確認（実Origin未測定） |
| 6 | 準備完了・座席確定・対局開始が同期する | 未確認 |
| 7 | 打牌・鳴き・和了結果が同期する | 未確認 |
| 8 | 再接続後も対局状態が一致する | 未確認 |
| 9 | Pages版PWA起動・更新・オフラインCPU対局に退行がない | 未確認（自動PWAテストとは別） |
| 10 | 画面崩れ、タッチ不能、リソース読込失敗がない | 未確認 |

### Issue #46受入状況

| 受入条件 | 状態 |
| --- | --- |
| 再現可能なZIP、root index、相対パス | 達成（ローカル自動検証成功） |
| PC・iPhone Draft CPU対局 | PCは未確認。iPhoneはユーザー報告で起動OK、CPU対局「問題なさそう」（完全な動作確認とは扱わない） |
| Pages↔itch相互ルーム・対局同期・再接続 | 未確認・Origin実測と実機待ち |
| 未許可Origin拒否、Pages PWA回帰 | ローカルOrigin/PWA自動検証は成功。Pages PWA実機回帰は未確認 |
| 未確認動作を明示 | 本記録と上記リストで記録 |
| 公開素材・Draft手順・一般公開判断材料 | 本記録を整備。権利最終確認とDraft実機確認は未完了 |

ローカルのブラウザーUI検証はこのCloud環境の既知のChromium sandbox起動制約のため実行していません。GitHub ActionsでChromium／WebKitからitch配布ビルドを開き、PWA登録がなく、CPU対局を開始して打牌できるsmoke testを実行し、対象SHAのattempt 3で成功しました。

したがって、実装完了／自動検証完了／Draft実機確認完了／一般公開準備完了は別々に判定します。この記録を作っただけでIssueを完了・Closeしません。

---

## 2026-11-05 Origin診断追加記録

既存の「診断ログ」ダイアログを拡張し、現在のブラウザーJavaScriptから取得した `location.origin` と `location.hostname`、iframe内か、Pages／itch／developmentの配布モード、`VITE_ONLINE_API_URL` のOrigin、ビルドSHA／buildIdを表示・コピーできるようにした。`location.origin` が文字列 `null` の場合はOpaque Originの可能性を併記する。ページURLのpath・query・fragmentは表示せず、API URLもOriginのみを使う。コピーにはHTTP Request OriginとWebSocket Request Originを別項目で「未確認」と含める。ブラウザーJavaScriptから送信後のOriginヘッダーを読み取れるとは扱わない。既存ログのコピーは維持し、機密情報らしい名前の項目をコピーから除外する。

### Workerで拒否されたOriginを確認する

既存Cloudflare Workers Logsの記録では `invocation_logs: false` であり、Workerの構造化ログにはOrigin拒否イベントがなかった。したがって、過去ログだけから拒否されたOriginを確認することはできない。

今回 `worker/index.ts` は、未許可またはOrigin欠落で403を返す既存経路で、Originと通信種別だけの `origin_rejected` 構造化ログを記録する。WebSocket Upgrade要求は `communicationType: websocket`、その他は `http`。Originはcanonical HTTP(S) Originまたは `null`／`(missing)` のみ記録し、不正な値は省く。URL path・query・fragment、room code、Cookie、認証・参加者token、IP、リクエスト本文は記録しない。同じWorker isolateでは通信種別ごとに15秒間隔で抑制する。これはベストエフォートの過剰ログ抑制で、全isolate横断のrate limitではない。Cloudflareの自動Invocation Logs、公開API、CORS応答は変更しない。

Cloudflare Dashboardの Workers & Pages → `heibon-mahjong-online` → Observability で、対象時間帯の `origin_rejected` を確認する。`communicationType` と `origin` がHTTPとWebSocketで別々に記録される。実際の拒否イベントが記録されるまで、ヘッダー値は未確認のまま扱う。現行画面のルーム作成がHTTP 403で止まった場合、WebSocket handshake自体が発生しないことがあり、その場合WebSocket Originも未確認のままである。画面に表示する `location.origin` はWorker受信ヘッダーの実測値の代わりにならない。

許可Originのリスト、403、認証／認可、レート制限、Durable Objectの通信経路は変更していない。許可リスト変更は実Originを別途確認し、ユーザーが了承した後の別作業とする。

### 自動検証と配布ZIP

今回のローカル検証結果:

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。85テスト、失敗0。Origin表示／Opaque Origin、API URLからOriginのみ抽出、拒否イベントのHTTP／WebSocket区別、安全なOriginログ項目を追加検証 |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功。Pages PWA buildとService Worker生成を確認 |
| `VITE_ONLINE_API_URL=https://heibon-mahjong-online.ak-sekine.workers.dev npm run build:itch` | 成功。3ファイル、展開後335,658 bytes。Actions artifact内のZIPも同じ3ファイル |
| itch ZIP構造 | 成功。ZIP直下 `index.html`、相対参照。`test.html`、`kan-test.html`、manifest、Service Worker、PWAアイコンなし。bundle内に指定Worker URLとOrigin診断表示を確認。commit `b78ff5d` のローカルZIP SHA-256 `8ae65e357077bd4140884d9dc7fc10a832c0ee0d2335929f9b116e2887da9628` |
| Chromium／WebKit Browser UI、診断の表示・コピー、Pages PWAブラウザー回帰 | 初回run [#42060259136](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42060259136) は診断iframe fixtureが画面外にあり、両engineでテスト操作が失敗。テストfixtureを画面内に直し、Pages build previewのOrigin表示も検証する追試を実施。run [#42062625984](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984) のChromium、WebKit、matrix audit、standalone itch package smoke testはすべて成功。 |
| `git diff --check` | 成功 |

Browser UIのlocalhost上のPages／itch相当Originは合成テスト値であり、itch.io Draftの実Origin計測ではない。

初回runでは `verify`（npm test、Worker型検査、Pages／itch browser build）はsuccessでしたが、Browser UIはテストfixtureの配置ミスで失敗し、本番DeployゲートによりWorker deploy、production-test、Pages build/deployはskipされました。この失敗runから公開環境は変更されていません。修正後のrun [#42062625984](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984) はverify、Chromium／WebKitとmatrix audit、release-freshness、Worker deploy、production-test、Pages build/deployがすべてsuccessです。Pages previewではPages modeとブラウザーの実行Originを表示する回帰を通過しました。localhostのPages／別Origin fixtureは自動テスト用で、itch.io Draft実Originの実測ではありません。

GitHub Actions Deployのitch artifactは成功したWorker deployの `worker_url` から `npm run build:itch` を実行する既存経路で生成される。run [#42062625984](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984) のWorker deployとproduction-testはsuccessし、成果物をダウンロードして確認した内側ZIPのJavaScriptには `https://heibon-mahjong-online.ak-sekine.workers.dev` が含まれていました。この値は既存Production deploy run [#42042381292](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42042381292) の本番Worker URLと一致します。許可Originリストは変更していません。既存のDeployゲートとChromium／WebKit Browser UIゲートも変更していません。

**今回のDraftアップロード用artifact:** [itch-html5-3bea5b440a2d591e826e2603bd507e4d11bf3e6c-1](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984/artifacts/13433286148)。外側artifact ZIPの中に `heibon-mahjong.zip` が1つあり、内側は3ファイル、展開後335,658 bytes、root `index.html`、PWA・開発用ファイルなし、CRC検査成功です。Actions artifact自体のサイズは88,250 bytes。GitHub上のartifactは2027-02-03まで有効です。

### iPhone Safariでの更新・確認手順

1. [Actions run #42062625984](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984)をiPhone Safariで開き、Artifactsから `itch-html5-3bea5b440a2d591e826e2603bd507e4d11bf3e6c-1` をダウンロードする。
2. iPhoneの「ファイル」アプリで外側のActions artifact ZIPを展開する。
3. 展開先の内側にある `heibon-mahjong.zip` をitch.io DraftのHTML5 upload欄へアップロードする。内側ZIPをさらに展開してからアップロードしない。
4. Draftのゲームを起動し、メニュー → 「診断ログ」を開く。
5. 大きく表示された「実行Origin」を確認し、必要なら「コピー」を押す。
6. HTTPのWorker拒否記録も必要な場合は「新しくルームを作る」を試す。Origin未許可なら403は現段階で想定内。
7. コピーした診断情報、表示されたエラーと、確認した対局内容を報告する。Workers Logsの確認が必要なら、Cloudflare Observabilityにある `origin_rejected` の通信種別とOriginを別に記録する。

PC／Macの開発者ツール接続はこの手順の前提にしない。WorkerのHTTP／WebSocket Originはアプリ画面のExecution Originと分けて報告し、Workerログに対応イベントがない通信種別は「未確認」とする。

### ユーザーから提示された実機報告

次の内容は、この依頼でユーザーから提示された報告として記録する。自動検証や本書の作成者による実機確認ではない。

| 項目 | 2026-11-06時点として提示された報告 |
| --- | --- |
| iPhone Safariでitch.io Draftのゲーム起動 | OK |
| 麻雀卓と手牌の表示 | スクリーンショットで確認 |
| CPU対局 | ユーザー報告「問題なさそう」。全操作・全局面の完全確認とは扱わない |
| ネットワーク切断状態でのCPU対局 | 未確認 |
| PC実機 | 未確認 |
| HTTP／WebSocketのWorker受信Origin | 未確認 |
| Pages↔itch.io相互対戦 | 未確認 |

したがって、今回の自動テスト成功をもって上記の未確認実機項目をOKへ変更しない。Issue #46はOpenのまま維持する。

## 2026-11-05 実測 Origin 許可と相互接続検証

### ユーザー報告と、許可前の失敗

ユーザーのiPhone Safariからの診断報告では、実行Originは `https://html-classic.itch.zone`、Execution Hostは `html-classic.itch.zone`、iframe内、Build Modeは `itch`、API Originは `https://heibon-mahjong-online.ak-sekine.workers.dev`、Build SHAは `3bea5b440a2d591e826e2603bd507e4d11bf3e6c` です。診断画面のExecution OriginだけではHTTP/WebSocketヘッダーの証明にしません。

Cloudflare Observabilityで次のWorker受信ログをユーザーが確認しました。

| 時刻 (UTC) | 通信 | Origin | Method / path | 結果 |
| --- | --- | --- | --- | --- |
| 2026-11-05 17:00:44.416 | HTTP | `https://html-classic.itch.zone` | `OPTIONS /api/rooms` | `origin_rejected` |
| 2026-11-05 17:02:05.151 | HTTP | `https://html-classic.itch.zone` | `OPTIONS /api/rooms` | `origin_rejected` |

許可前はブラウザーに「オンラインサーバーに接続できません」と表示され、ルーム作成は失敗しました。これは許可前の結果です。WebSocket Handshake Origin、ルーム作成成功、Pages↔itch.io相互対局、同期、再接続はこの報告時点で未確認です。

### 実装とセキュリティ評価

`worker/index.ts`の許可リストへ `https://html-classic.itch.zone` を完全一致で追加しました。既存の `https://ak-sekine.github.io`、`http://localhost:5173`、`http://127.0.0.1:5173` は維持します。ワイルドカード、Origin欠落、`null`、HTTP版、似た文字列は許可しません。CORSは要求された `Authorization` と `Content-Type` だけを認め、正確なOriginを返し、`Vary: Origin`を維持します。

itch.ioの共有Originを許可すると、同じOrigin上で動く他のブラウザーコンテンツにもCORS経由でWorkerの公開HTTP機能（health、ルーム作成、コードを知るルームへの参加・公開待機状態取得）を呼べるようになります。Origin値はゲームや利用者を識別しないため認証にはなりません。これらの作成・参加機能は元々利用者向け公開機能であり、Workerは作成／参加／ticket／socketのレート制限を続けます。参加者tokenは作成・参加した当該クライアントへだけ返し、ticket発行には正しいBearer participant tokenを要求します。WebSocketは短命・一回使用のticketと `heibon-mahjong.v1` subprotocolを検証し、Durable Objectは参加者席・ルーム状態・ホスト権限・各操作権限を検査します。ルームコードを知らない第三者は既存ルームへの参加を指定できませんが、コード自体は秘密の認証要素ではなく、待機中の空席参加は意図した公開動作です。既存のレート制限、ゲーム状態の認可、チケット消費、拒否Origin 403は変更・緩和しません。

Origin拒否の診断ログは既存のHTTP/WebSocket区別と15秒抑制を維持します。追加した `origin_accepted` はDurable Objectから101 Upgrade応答が返った場合だけ記録し、通信種別、Origin、`result: accepted`のみを含み、許可Originごとに15秒間抑制します。ticket、participant token、ルームコード、Cookie、IP、本文、URL pathは記録しません。実際のitch.io handshake値はこの本番ログが観測されるまで未確認です。自動テストで指定したOrigin値を実測扱いしません。

### 追加した自動検証

`tests/worker-origin.test.ts`でPagesとitch.ioの完全一致CORS応答、itch.io OPTIONS 204、正常なルーム作成、`Vary: Origin`、未許可・Origin欠落・`null`・HTTP版・類似Originの403、未対応CORSヘッダー403、ticketなし401、成功Handshake診断レコードを確認します。production通信テストは二方向のクロスOriginでルーム作成・参加、ticketとsubprotocolによるWebSocket接続、準備、座席確定、ゲーム開始、打牌同期、切断・再接続後の状態一致を実施し、未許可OriginのREST参加403とWebSocket handshake 403、発行されていないticketの401も確認します。Deploy workflowに両Originを明示し、release gateを変更せず、production testの後にPages build/deployします。

### 自動検証・本番反映の結果

| 検証 | 最終結果 |
| --- | --- |
| `npm test` | 成功、85/85 tests、失敗0 |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功。Pages PWA buildを維持 |
| `node --check tests/online-production.mjs`、`git diff --check` | 成功 |
| Worker Origin / CORSテスト | Pages・itch正確Origin、itch OPTIONS 204、正常なルーム作成、正確なCORS Origin、`Vary: Origin`、非対応CORSヘッダー403、欠落・`null`・HTTP・類似Origin拒否を確認 |
| GitHub Actions verify | success |
| Browser UI Chromium / WebKit | success。itch package smoke test、Pages UI/PWA回帰を含むBrowser UI workflowが通過 |
| Browser UI matrix audit / release freshness | success |
| Worker deploy | success、`https://heibon-mahjong-online.ak-sekine.workers.dev` |
| Production online test | success。7 scenarios（通常対局、再接続、席引継ぎ、4人/3人、Pages→itch、itch→Pages） |
| production testの拒否系 | 未許可Origin REST join 403、WebSocket 403、未発行ticket 401 |
| Pages build / deploy | success。Pages deployment reported success |

最終成功runは [Deploy #42081081997](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42081081997)、attempt 1、対象SHA `4924682d58feefaee16b3f7026c359ef6be5e179`です。verify、Chromium、WebKit、matrix audit、release-freshness、Worker deploy、production-test、Pages build/deployがすべてsuccessでした。Worker deploy記録とPages deploymentの`pages_build_version`は同じSHA `4924682d58feefaee16b3f7026c359ef6be5e179`です。Worker URLは既存の `https://heibon-mahjong-online.ak-sekine.workers.dev` のままです。

production testログには以下の両方向シナリオがsuccessとして記録されました。

- `pages-to-secondary-origin-room-and-game-sync`
- `secondary-to-pages-origin-room-and-game-sync`

それぞれでルーム作成・参加、短命ticketと `heibon-mahjong.v1` subprotocolを用いたWebSocket接続、準備完了、座席確定、対局開始、打牌後のrevision同期、切断・再接続後のゲーム状態一致を確認しました。また未許可OriginでのREST join 403／WebSocket handshake 403、発行されていないticketの401も同じ本番Worker上で確認しました。これらはテスト実行時に明示指定したOrigin値による自動通信結果です。実際のiPhone Safari Handshake Originや実機対戦の報告には置き換えません。

**途中の失敗と修正履歴:**

| run / commit | 結果と原因 | 後続対応 |
| --- | --- | --- |
| [#42073068650](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42073068650) attempt 1、`e2a6d9b` | WebKitの既存`browser-round-end-ui.py`が430×932でclick eventを受けずtimeout。Chromiumはsuccessし、ゲートによりdeployはskip。 | ログで対象が既存結果dialogシナリオと確認。同じWorkflow全体を再実行。 |
| [#42073068650](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42073068650) attempt 2、`e2a6d9b` | Chromium／WebKit、matrix audit、Worker deployはsuccess。Production testは、再接続時に既存の古いhost snapshotを拾うテスト待機条件でfailure。 | `request-game-state`後に両socketの新しいmessageを待つよう更新。 |
| [#42078495316](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42078495316) attempt 1、`4de92cc` | Chromium／WebKit、matrix audit、Worker deployはsuccess。両方向のreconnect state比較通過後、対局中に禁止される`close-room`を呼ぶcleanupが`game_in_progress`でfailure。 | テスト終了は対局中に許可されたホスト・最終参加者の通常`leave-room`操作で行うよう変更。 |
| [#42081081997](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42081081997) attempt 1、`4924682` | 全workflow job success。 | 最終結果として採用。上の失敗runの結果は履歴として保持し、最終成功と混同しない。 |

Browser UIはローカルの既知のCodex Cloud sandbox制限のため起動せず、GitHub ActionsのChromium／WebKit matrixで実行しました。初回WebKit失敗は最終runでは再発しませんでした。CIは一度も弱めていません。

### iPhone Safari 実機確認手順（本番Worker反映後）

itch.io Draftに現在アップロード済みのZIPをそのまま使えます。クライアント・バンドルは変更していないので、今回のWorker Origin許可のためのZIP再アップロードは不要です。

**A. itch.io版単独**

1. iPhone Safariでitch.io Draftを開き、現在のゲームを起動します。
2. 「新しくルームを作る」を選び、プレイヤー名とルールを設定して「ルーム作成」を押します。
3. ルームコード表示とオンライン待機画面を確認します。失敗した場合は時刻と表示文を記録します。
4. メニューの診断ログでExecution OriginとBuild SHAを確認し、Cloudflare Observabilityで同時刻の `origin_accepted` / `origin_rejected`、`communicationType: websocket`、Origin、結果を別に確認します。診断画面の値をHandshake Originへ読み替えません。
5. 待機画面が保たれ、Safariから戻って再表示できることを確認します。単独テストだけでは同期・相手参加を確認したことにしません。

**B. Pages版との相互対戦**

同時操作と通信を確認するには、iPhoneと別の参加クライアント（PC/MacのChromiumまたはiPhone/iPadの別ブラウザー・端末）が必要です。同じiPhoneのSafariタブ2枚だけではバックグラウンド停止やタブ切替の影響があるため安定した同時接続テストにしません。

1. Pages版でルームを作成し、iPhoneのitch版から参加します。その後、itch版でルームを作成し、Pages版から参加する逆方向も行います。
2. それぞれ準備完了、ホストの座席確定、対局開始を確認します。
3. 人間の手番で打牌し、相手画面の状態・手番・ゲームrevisionが一致することを確認します。鳴き可能な局面と和了局面が出た場合は鳴き・和了結果も確認します。自然に局面が出なければ未確認のまま残します。
4. 一方のSafariまたはブラウザーでネットワークを一時的に切る／ページを再読み込みし、復帰後に再接続して双方の局・revision・手番が一致するか確認します。対局中の回線切替と再読込は別々に行い、対象端末・OS・Safariバージョンを記録します。
5. iPhone 1台だけで、相手クライアントを維持したまま安定した切断・再接続や双方同時の操作を確認できない場合、その項目は未確認とします。自動production testの成功で実機欄をOKにしません。

### この作業後の結果

| 確認項目 | 状態 |
| --- | --- |
| iPhone Safariでitch.io版を起動 | ユーザー報告 OK |
| CPU対局 | ユーザー報告「問題なさそう」。全操作の確認ではない |
| 実行Origin | `https://html-classic.itch.zone`（ユーザーの診断画面報告） |
| Worker受信HTTP Origin | 同じOriginをCloudflareログで実測。OPTIONS拒否2件 |
| 許可後のルーム作成 | この表の追記時点では未確認。許可前は失敗 |
| Worker受信WebSocket Handshake Origin | 未確認。`origin_accepted`ログまたは拒否ログで本番観測待ち |
| Pages↔itch.io自動相互対局・同期・再接続 | 本番Workerで両方向success。iPhone実機では未確認 |
| 許可後の本番ルーム作成・待機室 | iPhone実機では未確認 |
| GitHub Issue #46 | Openのまま維持。実機の相互対戦、再接続、Draft公開準備を残す |

### 本番結果後のiPhone実機確認項目

1. itch.io Draftを現在アップロード済みのまま起動し、「新しくルームを作る」→名前・ルール入力→「ルーム作成」を行います。ルームコードとオンライン待機画面を確認します。
2. 同時接続には別クライアントを用意してください。Pagesで作成してitchから参加、続けてitchで作成してPagesから参加します。片方はiPhone Safari、もう片方はPC/Mac Chromiumまたは別端末のブラウザーを推奨します。
3. 両方向で準備完了、座席確定、対局開始、打牌とrevision/手番の同期を確認します。鳴きと和了結果は実際に該当局面になった場合だけ確認し、局面を作れなければ未確認にします。
4. 片側を切断・再接続して、両画面の局・revision・手番が一致することを確認します。確認端末、iOS/Safariバージョン、各操作で見えた結果を記録してください。
5. Cloudflare Observabilityでは同じ時間帯の`origin_accepted`または`origin_rejected`を見て、`communicationType: websocket`、Origin、resultを記録します。今回の自動test OriginをiPhone実測値として転記しません。
6. iPhone1台で別クライアントを安定して維持できない操作、実際に発生しなかった鳴き・和了局面は未確認として残します。

今回の変更はWorker設定・自動テスト・文書で、クライアントbundleに変更はありません。itch.io Draftの既存ZIPを使えます。今回のWorker Origin許可のためのZIP再アップロードは不要です。Deploy runが生成した[SHA `4924682`用itch ZIP artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42081081997/artifacts/13442341911)も記録用に残します。GitHub Pages版は同じSHAで再build/deployされ、Pages deployment successを確認しました。

**Issue #46はOpenのままです。** Production testは自動通信の成功であり、iPhone実機のルーム作成、WebSocket Handshake Origin、Pages↔itch実機対局、鳴き・和了同期、Safari再接続、Draft公開準備の最終確認はユーザー確認待ちです。
