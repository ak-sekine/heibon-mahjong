# 新規対局開始時のランダム座席 — Issue #5

実施日: 2026-10-29
実機確認報告: 2026-10-29、ユーザーのiPhone Safari確認ではオフライン・オンラインとも席がランダムになっていました。一方、オンライン待機画面には東・南・西・北が表示され、対局開始時の再抽選後の実席と一致しない不整合が報告されました。これは実機で確認された既存不具合の報告であり、今回の修正後の実機確認結果ではありません。

採用方針: オフラインは新規対局開始時に一度抽選します。オンラインは独立した既存操作「座席を確定」のタイミングで一度抽選し、対局開始時には再抽選しません。対局中は席を固定します。

## 実装範囲

- 4人をFisher–Yates法でシャッフルします。既存の席番号0〜3と東・南・西・北、席番号0の起家の対応は保っています。
- オフラインでは自分とCPU3人を抽選し、自分の席を画面下側に回転します。席風、親、手番、河、副露、点数、結果、操作状態を抽選後のプレイヤーIDから描画します。
- オンラインではホストの「座席を確定」操作でWorkerが抽選し、待機室の参加席と対局席の対応を永続化します。確定前は風を表示せず、参加者・CPUの一覧を表示します。確定後は保存された対局席順で東・南・西・北を表示します。ホスト、認証、再接続には参加者IDを使い、対局状態と表示には対局席を使います。
- 同じ開始要求の再送は既存処理の冪等性で同じ結果を返し、別IDの開始要求は開始済みとして拒否します。次局、再接続、ホスト交代、CPU引き継ぎでは座席対応を変えません。
- 各クライアントには既存どおり自分の手牌だけを返し、他人の手牌・山・CPU判断情報を席対応へ含めません。

## 2026-10-29 実機確認報告を受けた修正

実機確認報告ではオフライン・オンラインのランダム座席は確認されました。別の不整合として、オンライン待機画面に固定の東・南・西・北を表示していた一方、`start-game`時に再抽選していたため、開始後の実席と待機画面の表示が一致しませんでした。

状態遷移調査では、全員の準備完了後にホストが実行する独立操作`finalize-seats`が存在しました。この既存操作でCPU補充と一緒に抽選し、参加者IDごとのゲーム席を保存する修正を行いました。`start-game`は保存済み対応を使います。重複確定、重複開始、再接続、ホスト交代、退出CPU化、次局進行で対応を変えません。

今回の修正後、iPhone Safariでは未確認です。実機で再確認する項目は、確定前に風が表示されないこと、確定後表示とゲーム開始後の席が一致すること、再接続・ホスト交代・CPU引き継ぎ・次局後も席が維持されることです。Issue #5は実機再確認が完了するまでOpenのままにします。

## 修正コミットの自動検証

| 確認 | 結果 |
| --- | --- |
| `npm test` | 成功。66件成功、失敗0、スキップ0。Worker統合テストで1〜4人構成、重複のない4席、開始時の席対応、重複確定・開始、再接続、CPU引き継ぎを確認。 |
| `npm run typecheck:worker` | 成功。 |
| `npm run build` | 成功。TypeScriptチェックとVite本番ビルドが完了。 |
| Browser UI回帰 | run `40813350867` 成功。Chromium／WebKitの47実行がすべて成功し、オンライン待機画面テストも両ブラウザーで成功。 |
| `git diff --check` | 成功。 |

## GitHub Actions・本番デプロイ

アプリ修正コミット: `c127ca3d949b35834aba72d00f938f25314a7f37` (`fix: finalize online seats before game start`)

