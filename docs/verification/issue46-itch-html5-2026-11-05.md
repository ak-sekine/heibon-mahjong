# itch.io HTML5 Draft 準備 — Issue #46

更新日: 2026-11-05

対象: `ak-sekine/heibon-mahjong` Issue [#46](https://github.com/ak-sekine/heibon-mahjong/issues/46)

実装基準: `origin/main` `73efa9daa1e5848e53d741c44dc8ab71cee7300f`
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

下表はローカル自動検証を記入します。Pages版のPWA自動テストとitch ZIPテスト、Worker Originテストを区別します。GitHub Actionsの実行結果はpush後の対象SHA runを確認して追記します。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。84/84テストファイル、失敗0 |
| `npm run typecheck:worker` | 成功 |
| Pages `npm run build` とPWA成果物 | 成功。`index.html`、`test.html`、`kan-test.html`、manifest、4アイコン、`sw.js`を生成 |
| `VITE_ONLINE_API_URL=… npm run build:itch` | 成功。実URL `https://heibon-mahjong-online.ak-sekine.workers.dev`をバンドルに確認 |
| ZIP root `index.html`、相対参照、大文字小文字、除外物、サイズ制限 | 成功。ZIPは3ファイル、展開後332,565 bytes、圧縮後87,075 bytes、最大単一ファイル258,598 bytes。ZIPのCRC展開検査成功 |
| Pages buildとの分離 | itch build前後のPages `dist/index.html`、`dist/sw.js`、`dist/manifest.webmanifest` SHA-256が一致 |
| Pages Origin / 未許可 / Origin欠落 / OPTIONS / WebSocket / token | 自動テスト追加済み。全ケース成功。実測していないitch Originは未許可のまま |
| GitHub Actions browser UI（Chromium / WebKit）、Worker / Pages deploy | push後の対象SHAで確認。未確認 |
| Pages PWAの画面・更新・オフラインCPU対局 | 既存PWA testとBrowser UIを確認。今回の追加変更後は実機未確認 |

## Draft実機チェックリスト（すべて未確認）

ユーザーが確認日・端末・OS／ブラウザバージョンとともにOK／NG／未確認を記録します。自動テストの成功で置き換えません。

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
| PC・iPhone Draft CPU対局 | 未確認・実機待ち |
| Pages↔itch相互ルーム・対局同期・再接続 | 未確認・Origin実測と実機待ち |
| 未許可Origin拒否、Pages PWA回帰 | ローカルOrigin/PWA自動検証は成功。Pages PWA実機回帰は未確認 |
| 未確認動作を明示 | 本記録と上記リストで記録 |
| 公開素材・Draft手順・一般公開判断材料 | 本記録を整備。権利最終確認とDraft実機確認は未完了 |

ローカルのブラウザーUI検証はこのCloud環境の既知のChromium sandbox起動制約のため実行していません。GitHub ActionsにChromium／WebKitでitch配布ビルドから起動し、PWA登録がなく、CPU対局を開始・打牌できるsmoke testを追加しました。対象SHAのActions結果はpush後に確認します。

したがって、実装完了／自動検証完了／Draft実機確認完了／一般公開準備完了は別々に判定します。この記録を作っただけでIssueを完了・Closeしません。
