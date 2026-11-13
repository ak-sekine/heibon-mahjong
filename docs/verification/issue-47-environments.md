# Issue #47 検証記録（2026-11-11）

> **最新状態（2026-11-13）：Phase 2完了。** 下記は2026-11-11時点までの記録であり、その後の本番移行と本人実機報告を末尾の[Phase 2完了記録](#2026-11-13-phase-2完了記録)に追記した。Issue #47全体の受入条件が完了したという意味ではなく、IssueはOpenを維持する。

## 自動検証

- 開始時HEAD / fetch後origin/main: `cb457bb0dfe00455adf66d5f8c51284d0d00081f`。ブランチwork、clean、behind/ahead 0/0。最新mainからdevelop作成。
- `npm test`: 88 test files成功（新規workflow契約テスト追加前）。PWA変更後の関連4ファイル再実行成功。
- `npm run typecheck:worker`: 成功。
- 本番build / 開発build / itch buildとZIP: 成功。ローカルでは検証専用`.validation.workers.dev`を指定。実WorkerのURLではない。
- 両ビルドのseal / SHA256 inventory再検証: 成功。HTMLの`./`リンクをindex.htmlへ解決する検査の不備を修正後に成功。
- 成果物合成テスト: mainのみ、developのみ、両順序、保持側の全ファイルhash不変、未準備devの省略、本番なしdev bootstrap拒否、古いSHA拒否、同SHA再実行拒否、破損候補拒否、保存snapshot破損拒否、pending中の再公開拒否を検証。
- Pages失敗/応答不明をpending状態として再現。実GitHub Pages障害注入・並行push・Worker失敗の外部E2Eは未実施。CI失敗時のジョブ依存、Worker branch/token分離、公開前pending保存を静的検証。
- SW runtime検証: 本番はdev fetchを処理しない、キャッシュ削除は自環境のみ、本番clients.claimなし。
- storageキー検証: 本番旧キー維持、開発書込/削除で本番値不変。
- ブラウザ検証はGitHub ActionsのChromium/WebKitで実施する。ローカルはAGENTS.mdの既知の起動制限に従い再実行しない。
- GitHub変数一覧APIは権限付き通信後HTTP403（Resource not accessible by integration）。設定状態は未確認。新経路は`workflow_dispatch`のpublish=trueも要求するため、pushだけでは外部公開しない。

## 実機・公開・外部設定

いずれも未確認。Cloudflare資格情報はこの実行環境にない。Worker名とDO設定は追加したが、開発Worker作成済みとは報告しない。
本番/開発URLの公開確認、実Worker間の状態分離、最終公開SHA、Pages build/deploy成功は未確認。

## 受入条件対応

| #47受入条件 | 状態 | 根拠・残件 |
|---|---|---|
| 検証済み本番/開発成果物と巻き戻り防止 | 一部実装 | hash inventory、合成・pending・freshness、ローカルGit競合試験成功。実Pages移行未実施 |
| 両URLのリソース、PC/iPhone CPU対局 | 一部実装 | build/static検査とChromium/WebKitの両版CPU起動成功。公開URL/実機未確認 |
| PWAインストール・offline・更新の分離 | 一部実装 | SW/cache/storage、両エンジンでoffline・更新・旧claim模擬成功。既存ユーザー/iPhone実機未確認 |
| 対応Worker、ルーム/認証/状態分離 | 一部実装 | 別config/DO/entry/token経路、別ローカルWorkerで対局/再接続/分離成功。実Cloudflare設定・通信未確認 |
| 更新・並行・失敗・再実行の他環境保全 | 一部実装 | ローカル合成障害・Git競合・URL変更拒否試験成功。実Actions/Pages障害・競合未確認 |
| 本番ゲート・可用性・SHA追跡 | 一部実装 | 旧ゲート維持、新定義で両エンジンとaudit成功。既存公開SHA読取確認。移行未実施 |
| 運用/rollback/未確認項目文書 | 実装 | 開発設計、運用、当記録。実行結果を継続追記 |

IssueはOpenを維持。公開/実機を含む未完了受入条件にはチェックしない。

## develop初回CI

`8c260652ad65b33019a3f05d571863d78da7b56e` / [run 43109455700](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43109455700)：verify成功。新規Chromium分離テストでwaiting workerがnullのまま更新要求するテスト同期不備を検出。更新インストール・有効化のイベントを明示的にawaitする修正を追加する。実公開ジョブは未実行。

ローカル全89テストファイル成功（workflow契約テスト追加後）。開発HTMLにはホーム画面用DEV名を追加。JSのimport/new URL参照も静的検査対象に含め、両実ビルドのseal成功。これらの変更後の関連3テストファイルも成功。

初回CIの追加所見：既存itch smokeは`online-mock.invalid`を前提とするため、検証用itch buildを従来どおりmock URLに戻す。公開用ZIPは本番Worker検証後の独立buildに分ける。ローカル2Worker検証は開発側の起動待ちで失敗したため、同時起動のinspectorポートを分離し、起動失敗ログを出すようにする。SW更新fixtureのLast-ModifiedはHTTPサーバーの秒精度を考慮して変更する。

## 既存本番の公開記録（読取のみ）

2026-11-11にGitHub Deploymentsを照合。`heibon-production-worker`（7709534462）、`github-pages`（7709559454）、`heibon-production-pages`（7709565599）はいずれもSHA `d50e8a6a5a67e8767de824bb80d2e83751cf474d`でsuccess。本番Pages runは[43012562746](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746)。本番Worker URLは既存検証記録の`https://heibon-mahjong-online.ak-sekine.workers.dev`。現行公開bytesへの直接アクセスは未確認。今回のdevelop pushではこれらを変更していない。

旧本番SWの広いclients.claimを模した追加更新fixtureから、開発controllerの再取得とoffline継続を確認するブラウザケースを追加する。実iPhoneでの移行確認の代わりにはしない。AGENTS.mdの通常作業先もdevelopへ変更し、将来の作業が旧main直push指示へ戻らないようにする。

## 分離テストの成功記録

[a02b31f / run 43110144307](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43110144307)でverify、Chromium/WebKitの環境分離smoke、local-onlineが成功。local-onlineは本番用/開発用の別ローカルDO storeを用い、相互のルーム404・token拒否を確認し、両方で既存の5シナリオ（2人対局とCPU引継ぎ再接続、切断再接続、ホスト引継ぎと1人+CPU3人、4人、3人+CPU1人）が成功した。公開済み本番Workerへは通信していない。

[63ff388 / run 43110685013](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43110685013)には旧root SWのclients.claimを模した回帰ケースを追加。最終結果は追記する。保存先に台帳未登録のdevファイルがある場合も停止する試験を追加し、ローカル成功。これにより未準備側に未検証ファイルが混入していても公開しない。

## 変更ファイル一覧

- 運用: `AGENTS.md`、`README.md`、`docs/SPEC.md`、`docs/ROADMAP.md`、`docs/development/issue-47-environments.md`、`docs/operations/environments.md`、本検証記録。
- build/PWA: `.gitignore`、`package.json`、`vite.config.ts`、`index.html`、`scripts/build-pwa.mjs`、`src/pwa/register.ts`。
- 保存分離: `src/environment.ts`、`src/model/rules.ts`、`src/online/diagnostics.ts`、`src/online/waiting-room.ts`。
- Worker: `wrangler.development.jsonc`、`worker/development.ts`、`worker/tsconfig.json`。
- 公開: `scripts/environments/artifacts.mjs`、`.github/scripts/deploy-isolated-worker.mjs`、`.github/workflows/environments.yml`、`.github/workflows/publish-environments.yml`、`.github/workflows/deploy.yml`。
- 検証: `tests/environment-artifacts.test.mjs`、`tests/environment-git-store.test.mjs`、`tests/environment-storage.test.ts`、`tests/environment-workflows.test.mjs`、`tests/online-environments.mjs`、`tests/browser-environments.py`、`tests/browser-pwa.py`、`tests/pwa.test.mjs`。


## 公開保留と保存先初期化

ユーザー回答原文：`未設定・未確認（公開を保留）`。Cloudflare Worker、Pages、新公開経路の有効化は実行しない。main pushは旧本番公開を起動し得るため保留する。

成果物保存ブランチ`pages-verified`を既存ブランチの不在確認後に独立した一時Gitリポジトリから初期化し、`232205c5efc7f86df8d70432a62224e82b4fb0ed`をpush・リモート照合した。README.mdと空のstate.jsonだけで、site/や公開候補はない。Pagesへの操作ではなく、本番未登録時のdev bootstrap拒否も維持される。

ローカルbare Gitと2つのcloneで同時書込みを再現し、一方のpending保存後にもう一方のpushがnon-fast-forwardで拒否されること、本番SHAが保持されること、pending中は再公開不能なことを確認。`tests/environment-git-store.test.mjs`として常設し単独実行成功。実GitHub concurrency/Pages障害注入の確認とは区別する。

Storageの追加監査：src/public/workerにIndexedDB、Cookie Store/document.cookie、BroadcastChannel、SharedWorker、window.name、history状態、navigator.storageの使用はない。保存キーは調査済みのrules・session・diagnosticsだけ。ブラウザ自身のフォーム補完等はアプリの保存キー分離の保証範囲とは別である。


検証済みartifactのWorker URLと、実デプロイ・オンライン検証後のjob output URLも合成時に一致を要求する。長いCI中にrepository variableが変更された場合、artifactだけ旧URLのまま公開する経路を閉じる。URL不一致でstoreの全hashが不変なことを単体検証した。公開CLIは実Worker URLの指定を必須とし、publisherへ直接job outputを渡す。

B7候補のActions artifactはproduction ID 13896301838、development ID 13895987799で、SHA b7efd2dと対応。APIのexpires_atは2027-02-09（90日）を確認した。いずれも検証専用URLを含む未公開候補であり、実Worker設定なしで公開・bootstrapしない。


## アプリ動作変更の最終CI

[b7efd2d24f19f6f51bf608553d5fc82eca07f459 / run 43111116668](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43111116668)で以下がすべて成功した。

- verify：npm test 1,528テスト、Worker型検査、TSを含む本番/開発build、itch build、両artifactのsealと保存。
- Chromium / WebKitの環境分離smoke：両CPU対局、rules/session保存の分離、両cache保持、独立更新、旧root claimを模した更新、両offline起動。
- local-online：別DO storeのルーム/認証分離と、両Workerそれぞれの既存5オンラインシナリオ。
- 既存Browser UI全体：Chromium、WebKitとも成功。PWAの初回有効化、失敗インストール復旧、古いHTTP cacheからの更新検出、同環境複数タブの更新ブロック、承認更新・旧cache削除を含む。itch smokeの前後実行と失敗診断検査も成功。
- Browser UI matrix audit成功。
- worker-production / worker-development / online / publish：pushでの公開条件を満たさないためskip。公開成功とは扱わない。

初回8c26065のCI失敗は前述の通り。dda2421 / a02b31f / 63ff388の中間runは成功した分離シナリオを確認後、最新runを優先するため重複実行を停止した。停止を成功とは扱わない。

B7以後の追記は公開制御のWorker URL照合、Git競合回帰テスト、文書・コメントで、アプリ動作コードは不変。追加した公開制御は関連4テストファイルとGit競合試験で成功。実公開はユーザー指示により保留のまま。最新追記SHAに対するCI再実行と、B7で確認したアプリ全UI結果を混同しない。

追記後のローカル`npm test`は90テストファイルすべて成功（42.6秒、失敗0）。`git diff --check`、workflow YAML読込、ブラウザ検証スクリプトのpy_compileも成功。

## 同一Cloudflareアカウント方式への変更（今回）

前節までの結果は変更前の記録。今回の開始時HEADは`cb457bb0dfe00455adf66d5f8c51284d0d00081f`（work、clean）、fetch後origin/mainも同SHA。通常fetchはgithub.comへのproxy:8080接続で失敗し、許可付きfetchで成功。developは取得対象外だったため明示fetchし、最新`262fe879ad0bd7dfe133ba6474d68456114c8934`から開始した。mainに対してbehind/aheadは0/6、6件は既存develop履歴で、origin/developに対する未pushコミットはなし。

既存結果の追加確認：変更前`262fe87`の[run 43115789427](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43115789427)は全体successで完了していることを今回APIで確認した。これは今回の変更に対する結果ではない。

今回の変更ファイルは以下の6件。

- `.github/scripts/deploy-isolated-worker.mjs`：開発の別アカウント必須チェックを削除。account ID必須、branch/SHA/Worker URL確認は維持。
- `.github/workflows/environments.yml`：両Worker jobは共通repository variable `CLOUDFLARE_ACCOUNT_ID`を参照。Environment・Secrets・ブラウザ検証・公開ゲートは維持。
- `tests/environment-workflows.test.mjs`：共通account IDと各configで両デプロイ経路が成功するモック試験、ID欠落時の停止、DO自己bindingを確認。
- `docs/operations/environments.md`：共通アカウントとGitHub変数・環境別Secretsの設定手順を更新。
- `docs/development/issue-47-environments.md`：現行設計を同一アカウント方式へ更新。
- 本検証記録：過去と今回の検証結果・未確認項目を区別。

`wrangler.jsonc` / `wrangler.development.jsonc`は変更不要。別Worker名、ROOMS / RATE_LIMITERの自己binding、各WorkerのSQLite migrationを維持する。同じクラス名・migration tagでもWorkerごとにDO namespaceが作られる。ビルド・PWA・Storage・Pages合成・itchの動作コードは変更していない。

追加テストの初回はsandboxの子プロセス起動EPERMで失敗。CLIをVM内でモックする方式へ修正して再検証する。実Cloudflareへのデプロイ試験ではない。

今回も外部設定変更・Worker/Pages公開は実施しない。実Cloudflare同一アカウント内でのルーム/token/状態分離、公開後E2E、iPhone Safari実機は未確認。別アカウント準備は残作業から外し、共通account ID、各Environment secretと実Worker URLの設定確認を残す。誤設定リスクへの追加対策・権限分離強化は対象外。IssueはOpenを維持する。

今回のローカル結果：`npm test`全90テストファイル成功（失敗0、41.8秒）。`npm run typecheck:worker`成功。本番`npm run build`、開発`npm run build:dev`、`npm run build:itch`とZIP生成成功。両Pages成果物のseal / hash・参照検査成功。Pages用URLは各`.validation.workers.dev`、itchは`https://online-mock.invalid`で、実公開接続先ではない。`git diff --check`成功。今回のChromium/WebKit・ローカル2Worker検証はdevelop pushで起動する既存Actionsにて確認する。ローカルブラウザはAGENTS.md記載の既知の起動制限に従い再実行しない。

## 2026-11-12 公開移行前チェック

[今回の取得証跡・検証結果](issue-47-preflight-2026-11-12.md)と[確定したPhase別切替手順](../operations/issue-47-cutover.md)を追加。過去の成功記録と今回の再確認を区別する。公開は未実施、IssueはOpen。

## 2026-11-13 Phase 2完了記録

### 本番公開と自動検証

今回の記録はGitHub Actionsの取得結果、既存の公開後ライブ監査記録、Issue #47の公開コメントと照合した。自動検証と本人の実機確認は別の結果として扱う。

| 証跡 | 結果 |
|---|---|
| 統合後CI [run 43426274255](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43426274255) | success。verify、local-online、Chromium/WebKit環境分離、Browser UI両engine、auditがsuccess。worker-development、worker-production、online、publishはskip。 |
| 本番公開workflow [run 43430225160](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43430225160) | success。release-freshness、verify、Chromium/WebKit、matrix audit、Worker deploy、production-test、Pages build/deployがsuccess。 |
| 公開後ライブ監査 [run 43434482360](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43434482360) | success。既存記録では公開SHA、Worker状態、公開URLと実公開artifactの16ファイルを照合し、すべてSHA-256 MATCH。 |
| Worker診断 [run 43434482361](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43434482361) | production-test success。 |

- 公開元SHA: `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`。
- Worker: deployment `3b6587ac-79fd-49a8-b6d1-2f77a9022331`、version `85e9510f-3f21-45c1-b0ff-4a4de66e7749`。
- Pages deployment: `7766490026`。
- 公開artifact: `published-pages-c3b84944daaa8fbba3b4b603c0d3f8430e9afb58-1`、artifact ID `14043735340`、ZIP SHA-256 `fe5744e7b7178a92db884c8926d1e637c9668eb79b7cc4c0da4fb4d1b0813aff`。Actions artifact API上の名前・ID・digestを再照合した。公開後監査記録はこの実artifactの16ファイルと本番公開URLの各SHA-256一致を報告している。

### ユーザー本人によるiPhone Safari実機確認

確認日：2026-11-13。端末：iPhone Safari、既存ホーム画面PWA。iOS/Safariバージョン詳細は未記録。以下は本人が報告した判定のみを転記し、自動テスト結果とは分ける。

| No. | 確認項目 | 結果 |
|---:|---|---|
| 1 | 既存ホーム画面PWAが起動する | OK |
| 2 | 更新通知があれば更新でき、再起動後も正常動作する | OK |
| 3 | 既存ルール設定が保持されている | OK |
| 4 | 既存オンライン参加・再接続情報が保持されている | 未検証 |
| 5 | CPU対局を開始し、ツモ・打牌ができる | OK |
| 6 | 鳴きなどの操作が正常にできる | OK |
| 7 | 機内モード・Wi-Fi OFFでPWAを再起動し、CPU対局できる | OK |
| 8 | 通常Safariから本番URLを開き、正常に起動できる | OK |

集計はOK 7件、NG 0件、未検証1件。本人の補足は「オンライン対局していませんでした。」であり、更新前後のオンライン参加・再接続情報を比較できなかったことが未検証の理由。保存データの内部状態を調査していないため、保存キーや再接続情報が存在しなかったとは断定しない。iPhone実機でオンライン対局・再接続した結果もない。更新通知が実際に表示されたか、Service Worker内部でどのversionを照合したかは補足しない。

### Phase 2判定とIssue全体の残件

1. 本番Workerデプロイ: workflowの`deploy-worker` success。公開後のdeployment/versionは上記のとおり。
2. 本番Pagesデプロイ: workflowの`pages-deploy` success、Pages deployment ID `7766490026`。
3. 公開SHA: workflow記録と公開後監査により`c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`で一致。
4. 公開artifact: API上のID・ZIP digestを照合。公開後監査が16ファイルすべてのSHA-256 MATCHを記録。
5. 既存PWA: 本人報告で削除せず起動できた。
6. 既存ルール設定: 本人報告で保持。
7. CPU対局・操作: 本人報告でツモ・打牌と鳴き等が正常。
8. オフラインPWA: 本人報告で機内モード・Wi-Fi OFFからの再起動後にCPU対局可能。
9. オンライン再接続情報保持: 未検証のまま残す。

以上を既存の公開移行手順に照らし、**Phase 2：完了**と判定する。この判定はIssue #47全体の受入条件達成を意味しない。全体の残件として、更新前後のオンライン参加・再接続情報の保持、iPhone実機でのオンライン対局・再接続、iOS/Safariバージョン詳細を維持する。

Phase 3以降は未着手。[Issue #47のPhase 2完了報告](https://github.com/ak-sekine/heibon-mahjong/issues/47#issuecomment-6855362022)を追記した。Issue #47はOpen。Phase 3の初期登録、旧workflow停止、公開フラグ変更、新workflow publishは今回行っていない。

## 2026-11-13 Chromium PWA CI recovery

### 原因と修正

対象だった[失敗run 43440434724](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43440434724)はdevelop SHA `e026828a2de6f4a9b594cd8e9f3e47e6e9c704c3`で、Chromiumの`tests/browser-pwa.py:273`が`-v2-retry` cacheを見つけられず失敗した。ログのcache一覧は旧cacheと`-v2`で、期待した`-v2-retry`はなかった。

コード調査で、`registration.update()`の完了後に行う`!registration.installing && !registration.waiting`確認は、どのinstall eventが終了したかを示さず、別のupdate checkが進行・待機していないことも保証しないと分かった。テストは失敗対象assetへの503を確認していたが、最初の`-v2` installが`redundant`になるまでのstate transitionを記録せず、復旧後に実際に配信されたworker scriptが`-v2-retry`であることも確認していなかった。そのため、test serverの失敗経路を戻しscriptを書き換えた後、まだ重なっていたupdate checkが古い`-v2`をinstallしても、テストはretryと区別できなかった。これはテスト同期と観測不足であり、`src/pwa/register.ts`のユーザー承認・複数タブ制御や`build-pwa.mjs`のinstall/activate処理の不具合を示す結果ではない。

失敗runはworker state transitionと配信script bodyを記録していなかったため、個別のChromiumがどのupdate requestから`-v2`をinstallしたか、retry script取得前にassertionへ到達したかまでは過去ログだけでは区別できない。確定した原因はテストが失敗installの終了とretryのscript/cache対応を保証していなかったことであり、上記の古いworkerが重なった経路はその競合で可能な説明として扱う。

`tests/browser-pwa.py`のみを変更した。最初の更新で`updatefound`とworker state changeを追跡し、失敗workerが`redundant`になりregistrationがinstalling/waitingなしへ落ち着いてから配信経路を戻す。HTTP handlerは応答したworker scriptのcache名とSHA-256を記録する。再試行では実際に`-v2-retry` scriptが配信されたこと、`installed` workerが`waiting`に残ること、その名前のCache Storage entryがあることを確認する。旧cache保持、CPU対局継続、ユーザー承認前にreloadしないこと、複数タブ制御、オフラインCPU起動の既存assertは維持した。cache名assert、skip、固定sleepは追加・緩和していない。アプリ実装は変更していない。

BrokenPipeは元runでHTTP handlerがレスポンスを書いている最中に接続が閉じた記録である。修正後のChromium PWAテストでも`do_GET`から`BrokenPipeError`が記録されたが、同じPWAケースはsuccessした。HTTP writeの副次エラーであり、cache assertionの原因ではないことを確認した。どのbrowser-side actionがその個別接続を閉じたかまではログにない。

### 修正後検証

| 検証 | 結果 |
|---|---|
| [develop CI run 43523795023](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43523795023)、SHA `f2952c7eaeac189a249fa5e8e9523eccbe4f30e2` | verify、local-online、Chromium/WebKit環境分離、Chromium/WebKit Browser UI、matrix auditがすべてsuccess。worker-development、worker-production、online、publishはすべてskip。 |
| Chromium `tests/browser-pwa.py` | success、5.825秒。precache失敗後の旧PWA/cache保持、`-v2-retry`再取得とwaiting cache、更新通知、複数タブ制御、承認後更新、オフラインCPUを含むPWA suiteが通過。CPU対局は承認前にreloadしなかった。 |
| WebKit `tests/browser-pwa.py` | success、5.899秒。同じPWA受入項目が通過。 |
| local `npm test` | 91/91 success。 |
| local型検査 | `npm run typecheck`、`npm run typecheck:worker` success。 |
| local build | production Pages、development Pages、itch.io build/ZIPがsuccess。Pages用Worker URLは`.validation.workers.dev`の検証fixture、itchは`https://online-mock.invalid`。公開先ではない。 |
| `git diff --check` / Python compile | success。 |

独立した2回目の全体runは、検証記録を含む次のdevelop commitで確認する。Phase 2完了判定を維持し、Issue #47はOpen。Phase 3の初期登録は未開始。production Pages、Worker、Durable Objects、`pages-verified`、`DUAL_PAGES_ENABLED`はいずれも今回変更していない。main `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`、pages-verified `232205c5efc7f86df8d70432a62224e82b4fb0ed`。
