# 本番・開発運用（Issue #47）

現状は段階導入。実装追加と公開完了を混同しない。公開移行は[確定したPhase別手順](issue-47-cutover.md)に従う。今回の[移行前チェック](../verification/issue-47-preflight-2026-11-12.md)で確認済み・未確認を区別する。[設計](../development/issue-47-environments.md) / [検証・未確認一覧](../verification/issue-47-environments.md)。

| 項目 | 本番 | 開発 |
|---|---|---|
| branch | main | develop |
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
3. `worker-development`はdevelop限定にし、同じCloudflareアカウント用のtokenをEnvironment secret `CLOUDFLARE_DEVELOPMENT_API_TOKEN`へ登録する。Secretsの登録先・名前は本番と区別する。tokenをチャットやリポジトリへ貼らない。DO migrationsは各Workerに適用され、ROOMS / RATE_LIMITERは各Worker自身のクラスへbindする。外部Workerのscript_nameやnamespace IDを指定しないため、クラス名・migration tagが同じでも状態は共有されない。
4. repository variable `CLOUDFLARE_ACCOUNT_ID`に共通アカウントIDを登録する。新経路の両Worker jobはこの変数を参照する。旧`CLOUDFLARE_PRODUCTION_ACCOUNT_ID` / `CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID`は新経路では不要。旧deploy.ymlの同名repository **secret** `CLOUDFLARE_ACCOUNT_ID`は旧公開経路用であり、variable登録とは別に既存値を維持する。`PRODUCTION_WORKER_URL` / `DEVELOPMENT_WORKER_URL`には同アカウントの各Workerの実workers.dev URLを登録する。URLはCloudflare出力で確認し、検証fixtureを登録しない。
5. `github-pages` Environmentの許可branchとPages Actions設定を確認。新publisherのGITHUB_TOKENにはcontents:write、pages:write、id-token:writeが必要。保存ブランチ`pages-verified`は2026-11-11に`232205c5efc7f86df8d70432a62224e82b4fb0ed`で初期化済み。`state.json`は`{"version":1,"current":{},"pending":null}`で、公開snapshotは未登録。再作成せず、まず現状を取得・検証する。別リポジトリで初期化する場合も取得失敗を空状態と判断せず、明示的に初期台帳を作る。main/developのソースファイルを混ぜず、Git履歴を保持する。削除・force pushを禁止する。
6. 旧公開を進行中のまま切り替えない。旧production-deployを完了させ、本番SW移行版の公開・既存PWA更新を検証してから新経路を有効化する。移行中にdevelopを公開しない。
7. 今回採用する初期登録は[切替手順Phase 2〜5](issue-47-cutover.md)：旧経路で本番PWAを先行移行・実機確認し、その実公開artifactを再ビルドせず保存branchへ登録する。旧run終了・旧workflow Disable後にフラグを有効化し、最初の新経路公開をdevelopで行う。登録済みと同じmain SHAの再publishは拒否される。空の本番をdevで上書きすることはできない。フラグだけでは現在mainの旧workflowや開始済みrunを停止できない。

今回の変更はアカウント共有方式への切替に限定し、誤設定リスクへの追加対策や権限分離の強化は行わない。Workers編集tokenは同一アカウント内の他Workerへ権限を持つ場合があり、別EnvironmentをCloudflare権限の隔離とみなさない。

外部設定の最新確認範囲は[2026-11-12移行前記録](../verification/issue-47-preflight-2026-11-12.md)を参照。Variables/Secrets一覧APIは403。Pagesとbranch制限は確認済み。Actions入力の両URLには末尾slashがあり、新公開前にユーザーが修正する。設定完了後も公開前のチェックは省略しない。

## 開発Workerの初回作成

main未変更・開発URL未登録での作成は[専用手順](bootstrap-development-worker.md)を使用する。
通常公開経路とは独立し、ユーザーの明示的な許可後に専用メッセージ付きdevelop pushで実行する。

## 通常開発と昇格