| 工程 | 結果 |
| --- | --- |
| verify・docs-check | Deploy run `40813350867` 成功。単体・統合テスト、Worker型チェック、Pagesビルド、docs-checkが成功。 |
| Browser UI | 同runで47実行成功。Chromium／WebKitのオンライン待機画面回帰も成功。 |
| Cloudflare Worker | 同runの`deploy-worker`成功。`https://heibon-mahjong-online.ak-sekine.workers.dev`へデプロイ。 |
| デプロイ直後の本番通信テスト | 同runの`production-test`成功。2人対局と席表示一致、再接続、ホスト交代、CPU引き継ぎ、1〜4人構成、非公開情報保護の5シナリオを確認。秘密値はログに出ていません。 |
| GitHub Pages | 同runのPages build・deploy成功。公開URLは[Heibon Mahjong](https://ak-sekine.github.io/heibon-mahjong/)です。Pages deploymentの`pages_build_version`はアプリ修正コミットSHAと一致します。 |

最初のpushで別workflow `Production Worker diagnostics` run `40813350790` がDeployと並行起動し、Workerデプロイ前の旧本番Workerに新しい`gameSeat`応答を要求して失敗しました。Deploy run `40813350867`自体はBrowser UI通過後にWorkerをデプロイし、その後のproduction-testとPages deployまで成功しています。この並行実行を避けるためworkflow修正コミット `c27856e157c601ced0a400f177bb6fdcdc26a450` で、独立Production diagnosticsをDeploy成功後に起動する`workflow_run`へ変更しました。修正後の診断run `40815205407` はデプロイ後に5シナリオすべて成功しました。

workflow修正コミットの追加CI run `40813562264` はverifyとBrowser UI（Chromium／WebKit合計47実行）が成功しました。`.github/workflows`のみの変更なのでWorker・Pagesの再デプロイはありません。検証記録コミット `ffee21eb6d7fbc60723eb02307b87a5b183b21f1` のrun `40815692031` も成功し、docs-checkが通過しました。Markdownのみの変更のため、verify・Browser UI・デプロイ工程は分類どおりskipです。追加の本番診断run `40817015050` と `40817066032` は、デプロイ済みWorkerに対する5シナリオをそれぞれ成功しました。

## ローカル自動検証

| 確認 | 結果 |
| --- | --- |
| `npm test` | 成功。66件成功、失敗0、スキップ0。 |
| `npm run build` | 成功。TypeScriptチェックとVite本番ビルドが完了。 |
| `npm run typecheck:worker` | 成功。Cloudflare Workerの型チェックが完了。 |
| Fisher–Yates座席テスト | 7件成功。全24順列、固定乱数の再現性、統計分布、起家確率、乱数値、対局間のみの再抽選とオフラインの4座席を確認。 |
| オンラインゲームテスト | 20件成功。人間1〜4人、全24順列、ホスト、次局、再接続、CPU引き継ぎ、席名、非公開情報を確認。 |
| Workerの待機室・対局統合テスト | 22件成功。開始要求の再送、別開始要求の拒否、席ごとの再接続、退出、CPU交代を含む。座席抽選を含むため5回連続でも実行し、すべて成功。 |

全体回帰の初回実行では、オンライン退出テストが「残った参加者はCPU進行中」と仮定して失敗しました。抽選後に残った人間本人の手番になる場合もあるため、テストを現在の`viewerSeat`に対する合法な打牌で進める形に修正しました。修正後のWorker統合テストは5回連続で成功し、最終的な`npm test`も全件成功しました。

## GitHub Actionsとデプロイ

Issue #15のCI構成どおり、Browser UI workflowはDeployから1回だけ呼び出します。

| 工程 | 結果 |
| --- | --- |
| 回帰テスト・Worker型チェック・Pagesビルド | run `40806362450` の`verify`成功。ローカル`npm test`は66件成功、失敗0、スキップ0 |
| Browser UI | run `40806362450` 成功。47スクリプト成功。全24座席順列の320px検査はChromium／WebKit双方で成功 |
| Cloudflare Workerデプロイ | run `40806362450` 成功。`https://heibon-mahjong-online.ak-sekine.workers.dev` |
| 本番通信テスト | run `40806362450` 成功。人間1〜4人を含む5シナリオで開始、非公開情報、再接続、ホスト移譲、CPU引き継ぎを確認 |
| GitHub Pagesビルド・デプロイ | run `40806362450` 成功。`https://ak-sekine.github.io/heibon-mahjong/` |

機能コミット初回run `40794748815` では、`verify` は成功しました。`docs-check` はこの記録のMarkdown改行用末尾スペースで失敗し、削除しました。Chromium Browser UIは既存の`browser-app-idle.py`が「対局開始直後から手牌14枚」と固定して失敗しました。CPU東家の手番中は自分が13枚のため、13枚または14枚のいずれも正しい初期表示です。

修正run `40795137715` では`docs-check`と`verify`が成功し、Chromiumの同テストも成功しましたが、WebKitでは誤った14枚待ちが標準の30秒でタイムアウトしました。待ち条件を削除して13枚／14枚を即時確認する形にしました。タイムアウト値の変更やスキップはしていません。run `40795613843` ではこの確認がChromium／WebKit両方で成功しましたが、オンライン待機室テストがCPU非公開牌ID検査で失敗しました。旧検査は席0以外をCPUとみなし、自分が別席の場合に自分の牌を誤検出していました。検査対象をCPU制御のプレイヤーへ絞りました。

run `40795975721` ではオンライン待機室・プライバシー検査が両ブラウザーで成功し、その後の`browser-riichi-discard-layout.py`が失敗しました。このレイアウト専用テストは、ランダム初期席でCPU自動手番が動く中、固定の試験河を直接描画していました。テスト用の初期抽選を東家自分に固定してCPU自動手番を発生させず、河配置を測るようにしました。

run `40796476829` では前段のBrowser UIテストが通過しましたが、`browser-action-controls.py`でRon操作が有効にならず失敗しました。このテストのCPU待機差し替えは旧コンストラクター文字列に依存し、現在のmain初期化では適用されていませんでした。seat 0を使う既存画面テスト向けに、座席抽選を固定値で再現し、CPU待機をテスト制御へ差し替える共通fixtureを追加しました。製品の抽選処理とBrowser UI検査ケースは維持しています。

run `40797640924` では、全24順列のOffline seating確認がChromium／WebKitの両方で成功し、`browser-action-controls.py`も通過しました。その後、WebKitの355px河容量テストで、CPU自動手番が測定用の固定河を上書きして失敗しました。河容量テスト用に自分が東席になる固定抽選を設定し、合成局面の測定中に自動手番が割り込まないようにしました。座席抽選のBrowser UIテストは引き続き通常の抽選源を注入し、全順列を検証します。

run `40798450867` では`docs-check`、回帰テスト・Worker型チェック・ビルドが成功しました。オンライン参加ダイアログの320px検査が失敗し、Workerデプロイ、本番通信、Pagesビルド／デプロイはスキップされました。座席待機室テストの初期席を既存fixtureと同じ東席に固定し、CPUの自動手番をテスト制御下に置き、横はみ出し寸法を失敗時に報告するようにしました。


run `40802315071` では`docs-check`、`verify`、47件のBrowser UIスクリプト、Cloudflare Workerデプロイが成功しました。Chromium／WebKitで全24順列を320px表示で確認し、オンライン結果・再接続・CPU引き継ぎのBrowser UI回帰も通過しました。本番通信テストだけが失敗し、ログには`game-started`と`game-state`が届いている一方、テストは参加者2の`viewerSeat === 1`を待っていました。待機席1のプレイヤーが抽選後に別の対局席へ割り当たる正常な状態を、テストが不正と判断していました。検証スクリプトを修正し、各接続の`viewerSeat`から対局席を特定して、開始時の手牌、手番、再接続、退出時のCPU引き継ぎを検査します。Workerデプロイ自体は成功しましたが、本番通信ゲートが未達のためPagesビルド・デプロイはスキップされました。修正後のActions結果を追記します。

修正版の本番通信テストは`Production Worker diagnostics` run `40804742762` で成功し、人間1〜4人の5構成、再接続、ホスト移譲、CPU引き継ぎを確認しました。一方、push run `40804742893` のChromium Browser UIは`browser-test-page.py`で失敗しました。九種九牌の固定seat3局面で、検証ページの初期ランダム抽選がCPU表示名だけを入れ替え、期待`CPU3`に対して`CPU2`を表示していました。アプリの通常対局の抽選は維持し、テスト局面を作る検証ページだけ固定seat抽選fixtureを使うよう修正しました。このrunの`verify`は成功しましたが、Browser UIゲートの失敗でWorkerデプロイ・Deploy workflow内本番通信・Pages工程はスキップされました。

最終run `40806362450` は`detect-changes`、`docs-check`、`verify`、47件すべてのBrowser UI、Cloudflare Workerデプロイ、本番通信テスト、Pagesビルド・デプロイが成功しました。全24座席順列の320px検査と検証ページのCPU席シナリオはChromium／WebKit双方で通過しました。本番通信テストでは人間1〜4人の構成、非公開手牌の保護、再接続、ホスト移譲、退出者席のCPU引き継ぎを確認し、トークンやWebSocket ticketはログに出ていません。Workerは`https://heibon-mahjong-online.ak-sekine.workers.dev`へ公開され、Pagesは`https://ak-sekine.github.io/heibon-mahjong/`へデプロイされました。Browser UI workflow内の`detect-changes`と`docs-check`が`skipped`なのは、親Deploy workflowから検証済みbuildを再利用して単体テスト・ビルドを重複させない既存CI構成によるものです。最終runではBrowser UI本体とデプロイ工程はスキップされていません。

## iPhone Safari実機確認

iPhone Safari実機では未確認です。抽選結果による4席すべての自分席表示、席風と親表示、ツモ・打牌・鳴き・リーチ・和了・流局後の結果表示を確認する必要があります。自動テスト、Chromium／WebKit、実機確認を区別します。Issue #5はこの実機確認が残る間はOpenのままにします。
