# 本番・開発運用（Issue #47）

本番・開発の分離公開と既存7件の受入結果を確認済み。公開SHA、main反映状況、B7の未確認項目は検証記録を参照する。公開移行の経緯はPhase別手順と移行前チェックに残す。[検証記録](../verification/issue-47-environments.md#2026-11-21-main反映の照合) / [Phase別手順](issue-47-cutover.md) / [移行前チェック](../verification/issue-47-preflight-2026-11-12.md) / [設計](../development/issue-47-environments.md)

| 項目 | 本番 | 開発 |
|---|---|---|
| branch | main | 承認済みの `issue/<番号>-<説明>` |
| URL | https://ak-sekine.github.io/heibon-mahjong/ | https://ak-sekine.github.io/heibon-mahjong/dev/ |
| Cloudflareアカウント | 本番・開発で同一 | 本番と同一 |
| Worker名 | heibon-mahjong-online | heibon-mahjong-online-dev |
| API URL | PRODUCTION_WORKER_URLに実URLを登録 | DEVELOPMENT_WORKER_URLに実URLを登録 |
| config | wrangler.jsonc | wrangler.development.jsonc |
| GitHub Environment | worker-production | worker-development |

開発URLは一般公開URLであり、認証付きの非公開環境ではない。別Workerは障害・状態の分離であってアクセス制限ではない。同一Origin上のJSは原理的には他方のStorage/APIへアクセスできる。キー・キャッシュ分離は偶発的な混在を防ぐためのもので、信頼できないコードを実行するセキュリティ境界ではない。

## 外部設定（未設定を成功扱いしない）

1. 本番・開発で同一のCloudflareアカウントを使用し、workers.devを初期化。WorkersとSQLite DOを有効化する。Worker名は本番`heibon-mahjong-online`、開発`heibon-mahjong-online-dev`を維持する。
2. GitHub Environment `worker-production`をmain限定にし、secret `CLOUDFLARE_PRODUCTION_API_TOKEN`を登録する。旧公開経路のrepository secretは維持する。削除は今回の切替作業に含めず、別途ユーザーの明示的許可を得る。
3. `worker-development`はブランチパターン `issue/*` だけを許可する。同じCloudflareアカウント用のtokenをEnvironment secret `CLOUDFLARE_DEVELOPMENT_API_TOKEN`へ登録する。Secretsの登録先・名前は本番と区別する。tokenをチャットやリポジトリへ貼らない。DO migrationsは各Workerに適用され、ROOMS / RATE_LIMITERは各Worker自身のクラスへbindする。外部Workerのscript_nameやnamespace IDを指定しないため、クラス名・migration tagが同じでも状態は共有されない。
4. repository variable `CLOUDFLARE_ACCOUNT_ID`に共通アカウントIDを登録する。新経路の両Worker jobはこの変数を参照する。旧`CLOUDFLARE_PRODUCTION_ACCOUNT_ID` / `CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID`は新経路では不要。旧deploy.ymlの同名repository **secret** `CLOUDFLARE_ACCOUNT_ID`は旧公開経路用であり、variable登録とは別に既存値を維持する。`PRODUCTION_WORKER_URL` / `DEVELOPMENT_WORKER_URL`には同アカウントの各Workerの実workers.dev URLを登録する。URLはCloudflare出力で確認し、検証fixtureを登録しない。
5. `github-pages` Environmentは `main` と `issue/*` を許可する。Pages Actions設定も公開前に確認する。新publisherのGITHUB_TOKENにはcontents:write、pages:write、id-token:writeが必要。保存ブランチ`pages-verified`は2026-11-11に`232205c5efc7f86df8d70432a62224e82b4fb0ed`で初期化済み。`state.json`は`{"version":1,"current":{},"pending":null}`で、公開snapshotは未登録。再作成せず、まず現状を取得・検証する。別リポジトリで初期化する場合も取得失敗を空状態と判断せず、明示的に初期台帳を作る。main/developのソースファイルを混ぜず、Git履歴を保持する。削除・force pushを禁止する。
6. #47の初回切替では旧公開を進行中のまま切り替えない。旧production-deployを完了させ、本番SW移行版の公開・既存PWA更新を検証してから新経路を有効化する。移行中にdevelopを公開しない。
7. #47の初期登録は[切替手順Phase 2〜5](issue-47-cutover.md)：旧経路で本番PWAを先行移行・実機確認し、その実公開artifactを再ビルドせず保存branchへ登録する。旧run終了・旧workflow Disable後にフラグを有効化し、最初の新経路公開をdevelopで行う。登録済みと同じmain SHAの再publishは拒否される。空の本番をdevで上書きすることはできない。フラグだけでは現在mainの旧workflowや開始済みrunを停止できない。

Issue #64は既存のCloudflare構成を維持する。Workers編集tokenは同一アカウント内の他Workerへ権限を持つ場合があり、別EnvironmentをCloudflare権限の隔離とみなさない。

2026-11-23に3つのEnvironmentの現行許可をAPIで確認した。許可ルールIDと確認範囲は[Issue #64検証記録](../verification/issue64-github-flow-migration.md)を参照。初期設定の経緯は[2026-11-12移行前記録](../verification/issue-47-preflight-2026-11-12.md)に保存している。

## 旧開発Workerの初回作成

[Issue #47の初回作成・検査手順](bootstrap-development-worker.md)は履歴として保持する。旧bootstrapとinspectはdevelopが `worker-development` に許可されていないため利用できない。

## Issueブランチ、開発公開、main統合

1. 最新mainから `issue/<番号>-<説明>` を作成し、実装・テスト・commit・通常pushする。緊急修正も最新main起点の短命ブランチで検証する。承認済みの候補と同じ完全SHAに対するEnvironments push CIを確認する。
2. 開発公開が必要なら、候補のref・完全SHA・公開許可・外部設定を確認し、当該Issueブランチの `Verify isolated environments` を `publish=true` で手動起動する。実行中も候補ブランチとmainの先端を照合する。候補が動いた場合は新SHAでCI・承認・手動起動からやり直す。
3. 開発候補は1つを共有する。開発公開もサイト全体の再デプロイを伴う。開発成果物とWorkerだけを更新し、本番ファイル、snapshot/hash、WorkerのGitHub deployment記録を公開前後に照合する。Cloudflareの実稼働版は外部承認時の確認対象とする。公開後に通常の読み取り専用Pages監査を実行する。
4. ユーザーが許可した範囲を確認し、最新mainと候補の先端・SHA・差分・検証結果を再照合し、候補SHAへのfast-forwardのみでmainへ通常pushする。分岐した場合は最新mainから候補を再作成する。未完成の機能は候補に保持する。
5. 統合後は最新mainと統合したSHAの一致、同じSHAの必須CI・最終auditの成功を確認する。既存の公開ゲートを満たす場合、Codexは追加のユーザー承認を求めず、main pushとは別に本番公開を手動起動する。手順は[本番公開時の検証結果再利用](#本番公開時の検証結果再利用issue-62)に従う。
6. Worker、本番オンライン検証、Pages、台帳確定、独立した公開後auditを順に確認し、公開結果とSHAを報告する。

ユーザーのmain統合許可には、同じ作業範囲の通常の本番公開許可が含まれる。統合後に確定したSHAについて追加承認は不要。無関係な変更や別Issueの未承認変更に許可を広げず、明示的な公開保留を優先する。GitHub EnvironmentのRequired reviewersなどのシステム承認、Secrets、権限制限は維持する。

本番アプリに影響しない文書のみの変更、明示的な公開保留、必須CI・品質ゲート・システム承認の未達、公開競合や未解決 `pending`、公開状態の不明、外部サービス障害などで安全に公開できない場合は、省略・延期の理由、main SHA、確認できた公開済みSHA、残作業を報告する。

不可逆なデータ移行やデータ破壊、本番データの削除・復旧、品質ゲート・承認ゲートの緩和、本番基盤・権限の重大な変更、通常経路を迂回する緊急公開・ロールバック、許可範囲の拡大は個別の明示承認が必要。該当するか不明なら事前に影響を調査し、安全性を判断できなければ停止する。

Issueブランチの開発公開には別の許可が必要で、従来のdevelop継続許可やmain統合許可は適用しない。初回は `worker-development` と `github-pages` の許可ref、既存の本番Environment保護設定、Secretsの適用範囲、Cloudflareトークン・Worker/DO設定及び現在の本番Worker versionを確認する。設定変更・追加承認が必要なら公開前に停止する。共有Pagesへの権限はサイト全体に及ぶため、workflowを含む候補差分をレビューする。

開発候補の公開元は、台帳のsource SHA、完全ref、公開workflow ref/SHA、run/attemptと `verified/development/<SHA>` タグで追跡する。短命ブランチを削除する前に、候補が配信対象から外れ、台帳と監査結果および参照が維持され、未push変更と未解決pendingがないことを確認する。不採用候補は承認を失効させ、配信中なら承認済み後継候補で置換する。

旧developのWorkerとPages公開許可は削除済み。手動公開の入口が残っていても `worker-credentials` がEnvironmentで拒否され、台帳予約前に止まる。developの通常CIと読み取り専用監査の起動条件は維持する。現在の配信来歴はmain側の [通常Phase 6-A](../../.github/workflows/issue47-phase6a-live-audit.yml) で監査する。developは履歴保持のため存続し、削除には別途明示承認が必要。旧経路の再開が必要なら、新たな承認を得て進行中の公開、台帳、実配信、Workerと復旧手順を再照合する。

## 成果物とSHA

ブラウザ検証したdistを再ビルドせず公開する。artifact内のWorker URLは実デプロイ・オンライン検証を通ったjob outputと一致を要求し、実行中の設定変更でも接続先がずれた候補は公開しない。`release.json`はsource SHA、Worker URL、各ファイルSHA256を持つ。Pagesの`environments.json`が両公開版のSHAとdigestを記録する。ビルド情報にもgit SHAが入る。
Actions artifactは90日。期限切れ/取得失敗時は停止し、ソースから勝手に再作成しない。新しい全検証runを実行する。公開snapshotは`pages-verified`のGit履歴に無期限保存する。履歴を削除・GCで切り捨てない。

通常の統合公開は本番・開発共通の `pages-publication` で、台帳の予約からWorker・オンライン検証・Pages・台帳の確定まで直列化する。GitHub concurrencyはpending runの全件FIFOを保証しない。キャンセル後は台帳と公開状態を確認し、未解決の予約がなければ最新branchで全ゲートを実行する。片方の更新では保持側の保存bytesを使用する。

台帳取得失敗、破損、未解決 `pending`、対象環境の公開済みSHA、古い候補はWorker前に拒否する。予約は `pages-verified` への通常pushで保存し、競合でpushが拒否されたrunはWorkerへ進まない。Worker実行直前まで対象branchの最新SHAとの一致を要求する。本番Worker成功後のオンライン検証・Pages公開は予約時のSHAで続行し、最新mainが進んでも候補を差し替えない。予約commit・run・attempt、候補のWorker URL、snapshotのdigest、保存branch先端は引き続き照合する。開発公開では対象branchとIssue候補のbase mainの照合を維持する。旧公開・初回bootstrap・手動デプロイとこの通常公開を並行運用しない。

再利用WorkflowへWorker用Secretを名前付きで渡す。公開対象と同じEnvironmentでSecretが空なら、台帳予約前に停止する。この確認ではdeploymentを作成せず、Secretの値を出力しない。認証と権限の有効性はWorkerデプロイ時に確認する。

## 障害と復旧・ロールバック

品質ゲートや予約pushの失敗後は、まずリモート台帳を読む。予約後の中断は `pending` が残り得る。Workerのdeploy step、Pagesのdeploy step、台帳確定stepと確定commit、独立auditを個別に確認する。ジョブのFailure・Skipped・キャンセルだけで配信状況を決めず、結果不明の操作は再実行前に照合する。

公開経路だけが停止し実配信が正常なら、稼働中の版を維持する。ゲーム起動やオンライン対局に利用者影響がある場合は、影響する配信先を絞り、互換性が確認できる復旧を優先する。WorkerコードとGitHub管理設定の正本はGitHubの検証済みソースとする。検証済み正常版への緊急復旧では、最新main一致、全UI再実行、Cloudflareの全操作履歴・稼働version IDの独立照合を一律には要求しない。対象の特定・互換性・安全判断に必要な証拠は取得する。取得できない事項は未確認と記録する。DO永続データ、Secrets、GitHub管理外設定はコード再デプロイから独立して扱う。

| 状態 | 判断・必要な証拠と実行手順 |
|---|---|
| Worker・Pagesとも未公開 | **Abort。** 元run/jobと対象deployment、親snapshotと実配信から未公開を確認。予約を親にする新規コミットで、予約前の `state.json` と `site/` をセットで復元し通常pushする。実配信は維持する |
| Workerのみ公開 | 旧Pagesのbytesと更新後Workerを確認。旧WorkerとDOの保存形式・migrationが互換ならRollbackを検討。候補Workerが健全で予約Pagesと互換なら、検証済み予約サイトをPagesへ出すロールフォワードを検討 |
| Pagesのみ公開 | 配信中の共有Pagesのhash、旧Worker、保持側snapshotを確認。互換性に応じて旧共有サイトを戻すか、対応する検証済みWorkerを公開してロールフォワード |
| 両方公開・台帳未確定 | **Finalize。** 予約所有者、同じ候補のWorker/Pages deployment、実配信hashとWorkerの健全性が整合する場合、`node scripts/environments/artifacts.mjs finalize <store>` で台帳だけを確定し通常pushする |
| 台帳確定済み・audit失敗 | 確定commit、deployment、Worker health、配信hashを読み取り専用で再確認する。audit失敗だけを理由に再公開しない |
| 外部状態不明・証拠矛盾 | 予定する操作の影響範囲に限って調査する。未公開・互換・安全を判定できない操作は停止し、独立して安全と判断できる復旧選択肢を検討 |
| 競合あり | 進行・待機run、外部管理操作、台帳先端を確認する。競合解消までは影響する書込を停止し、解消後に証拠を取得し直す |
| DO形式・migration非互換 | 機械的なRollbackを禁止。互換版へのロールフォワードやデータ保持を前提とする復旧を別途検討する |

1. **書込前。** 対象環境、固定SHA、run/attempt、予約と親、成果物hash、配信と互換性を特定する。本番予約の親・候補照合には [`inspectRecoverySnapshots` と `verifyRecoveryPublicSite`](../../scripts/environments/pages-recovery.mjs) を利用できる。通常rollbackは安全な旧ソースへのrevertを全ゲートに通す。通常経路外の緊急公開・ロールバック、手動台帳復旧、本番データ操作にはそれぞれ個別の明示承認が必要。配信変更には対象Environmentの保護と必要な承認を適用する。
2. **書込直前。** 公開予約の解消と配信変更を別操作として扱い、各操作の対象・先端・排他を再確認する。競合、不一致、必要な証拠や承認の不足で停止。台帳更新は履歴を残すfast-forwardとし、拒否されたら調べ直す。DO migrationsの逆実行、本番DOの削除、旧workflowの再実行による鮮度検査の迂回は行わない。
3. **書込後。** Worker healthと対象側オンライン、両環境のPagesメタデータ・hash、保存snapshotと台帳の整合を確認する。Rollback後は実配信が旧保存版と整合してから台帳を復元し、ロールフォワード後は配信を確認してから確定する。最終状態、audit結果、未確認のDO・Secrets・外部設定を記録する。不一致なら追加書込を止める。

本番bootstrap未完なら開発公開を止め、既存Pagesを維持する。切替後は旧workflowの再開で `/dev/` を失い得るため、`DUAL_PAGES_ENABLED` を単純に `false` に戻さず、両版snapshotを保持する。

## PWA・保存状態とiPhone Safari実機確認

ブラウザは最長一致のService Worker scopeを優先する。開発SWがまだない初回訪問や有効化前は本番の親controllerが付く場合があるため、開発専用controller取得後にオフライン準備完了を確認する。

本番キーは旧値を維持しコピー/削除しない。devは専用キー。manifest id/start_url/scope、script URL、precache、cache名を分離する。本番SWはdev fetchと更新時のclient数判定からdevを除く。本番SWはclients.claimを使わず、初回訪問は有効化後に再読み込みしてからオフラインを確認する。開発SWは旧本番SWが一時的にclaimした場合に開発scopeを再claimする。未更新の本番SWによる親制御を完全に排除できると仮定しない。

PWA更新は対局の区切りで行う。同環境の複数タブは更新をブロックし、他環境タブではブロックしない。全サイトデータ削除を通常の更新手順にしない。本番データを失うため、問題時も環境別キー/cache/registrationだけを確認する。

ユーザーが次を両環境で確認し、日付・iOS/Safari版・起動方法・OK/NGを記録する。manifestだけでホーム画面追加が完全に分離されるとは扱わない。

1. 既存本番PWAを残した状態で更新し、旧ルールと再接続情報が保持されること。
2. Safariで両URLを開き、CPU対局・打牌と各アイコン/表示を確認。
3. 各URLからホーム画面へ追加し、別アイコンとして起動でき、それぞれのURLに留まること。
4. 両版を一度オンラインで起動→完全終了→機内モードでホーム画面から起動しCPU対局。新規インストール直後の本番は再読み込み後にも確認する。
5. 開発のみ更新/本番のみ更新し、反対側の更新通知・cache・オフライン起動・保存設定が変わらないこと。旧本番SWが残る状態からの移行も確認する。
6. 同環境2タブで更新ブロック、反対環境タブだけなら更新可能なこと。
7. 新規テストルームのみ使用し、各Workerで作成→参加→対局→再接続。他環境のtokenで復帰できないこと、作成したルームが反対環境に現れないこと。6文字コードが偶然一致してもWorkerごとに独立した別ルームであり、コードだけでは環境を識別できない。公開済みの他人のルームを変更しない。

未確認が残る間はIssue #47をCloseしない。

## 本番公開時の検証結果再利用（Issue #62）

**Issueブランチからの本番公開は禁止。** Codexは最新のmain refから `Verify isolated environments` を `workflow_dispatch` で起動し、`publish=true` を指定する。公開には `DUAL_PAGES_ENABLED=true` が必要。`production_validation=reuse`（既定）は、同じ SHA の一意な main push run の attempt 1、全必須ジョブ、最終 audit、その audit に記録された Pages artifact ID・ZIP digest を照合する。同じ ZIP を ID 指定で取得し、ZIP と展開後の各ファイルを別々に検証する。公開 run と検証元の識別情報は公開台帳で区別する。

docs-only、再実行済みの CI、欠損や期限切れなどで再利用できない場合は公開を停止する。公開が必要で上記の許可範囲内にあり、既存のCI・公開ゲート・システム承認の条件を満たす場合は、新規 dispatch で明示的に `production_validation=full` を選ぶ。この経路は従来通り検証から成果物を作る。`publish=false` は全検証を実行する。未解決の予約や古い SHA は全検証経路でも公開できない。

本番の Worker・オンライン検証・Pages・台帳確定が成功した後に別ジョブで固定した公開SHA、配信バイト列、確定台帳とその先端、GitHub deployment記録、公開Workerのヘルスを照合する。main先端は参考情報として報告し、公開SHAと異なる場合や取得不能でも配信の整合性判定には影響しない。監査失敗時は公開操作がすでに完了している場合があるため、再実行前に台帳・deployment・配信状態を確認する。Worker のヘルスと GitHub deployment は Cloudflare token の実効権限や稼働バージョン ID を証明しない。

変更前後の比較は同一 SHA の main push と公開成功 dispatch を1組とし、run 数、skip を除いたジョブ数、run の開始から完了まで、各実行ジョブの時間合計、push run 作成から Pages の公開完了までを別々に記録する。公開後監査は独立して集計し、公開判定・承認待ちを可能な範囲で分ける。Issue ブランチでは fixture と CI の確認を行い、本番の公開結果・所要時間は main 統合後の通常公開で測定する。