- 通常はdevelopで実装し、テスト・型検査・両ビルド・itch・Chromium/WebKitとmatrix auditを通す。Codexがcommit/push。通常PRなし。force pushしない。
- developの開発WorkerとPagesの通常公開・再デプロイは継続許可されており、品質ゲートと公開前確認の成功後、Codexは個別承認を求めず実行できる。技術上は既存の`Verify isolated environments`をdevelopで手動dispatchし、`publish=true`を指定する。publish入力、branch制限、`DUAL_PAGES_ENABLED=true`、必須CI、開発Worker online検証、本番snapshot/hash照合、`pending=null`確認を維持する。
- developへのpushは検証のみで、push時自動公開へ変更しない。失敗時はrun・Worker・Pages・保存台帳を照合して原因と公開状態を確定し、修正後に全ゲートを通す。状態確定後の安全な通常公開は個別承認なしで再実行できるが、結果不明の状態でdispatch/rerunを重ねない。
- mainへは確認済みdevelopの内容だけをfast-forwardで昇格する。main独自の更新や競合があれば差分を精査する。未検証内容を一括mergeしない。mainで全ゲートを再実行してから本番公開を手動実行する。
- 公開前に元SHAがbranch先端、対応Environment・アカウント・URL、CI両エンジン成功、未解決pendingなし、保持版SHA/hash、itch成果物が独立していることを確認する。
- 移行後のpush自動公開化は、外部障害試験・実機確認後の別判断とする。現在の手動ゲートを推測で外さない。

この継続許可はdevelopの通常Worker・Pages公開だけに適用する。本番公開、Cloudflare/GitHub設定やSecrets変更、初回Worker作成、DOの削除・逆migration、保存snapshotや履歴を破壊する操作、公開結果不明時の復旧公開には適用しない。既存の停止・追加承認条件を維持する。

## 成果物とSHA

ブラウザ検証したdistを再ビルドせず公開する。artifact内のWorker URLは実デプロイ・オンライン検証を通ったjob outputと一致を要求し、実行中の設定変更でも接続先がずれた候補は公開しない。`release.json`はsource SHA、Worker URL、各ファイルSHA256を持つ。Pagesの`environments.json`が両公開版のSHAとdigestを記録する。ビルド情報にもgit SHAが入る。
Actions artifactは90日。期限切れ/取得失敗時は停止し、ソースから勝手に再作成しない。新しい全検証runを実行する。公開snapshotは`pages-verified`のGit履歴に無期限保存する。履歴を削除・GCで切り捨てない。

通常の統合公開は本番・開発共通の `pages-publication` で、台帳の予約からWorker・オンライン検証・Pages・台帳の確定まで直列化する。GitHub concurrencyはpending runの全件FIFOを保証しない。キャンセル後は台帳と公開状態を確認し、未解決の予約がなければ最新branchで全ゲートを実行する。片方の更新では保持側の保存bytesを使用する。

台帳取得失敗、破損、未解決 `pending`、対象環境の公開済みSHA、古い候補はWorker前に拒否する。予約は `pages-verified` への通常pushで保存し、競合でpushが拒否されたrunはWorkerへ進まない。Worker実行前とPages公開前に、予約commit・run・attempt、候補のWorker URL、対象branchの先端を再確認する。旧公開・初回bootstrap・手動デプロイとこの通常公開を並行運用しない。

再利用WorkflowへWorker用Secretを名前付きで渡す。公開対象と同じEnvironmentでSecretが空なら、台帳予約前に停止する。この確認ではdeploymentを作成せず、Secretの値を出力しない。認証と権限の有効性はWorkerデプロイ時に確認する。

## 障害と復旧・ロールバック

- 品質ゲート失敗時は台帳予約へ進まない。台帳の予約push失敗時はWorker・Pagesへ進まない。Git remoteの `pending` を確認する。
- 予約後に中断・失敗した場合は `pending` が残り、後続公開は停止する。branch更新は排他の対象外であり、Worker開始後に先端が変わるとPages前の再確認で停止する。run、Worker・Pagesのdeployment、保存branchの `pending.siteDigest`、実配信のmetadataとbytesを照合する。Workerだけ更新済みの場合は互換性を確認する。DO migrationsを逆実行したり、本番DOを削除しない。
- Pages公開の成功と同じsnapshotの配信を確認できた場合のみ、そのsnapshotを確定する。未公開が確定し、Workerの状態も確認できた場合は、必要な承認を得て予約の親からsite/stateを復元する新commitを作る。結果不明のまま `pending` を削除したり、再実行したりしない。
- 通常rollback：安全な旧ソースへのrevert commitを対象branchへ作り全ゲートを通す。保持側は同じsnapshotを使う。緊急の旧snapshot再公開は履歴・hash・対応Worker互換性・公開状態を確認する独立した復旧判断とし、古いworkflow再実行でfreshnessを迂回しない。
- 初回失敗：本番bootstrap未完ならdev公開不可。既存Pagesを維持し、空の保存先を公開しない。
- 切替後に旧workflowへ戻すと/devを消す恐れがある。DUAL_PAGES_ENABLEDを単純にfalseへ戻してlegacyを再開しない。両版snapshotを保持した復旧を行う。

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
