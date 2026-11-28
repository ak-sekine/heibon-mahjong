# itch.io HTML5 Draft 準備 — Issue #46

> 以下の初版・過去の評価は当時の履歴です。現行の配布手順・権利・実機確認は[公開準備手順](../operations/itch-release-readiness.md)と末尾の2026-11-28再評価を参照してください。旧記録の同一SHA・Worker先行公開方針は現行運用ではありません。また、旧記録の「public/iconsは生成されたオリジナル」は誤りです。実際には提供された画像が優先され、出典と利用条件は未確認です。

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

## 2026-11-06 最終確認

### 最新mainと対象Actions

作業開始時のGitHub `main` を再取得し、SHAは `7d82b29224c15f04aa940d8dfc3d62d0f4746b94`。指定された参考SHAと一致します。Issue #46本文を再取得しました。Issueコメントはありませんでした。

| run | 対象SHA | 結果と確認内容 |
| --- | --- | --- |
| [#42247363486](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42247363486) | `c95cb315074ddfd5fe4ff9232b6564edcba250a1` | success。実ログの`npm test`は1,462 passed／0 failed。Worker型検査、Pages/PWA build、itch build、Chromium／WebKit Browser UI、standalone itch smoke、matrix audit、Worker deploy、Pages deploy、本番Worker通信検証がsuccess。 |
| [#42254003679](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42254003679) | `33cea3f5fae7d639ae3c8fb2cc8e1abd0581ad0f` | success。実ログの`npm test`は1,463 passed／0 failed。最終「見送る」削除後のWorker型検査、Pages/PWA build、itch build、Chromium／WebKit Browser UI、standalone itch smoke、matrix audit、Worker deploy、Pages deploy、本番Worker通信検証がsuccess。 |
| [#42256496527](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42256496527) | `7d82b29224c15f04aa940d8dfc3d62d0f4746b94` | success。検証記録文書更新のrun。docs-check success。変更分類によりアプリ検証、Browser UI、Worker／Pages build・deployはskipで、コードを再検証・再デプロイしたrunではない。 |

従来の鳴き判断UI記録にあった「85 tests」は誤りとして訂正しました。成功ログで確認できる数はrun #42247363486が1,462件、実装SHAのrun #42254003679が1,463件です。ビルド／テスト成功、Worker／Pagesデプロイ成功、ユーザー実機報告は別の証拠として扱います。

### 今回のユーザー実機報告

以下はユーザー本人の報告を内容の範囲どおり記録したものです。確認日、端末、OS、ブラウザーバージョン、操作条件は提示されていないため補っていません。

| 項目 | 報告と扱い |
| --- | --- |
| GitHub Pages版 | 「pagesで確認したところ問題なさそうです。」概ね良好な操作確認報告。PWAのインストール、更新、オフライン対局を個別に確認した報告ではない。 |
| itch.io版 | 「itch.ioも問題なさそうです。」概ね良好な操作確認報告。PC実機とiPhone Safari実機を区別できる情報はなく、どちらか一方・両方の確認と推定しない。 |
| Pages版とitch.io版の相互オンライン対戦 | 「相互オンラインも大丈夫そうです。」概ね良好な確認報告。Pages側／itch.io側のどちらがルーム作成したか、両方向を個別に確認したか、準備・座席確定・対局開始・打牌・鳴き・和了結果の個別同期は、この報告からは確定しない。 |
| オンライン再接続 | 「再接続も問題なさそうです。」概ね良好な確認報告。切断条件、復帰時間、接続方向、対局状態の各項目を個別に確認したとは扱わない。 |

既存記録の2026-11-05のユーザー報告では、iPhone Safari上のitch Draft起動はOK、CPU対局は「問題なさそう」、画面画像と実行Origin `https://html-classic.itch.zone` は報告済みです。Worker受信HTTP OPTIONSで同Originを観測し、許可前の拒否2件も確認済みですが、WebSocket Handshake Originの実測とは区別しています。今回の一般的な報告をPC実機結果へ転記しません。

### 受入条件と最終判定

| Issue #46受入条件 | 状態 | 根拠・未確認範囲 |
| --- | --- | --- |
| itch.io ZIPを再現可能に生成し、直下`index.html`と相対参照を持つ | 達成 | `build:itch`とパッケージ検査、Actions artifactで確認。Pages PWA用ファイル・検証ページを分離する手順も既存記録にある。 |
| 非公開DraftでPC・iPhone Safariから起動し、CPU対局を開始・操作 | 一部達成 | iPhone Safariの起動OK／CPU対局「問題なさそう」は既存のユーザー報告。今回のitch報告は端末不明。PC実機は未確認。個別のタッチ操作・鳴き判断UI・ページスクロール有無を今回の報告からは確認できない。Chromium／WebKit UIとitch smokeは自動検証。 |
| Pages作成→itch参加、itch作成→Pages参加と、準備・席確定・開始・打牌・鳴き・和了結果を実機で確認 | 一部達成 | Actionsの本番Worker production testは両方向ルーム作成／参加、準備、座席確定、開始、打牌同期を自動確認。今回のユーザー報告は相互オンライン全体を概ね良好とするが、方向と個別操作は不明。鳴き・和了結果同期の実機根拠は未確認。 |
| 片側の再接続後も実機対局を継続 | 一部達成 | 本番Worker production testで切断・再接続後の状態同期を自動確認。ユーザーも再接続を概ね良好と報告したが、切断条件・端末・回復時間・状態各項目は未確認。 |
| 不許可Origin拒否とPages PWAの回帰なし | 一部達成 | Workerの許可／拒否Originテスト、Chromium／WebKit PWA回帰、Pages build/deployは成功。iPhone SafariでのPWAインストール、更新、オフラインCPU対局は未確認。itch OriginのHTTP実測記録はあるが、実機WebSocket Handshake Originは未確認。 |
| 未確認のブラウザー・PWA・実機項目を明記 | 達成 | 本表および既存の実機チェックリストに未確認事項を区別して記載。 |
| 公開素材・手順を整え、一般公開へ進むか判断できる状態 | 一部達成 | 説明、操作方法、対応環境案、無料設定案、PWA案内、ZIP更新手順は文書化済み。公開用cover／screenshotは未確定。第三者素材・コード依存・名称・ルール説明を含む権利の最終確認は未完了で、itch.io上の無料・任意支援設定も実際のDraft設定として確認していない。一般公開へ進めるとの判断根拠が不足。 |

**最終判定：Issue #46はOpenのまま維持します。** 必須受入条件のうちPC実機確認、実機の両方向・個別同期範囲、再接続の具体状態、公開素材・権利・Draft料金設定の最終確認が未確定です。ユーザーの概ね良好な報告と自動検証を厳密な個別項目OKへ拡張せず、未確認を残したままCloseしません。

残作業は、PC実機のDraft／CPU確認、必要に応じてPCとiPhoneの対象を明示した相互対戦・再接続操作記録、鳴き・和了局面が出た場合の同期確認、公開用画像選定、第三者素材・コード依存・表示文言の権利確認、Draftの無料・支援設定確認です。Android／Firefox等の追加対応やitch内PWA導入は本Issueの必須条件にせず、追加対応を行う場合は別Issue候補として扱います。

検証記録更新は文書のみの変更です。ゲームテストの再実行・Worker／Pages再デプロイは行わず、GitHub Actionsのdocs-checkを確認します。

## 2026-11-28 追加調査（途中記録）

この節は調査途中の記録であり、以下の歴史的評価を消さず、Issue #46の最終受入評価を置き換えない。調査基準mainは `c2ffd745a53eb5273155c8f71761a7eefd877381`。[#69最終記録](issue69-pages-phase2b2.md#issue-69-最終評価2026-11-28)によれば、ユーザーは現在のitch Draftの起動・CPU基本操作、Pages↔itch双方の作成・参加、操作・状態同期、切断後の再接続、本番PWAの更新・再起動とCPU基本操作をOKと報告した。11項目の報告に端末別内訳や準備・座席確定・打牌・鳴き・和了の個別操作は記載されておらず、それらを推定しない。DraftのZIPの元SHA・digest・配布日は不明のままである。従来のiPhone Safari起動・CPUの報告と区別する。

基準mainと `77c6c35cc381ffe6987f4ace8bca8cff0fe1653f` の差分は#69検証文書のみ。同SHAの[main CI 46045430838](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838)で成功した [itch HTML5 artifact 15222436013](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838/artifacts/15222436013) は未失効（2027-02-25まで）。GitHubが示す外側artifactのdigestは `30fe2513c921f983b1f10c3bbc9a7f29ae01bb138d68d15da7d0a629308e65aa`、92,568 bytes。取得は保存先でHTTP 403となり、内側ZIPのdigest・内容は未確認。外側digestを内側ZIPへ流用しない。

代替として基準mainで本番API `https://heibon-mahjong-online.ak-sekine.workers.dev` を指定し `npm run build:itch` を実行した。型検査・ビルド成功。ローカル `artifacts/itch/heibon-mahjong.zip` は92,120 bytes、SHA-256 `294a8f0ea85c79655f0cffb069b474f0a66a2f944c03987efb3548b99ff289ed`。ZIPのCRC検査成功、内容は `index.html`、`assets/main-B-E01t_8.js`、`assets/main-XaFuRHRL.css`（合計352,940 bytes）。`node --test tests/itch-package.test.mjs` 成功。これはCI artifactのバイト一致やDraft配布物との同一性を示さない。ローカルZIPのブラウザー実行・秘密情報の網羅的検査は未実施。

実行OriginとWorker受信HTTP Originは過去に `https://html-classic.itch.zone` と記録されているが、WebSocket handshake Originは実測未確認。#69の本番オンライン自動検証とユーザーの現行Draft実機報告を、握手ヘッダーの実測値に置き換えない。Pages・Worker・itchのソースSHA一致を互換性の必須条件としない。

公式[HTML5配布](https://itch.io/docs/creators/html5)と[ページ作成](https://itch.io/docs/creators/getting-started)を2026-11-28に確認。複数ファイルのZIPには `index.html` と必要ファイルを含め相対パスを使用する。coverは315:250比、最低315×250、630×500推奨、スクリーンショットは3〜5枚推奨。上記の旧素材案の16:9は公式cover推奨比ではない。現行Draft設定、画像の公開適性と権利、実機の個別操作、PWAインストール・オフラインCPU、依存ライセンス等の確認は未完了。IssueのCloseおよび一般公開準備完了と評価しない。

## 2026-11-28 継続調査・受入再評価

基準 `c2ffd745a53eb5273155c8f71761a7eefd877381`。前回候補 `bdb3249ef220e34c084fb02e7d3eceda9c48516b` の[CI 46091133527](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46091133527)はverify・Chromium/WebKit Browser UI・local-online・docs-check・auditが成功、publish skip。#31は2026-11-03にiPhone Safariのホーム追加・オフラインCPU操作を実機確認（[7項目](issue31-pwa-2026-11-03.md#2026-11-03-iphone-safari実機結果とclose判定)）。#69では2026-11-28に現在のDraftの起動・CPU基本操作、両方向参加・同期・再接続、PWA更新・再起動とCPU操作を本人がOKと報告。後者は端末内訳や個別操作を列挙せず、同一ZIPのSHA・digest・配布日は不明。過去報告から端末・操作を補わない。

#32はPC表示・操作やiPhone表示、#52・#54・#55は鳴き・ロン・カンUIの変更と検証、#66は座席確定後の準備復元、#67はルーム画面、#47は環境分離、#57・#58はCI分類とBrowser UI分割、#70は固定v1契約と保存・再接続の保護、#69は独立公開と現行Draftの通信確認の証跡。各Issueのcloseは#46の新ZIPの実機確認を意味しない。最新公開Pages・Workerについて#69の[本番Worker 46083763674](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46083763674)・[本番Pages 46084987199](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46084987199)と同記録のユーザー報告を再利用する。#69の過去のWebKit失敗の根本原因は未確定のまま記録する。

正式GitHub連携からCI artifactのファイル参照を得たが、実行環境で取得するとHTTP 403。外側のartifact digestを内側配布ZIPのdigestと混同しない。ローカル代替ZIPのCRC・相対パス・API設定・既存パッケージテストは確認したが、実ZIPのChromium/WebKit実行は未実施。CI smokeは同じ製品ツリーのmock APIビルドを対象とする。詳細・掲載文・権利・設定・新ZIP実機手順は[公開準備手順](../operations/itch-release-readiness.md)。

画像を実見した結果、`public/icons/icon-512.png` は512×512で素材の出典・権利が未確認。`step13.5.4/screenshots/sizes/normal-1280x800-start.png` は1280×1175、`normal-390x844-start.png` は390×959で、いずれも開発用表示と旧UIがあり公開用には採用しない。`docs/screenshots/riichi-step13-1/390x844-tsumo-result.png` は390×844の旧結果画面で現行表示との一致・画像権利を確認できず採用しない。ファイル名のviewport寸法と実画像寸法は異なる。現行UIのcover 630×500とPC・スマートフォンのCPU／オンライン／結果画面の3〜5枚は未用意。現在のDraftまたはPagesから撮影し、実画像・権利・個人情報・認証情報・非公開牌・テスト表示を確認する。カバーの最終選択はユーザーが行う。

### 作業範囲7件

| 項目 | 判定 | 根拠・残作業 |
| --- | --- | --- |
| 配布形式調査 | 達成 | 公式HTML5・画像仕様と手順を[公開準備手順](../operations/itch-release-readiness.md)に記載。Draft画面の実設定は別途確認 |
| itchビルド | 一部達成 | 相対パスZIPと既存CI smokeは成功。配布ZIPのライセンス表示と実ZIPのブラウザー実行が未確認 |
| PWA分離 | 達成 | itch ZIPにmanifest・SW・アイコンなし。#31実機と#69更新報告、CI PWA回帰を区別。itchでのオフライン起動は保証しない |
| オンライン接続 | 達成 | WorkerのPages・itch Origin完全一致と拒否系テスト、本番オンライン検証、旧Draft実機報告。Handshake Origin実測は補助診断で未確認 |
| クロス公開元対戦 | 一部達成 | #69で旧Draft双方の作成・参加・操作同期・再接続OK。新ZIP、準備・席確定・打牌・鳴き・和了の個別実機証跡は未確認 |
| 素材・情報 | 一部達成 | 掲載文・権利棚卸しを用意。現行画像、提供アイコンの権利、Vite表示と管理画面設定は未完了 |
| 配布・更新手順 | 一部達成 | 手順・記録項目と切り戻し条件を作成。確定ZIPの権利表示、実画面設定と新ZIP実機確認は未了 |

### 受入条件7件

| 条件 | 判定 | 根拠・残作業 |
| --- | --- | --- |
| 再現可能なZIPと直下index | 達成 | `build:itch`・CRC・パッケージテスト成功。成果物の配布条件は別項で未解決 |
| DraftでPC・iPhone CPU | 一部達成 | 旧DraftのiPhone起動OK／CPU概ね良好と#69の端末不明の起動・CPU報告。PCを特定した旧Draft実機と新ZIP両端末は未確認 |
| 双方の作成・参加と個別同期 | 一部達成 | #69旧Draftで両方向参加・操作同期OK。準備・座席確定・開始・打牌・鳴き・和了結果の個別報告、新ZIPは未確認 |
| 再接続後の同期 | 一部達成 | #69旧Draftで再接続OK。復元した状態の具体的範囲と新ZIPは未確認 |
| 未許可Origin拒否・Pages PWA回帰なし | 一部達成 | Origin自動拒否、#31 iPhoneでホーム追加・オフラインCPU、#69本番PWA更新・再起動・CPU基本操作、CI PWA回帰。現行本番PWAの機内モードCPUは未報告で、回帰を追加確認する |
| 未確認事項を明記 | 達成 | 記録と手順に自動・実機・設定・権利の範囲を区別 |
| 公開素材・手順と公開判断 | 一部達成 | 文面・手順・権利一覧・確認表は用意。画像、Vite表示・提供アイコン等の権利、管理画面、新ZIP確認が残る |

**判定：Close不可。** 特に現行ZIPにVite生成のmodulepreload補助コードが含まれ、MIT原文の表示条件について配布物にはライセンスファイルがない。必要な表示・同梱方法の判断と配布処理の修正範囲は別途評価し、権利未確定の画像を使わない。Draft更新・一般公開はユーザーの操作。Issue本文・状態は変更しない。

## 第三者通知同梱の候補作業（2026-11-28）

基準main `fd9e2580bf717882f577a7051195bb99ebdbe503`。Vite 7.3.7の全ライセンス原文を固定version・SHA-256で照合し、`THIRD-PARTY-NOTICES.txt` としてitch ZIPに同梱する変更を準備。許可外ファイルは引き続き拒否し、欠落・改変・version不一致を検知する。`call-test.html` も明示的に除外する。既存パッケージテストとsmoke起動検査は成功。

本番URL指定ローカルbuildは型検査・ZIP生成成功。CRC、相対参照、4ファイルと原文一致、本番API、mock/dev URL不在、代表的な資格情報形式の不在を確認。これは網羅的な秘密情報検査ではない。生成時刻とgit SHAがビルドに入るため、候補commitのCIで生成されたZIPとローカル生成ZIPは一致を仮定しない。

ローカル `npm test` は105ファイル中101成功、公開基盤関連4ファイル失敗。詳細診断では `spawnSync git`・`tar`・`python3` の `EPERM`。失敗を保持し、別環境の候補CIでの結果を別に確認する。Pages production/development build、Worker型検査は成功。本番・開発Pages buildにもmodulepreload補助コードがあり、ライセンス表示の別対応が必要。公開済みPagesの直接確認や修正・再公開は未実施。

ユーザー実機・権利確認・現行画像の確認は引き続き未完了。Issue #46はOpen・Close不可。完成前のCI結果や配布物のdigestはこの時点で成功扱いしない。

### 候補CI失敗・停止（2026-11-28）

候補 `067412eaf2d7532da5220e9808676220c2810cca` の[CI 46099090749](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46099090749)はverify・local-online・環境分離Chromium/WebKitに成功し、配布予定の本番接続先ZIPの実体をダウンロード・digest照合・展開して起動とCPU打牌を試す新smokeもChromium/WebKitで成功した。しかしWebKit group 2の既存 `tests/browser-round-end-ui.py` は320×480で最終順位を閉じた後の局結果再表示に失敗し、`buttonClicks: 0`、結果ダイアログは閉じたままだった。直前のitch smokeは成功。2026-11-27の#69記録にも類似のWebKit click未発生があり、根本原因は未確定。今回の新smokeとの因果や製品・テスト・実行環境のいずれの問題かは確定しない。失敗を消さず、無根拠な再試行、テスト緩和、main統合は行わない。

本候補が生成した[itch HTML5 artifact 15244871776](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46099090749/artifacts/15244871776)とreview用CPU画像は存在するが、CI全体が失敗したため配布候補として確定しない。外側のdigestは内側ZIPのdigestではない。この実行環境では既存のartifact取得経路はHTTP 403で、内側ZIPのdigestや画像を直接確認できていない。ZIPのソースSHAを示す `source-sha.txt` と内側の `SHA256SUMS` はartifact内にある。公開画像は未検査のため未採用。別途、検査する内側ZIPのdigest・内容・容量をCIログへ出す修正は作業ツリーに未commitのまま保持し、失敗を無視してCI再実行しない。

### 2026-11-28 再調査：限定診断の条件

失敗jobのResultReopenTraceと#69の限定成功runを比較した。双方の320×480で同じボタン・hit test、viewport復元後の同一座標、close後のfocus復元を観測。失敗ではpointerdown/mousedown/pointerup/mouseupが届いたがclickなし、成功ではclickあり。DOM置換・ページエラーは観測されず、window captureのdefaultPreventedはその後のイベント処理を保証しない。#69の失敗は今回のitch ZIP smoke導入前で、今回のsmokeが失敗の必要条件だとする根拠はないが、干渉は排除できない。

診断前に上限を**候補SHA・WebKit・320×480・browser-round-end-uiの1回**と定める。既存のpointer操作とassertion・traceを変更せず、明示指定した手動限定診断に限りviewportを絞る。通常のpush CIと全viewportは変更しない。成功は原因の解明を意味せず、失敗を含め結果をそのまま残す。ローカルWebKitの取得は正規ネットワーク許可付きのPlaywright installでcdn.playwright.dev等が403 Domain forbiddenを返し実行不能、Chromium起動制限は回避しない。

限定診断の結果：候補 `3258358724b58deb18d520b9de14c7ad93584883` の[run 46100434908](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46100434908)は手動指定 `browser-round-end-ui-webkit`・320×480のみを1回実施し成功。最終順位close後、同一DOM token・期待座標のボタンにpointerdown/mousedown/pointerup/mouseup/clickが届き、結果ダイアログが再表示、`ResultDialog.open` の既存1回assertionとキーボード確認も成功。trace欠落0。この成功では既存の失敗は再現せず、原因を証明しない。試行上限に達したので追加試行をしない。

失敗と成功ではviewport・ボタン位置・hit test・close後のfocus復元は共通。失敗側のwindow captureでは入力イベントのdefaultPreventedはいずれもfalseだが、後続リスナーでの状態、UA内部のclick生成・modal top layerの完全な解除、PlaywrightとWebKitの内部動作は未確定。buttonの置換やDOM上の明らかな遮蔽は今回の該当時点では観測されなかった。新itch smokeの前にも#69で同じ失敗があり、smokeを原因と断定できない。今回のsmokeの有無を統制した実験は未実施。実機への影響は未確認。

ユーザーの停止条件に従い、原因未解明の再発を残したまま製品・テストの動作修正、main統合、配布候補の確定は行わない。候補pushに伴う自動CI [46100422129](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46100422129)は別途進行しており、成否がいずれでも失敗原因の解明とは扱わない。

候補push CI [46100422129](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46100422129) は同SHAでverify・local-online・環境分離・Chromium/WebKit全group・audit成功、publish skip。旧失敗の原因は未解明であり、main統合は保留。実ZIP artifact [15245282604](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46100422129/artifacts/15245282604) の内側 `heibon-mahjong.zip` はCIログのchecksum照合でSHA-256 `e01e6f966fe50dadebe79a09fd1100d51b8296b4c25522fc8ddb31f8b1b78220`、99,827 bytes、root `index.html`・`assets/main-PXnOtANr.js`・`assets/main-XaFuRHRL.css`・`THIRD-PARTY-NOTICES.txt`。両browserの実ZIP smokeログは同一digestを出し成功。通知原文は生成時にVite 7.3.7の固定SHA-256と照合しているが、この環境ではartifactの中身を個別取得して比較できていない。GitHub artifact外側digest `378b0c0fe4e021058d3b364c877cd920991de58d8985491baacdc36a3b2ddb86` は内側のdigestとは別。取得時はartifactを展開し、内側ZIPとSHA256SUMSを照合する。これは未解決停止条件により最終配布確定ではない。

### 統合判断と独立Issueへの引き継ぎ（2026-11-28）

候補 `3258358724b58deb18d520b9de14c7ad93584883` はZIP生成、パッケージテスト、実ZIP smoke、手動診断と文書のみを変更する。ゲーム・ダイアログ・通信・保存・Pagesビルド処理への差分はない。通常CIのviewportとassertionを維持し、候補の必須CI・audit成功を確認後、同一SHAをmainへfast-forwardした。過去のWebKit問題は分離して追跡する。

WebKit引き継ぎ。320×320で最終順位を閉じ、Enterで再表示して再度閉じた後、320×480に戻して局結果をポインターで開く工程。失敗は #69の [job 140581878590](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46021197973/job/140581878590)（artifact 15208572340）と #46の [job 140837638681](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46099090749/job/140837638681)（artifact 15244487603）。成功対照はrun 46025650946、46100434908、46100422129。失敗時も同一DOM・hit test・押下と解放を観測したがclickとopen呼び出しがなかった。製品・テスト・WebKit・Playwrightのどこで起因したか、変更との因果、実機への影響は未確認。ライセンス対応前にも発生した。

追加診断は一度に一変数を変更する。基準を固定し、viewport復元あり／初めから320×480、closeイベント観測前後、フォーカス復元あり／なしの診断fixture、locator操作／座標でのネイティブ入力、固定PlaywrightおよびWebKit版／既知成功版を個別比較する。top layer・フォーカス・最終イベント取消状態を記録し、試行上限を先に定める。修正の受入条件は原因と変更の対応、短画面と通常画面で実ポインターおよびキーボード再表示、各操作でopenが1回、Chromium/WebKitとaudit成功。Issue登録はChatGPTへ引き継ぐ。

Pagesライセンス引き継ぎ。本番・開発のローカルビルドにVite 7.3.7のmodulepreload補助コードを確認。MIT著作権・許諾文を含むインストール済みライセンス原文を各Pages出力へ同梱し、公開先から参照できる設計を別Issueで検討する。productionと/devの両方で配信パスとsnapshot hashを確認し、通知をオフライン提供する場合はSWのprecache対象と世代更新を検証する。新規インストール、旧キャッシュからの更新、機内モードCPU、環境間分離を回帰検証し、既存の独立公開手順で開発・本番をそれぞれ扱う。

公開画像は候補CIのCPU画像artifact 15244968850（Chromium）と15244599129（WebKit）を優先。取得後に実画像を確認するまでは公開保留。現行Draft／PagesでPCとスマートフォンのCPU卓、公開情報のみのオンライン卓、局結果から3〜5枚を選ぶ。診断表示、個人情報、ルームコード、非公開牌を除外する。カバーは権利確認済みの現行卓を630×500に整え、タイトルを添える。出典未確認のPWAアイコンは採用しない。

### 技術的な配布候補の確定

mainの同一SHA [必須CI 46101623962](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46101623962) は全ブラウザーグループ、verify、環境分離、local-online、auditが成功。publishはskip。採用するZIPは上記の候補CI artifact 15245282604の内側ZIPのみ。mainへビルド元SHAをそのまま統合し、両ブラウザーの候補CIログにある同一digestと有効期限（2027-02-26 02:55 UTC）を照合した。main CIで生成された別ZIPはこの配布記録の対象外。画像の取得は403で実見できなかった。

作業範囲は配布形式、itchビルド、PWA分離、オンライン接続、配布・更新手順が達成。クロス公開元対戦と公開素材は新ZIPの実機・画像・権利確認が残り一部達成。受入はZIP生成と未確認の明記が達成。DraftからのCPU対局、個別同期、再接続後の復元、Origin拒否と現行Pages PWA回帰、公開素材を含む公開判断は一部達成。旧配布版の実機記録は保持し、新ZIPに転用しない。IssueはClose不可。

Issue #71の選択フィードバック追加に伴い、旧配布候補 artifact 15245282604 は当時の証跡として保持する。新しい公開用候補は変更後の必須CI・実ZIP検証から確定する。
