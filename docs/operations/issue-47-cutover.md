# Issue #47 公開移行手順（2026-11-12）

これは実行記録ではない。今回はmain、Worker、DO、Pages、公開snapshot、公開フラグを変更しない。実行開始にはユーザーの明示的許可が必要。[今回の確認結果](../verification/issue-47-preflight-2026-11-12.md) / [通常運用・障害復旧](environments.md)。

## 実施状況（2026-11-13）

**Phase 2「本番PWAの先行移行」：完了。** Phase 2の公開・自動検証記録と、ユーザー本人によるiPhone Safari実機報告を照合した。公開結果は[Phase 2完了検証記録](../verification/issue-47-environments.md#2026-11-13-phase-2完了記録)と[公開後ライブ監査](../verification/issue-47-live-audit-2026-11-13.md#2026-11-13-phase-2実機報告と完了判定)を参照。

実機報告は8項目中、OK 7・NG 0・未検証1。未検証は「既存オンライン参加・再接続情報の保持」で、本人から「オンライン対局していませんでした」と報告されたため更新前後を比較できていない。保存データ内部を調査した結果ではなく、オンライン参加・再接続情報が確実に存在しなかったとも断定しない。iPhone実機でのオンライン対局・再接続も成功扱いしない。iOS/Safariバージョン詳細は未記録。個別に報告されていない更新通知の表示有無やService Worker内部のversion照合は記録しない。

本番公開run `43430225160` は成功し、Worker deployment `3b6587ac-79fd-49a8-b6d1-2f77a9022331` / version `85e9510f-3f21-45c1-b0ff-4a4de66e7749`、Pages deployment `7766490026`、公開元SHA `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`。公開artifact `published-pages-c3b84944daaa8fbba3b4b603c0d3f8430e9afb58-1`（ID `14043735340`、ZIP SHA-256 `fe5744e7b7178a92db884c8926d1e637c9668eb79b7cc4c0da4fb4d1b0813aff`）と公開URLの16ファイルのSHA-256はすべて一致した。統合後CI `43426274255`、公開後ライブ監査 `43434482360`、Worker診断 `43434482361` もsuccess。

Issue #47全体はOpenのまま。更新前後のオンライン参加・再接続情報保持、iPhone Safari実機でのオンライン対局・再接続、iOS/Safariバージョン詳細は残件である。Phase 3以降は未着手で、この記録の更新では開始しない。Phase 3の初期登録、旧workflow Disable、`DUAL_PAGES_ENABLED`変更等は各Phaseの開始条件・許可を満たしてから扱う。

## 採用する経路と競合条件

既存本番PWAの移行を**旧経路で本番だけ先に公開**し、既存インストールで更新・保存値・オフラインCPUを確認する。その後、その公開に実際に使った成果物のbytesをpages-verifiedに初期登録し、旧経路を停止して新経路へ切り替える。現在のd50e8a6の旧SWをそのまま初期登録して開発版を公開する案は採らない。新しいSWの実機確認前に/devを公開しない。

- 現在のmainのdeploy.ymlにはDUAL_PAGES_ENABLED判定がない。develop側の停止条件がmainに入るまではフラグだけで停止できない。
- develop側の旧経路はdetect-changesの`vars.DUAL_PAGES_ENABLED != 'true'`で入口を止めるだけ。開始済みjobを取り消す仕組みではない。
- 旧経路はmain pushで分類・pending releaseによりWorkerとPagesを自動公開し得る。docsだけのpushでも未公開差分があれば安全とは限らない。
- 新environments.ymlはpushでは検証のみ。Worker→online→publisherは`workflow_dispatch`、`publish=true`、フラグtrue、対応branch、全ゲート成功が必要。現在のmainには新workflow自体がない。
- 旧は`production-deploy`、新Pagesは`pages-publication`、Workerは環境別group。旧と新は相互排他ではない。フラグの途中変更・旧run再実行・旧SHAを選ぶdispatchを禁止し、旧runを全て完了/停止してから切り替える。concurrencyはFIFOを保証しない。
- 古いrunは開始時/公開直前の最新SHA検査で拒否されるが、既に通過したjobや旧コードのrunには依存しない。最終SHAチェックと実公開の間にも時間差があるため、切替中はmain/develop更新を凍結する。

## Phase 1：移行前の最終確認

**前提**：ユーザーが以下の段階的公開（旧経路での本番Worker再デプロイも含む）を明示的に許可。作業窓を確保する。

**操作**：fetch/ls-remoteでmain/develop/pages-verifiedを取得し、採用SHAを固定。未push/dirty/実行中・queued・waiting Actionsを確認。Issueの最新コメントと全ゲート成功を照合する。GitHub Settingsで次を再確認する。

- 共通account IDと両WorkerのCloudflare settings/namespace ID、health。設定変更/DO変更は不要。
- VariablesのWorker URLは末尾スラッシュなしの実URLに揃える（今回CIでは両方末尾`/`あり）。新deploy scriptは厳密照合で拒否するため、**切替前にユーザーがVariablesを修正し、新しいCIで確認**する。CLOUDFLARE_ACCOUNT_IDは共通値。
- worker-production=mainのみ、worker-development=developのみ、github-pages=main/develop。各Environment token名、旧repositoryのCLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID secretを維持。
- Pages Source=Actions、現行公開SHA/URL、DUAL_PAGES_ENABLEDが未設定またはfalse。API403の項目はSettings証跡で補完し、推測で通過させない。

**期待・判定**：採用developのnpm test、Worker型、両Pages/itch、Chromium/WebKit UI、分離、local-online、matrix auditが全て成功。公開元/接続先/保存台帳が説明できる。

**停止・復旧**：不一致、CI失敗、権限未確認、pending、予期しないbranch更新なら公開前に停止。設定を正し最新SHAで検証し直す。保存branchの削除/再初期化/force pushは禁止。

**許可**：設定変更、後続main更新・本番公開を含む実行許可。今回の文書化許可では実行しない。

## Phase 2：本番PWAの先行移行

**前提**：Phase 1成功、dev未公開、フラグfalse/未設定。旧Secretsを残す。現在のd50e8a6成果物とWorker version・旧公開runを復旧用に保全する。

**操作**：レビュー済みdevelopをmainへfast-forward昇格（不可能なら停止して差分再審査）。このmain pushは旧公開を起動する操作である。旧deploy.ymlの全ゲート、Worker公開、実online、pages-build、pages-deploy、記録まで待つ。必要時のみ同じ最新mainへ`deploy_to_production=true`で旧workflowをdispatchし、重複実行しない。これは既存Workerも再デプロイするため、その副作用を含めた許可が必要。新経路publishは実行しない。

公開に使用された**当該旧runのgithub-pages artifact（artifact.tar内のdist）**を期限内に保存し、run ID・artifact ID・ZIP/TAR SHA256・source SHA S・Worker URLを記録する。environments.ymlの別build成果物を同一と仮定して代用しない。

既存本番PWAを削除せずオンラインで開き、対局の区切りで更新通知を承認する。同環境の別タブ/ホーム画面起動を閉じる。sw.jsの登録URL/scopeは既存と同じ。更新後のcontrollerとSW bytesを確認し、一度再読み込みしてから完全終了→オフラインでCPU対局。Safari通常起動とインストール済みPWAを分け、ユーザーがiOS/Safari版と結果を記録する。ルールと再接続保存値を更新前後で比較（token値は記録しない）。

**期待・判定**：本番manifest id/start_url/scopeは`/heibon-mahjong/`を維持。新SWはdev fetch/更新client判定を除外し、productionでclients.claimしない。削除対象は自身の古い`heibon-mahjong-shell-` cacheのみ。devは`heibon-mahjong-dev-shell-`で旧prefix外。localStorageの既存本番キーを維持し、サイトデータ削除/全SW unregisterはしない。CPU進行中の更新承認は対局を終了するため、区切りで行う。オフラインCPU起動成功、online再接続保存値維持、実公開の各ファイルSHA256がartifactと一致すること。

**停止・復旧**：ゲート/公開失敗や既存PWAの更新・保存値・offlineにNGがあれば/devと切替を停止。旧Worker更新済みの場合はPagesが旧版でも互換性を確認し、必要なら既知Worker versionへ明示承認の上復旧（DO逆migration/削除不可）。Pages成功不明ならdeployment結果と公開bytesを照合。PWAのcacheを全削除して見かけの成功にしない。必要なソース修正はdevelopから再検証して前進修正する。

**許可**：main push、旧本番Worker/Pages公開、復旧公開。実機操作はユーザー。

## Phase 3：公開済み本番成果物の初期登録（Pages公開なし）

**前提**：Phase 2の実公開/PWA実機確認成功。main先端=Sで凍結。旧runは終了、Pages deployment成功と記録SHA=S、Worker実URL一致。pages-verifiedが取得でき、version=1、current={}、pending=null、siteなしである。空でなければ初期登録を実行しない。

**操作**：独立した作業用cloneへ既存pages-verifiedをcheckoutする。Phase 2の**実公開artifact**を別candidate directoryに展開し、symlink/余分な階層/devがないことを検査。公開URLの全ファイルをSWを介さないHTTPクライアントで取得してSHA256を比較（HTML表示だけで判定しない）。source SHA、API URL、ビルド情報も照合する。artifactが失効/欠落/不一致なら再ビルドで代用せず停止する。

次はパス/Sを実際に確定してから実行する概形（この文書の作成時は未実行）。`SOURCE`は検証済みソース、`STORE`は既存保存branch clone、`CANDIDATE`は当該公開artifactのdist。環境変数には秘密値を入れない。

```sh
node "$SOURCE/scripts/environments/artifacts.mjs" seal "$CANDIDATE" production "$S" "$PRODUCTION_URL"
node "$SOURCE/scripts/environments/artifacts.mjs" verify "$CANDIDATE"
node "$SOURCE/scripts/environments/artifacts.mjs" stage "$STORE" "$CANDIDATE" "$S" "$PRODUCTION_URL"
node "$SOURCE/scripts/environments/artifacts.mjs" finalize "$STORE"
git -C "$STORE" add state.json site
git -C "$STORE" commit -m "Register already published production artifact and provenance"
git -C "$STORE" push origin HEAD:pages-verified
```

**期待・判定**：これは**既に旧経路で公開成功を確認した成果物の登録**であり、Pages deployment APIを呼ばない。通常publisherの「pending保存→Pages→finalize」を省略して未公開候補をcurrentにする操作ではない。finalize自体は公開成功を証明しないので、旧deployment成功・公開bytes一致の証跡をcommit/Issueへ添付する。追加するrelease.json/environments.jsonは台帳metadataで、この段階の公開URLにはまだ存在しないことを明記。既存artifactの各ファイルは変更しない。current.production.sha=S、正しいworkerUrl、digest/snapshotDigest、pending=null、devなし、保存remote SHAを照合する。

**停止・復旧**：SHA256/URL/S不一致、main更新、store不一致、Git競合ならpush前停止。push応答不明ならremoteを読み直し、再初期化しない。誤った登録は履歴を残す訂正commitで復旧し、証跡が揃うまで新公開しない。

**許可**：pages-verifiedへの初期snapshot登録。今回は禁止のため実行しない。

## Phase 4：新公開経路へ切替

**前提**：Phase 3成功、main/developに新workflowと旧停止条件が入り、旧runに進行/待機なし。旧SHAの再実行を運用で禁止する。

**操作**：旧deploy.ymlをActionsでDisable（`gh workflow disable deploy.yml`相当）し、状態を確認。その後ユーザーがRepository Variable `DUAL_PAGES_ENABLED=true`を設定する。旧停止条件は補助であり、旧mainコードのrunや開始済みrunには効くと仮定しない。公開対象の最新SHA、設定、storeを再確認する。

**期待・判定**：旧経路は停止、新経路は手動publish=true時だけ動く。フラグ変更だけでPages/Workerが更新されない。Sは登録済みなので**同じmain Sのpublish=trueを初回として実行しない**（stageがalready publishedで停止し、先行Worker更新だけが起き得る）。この方式の最初の新経路公開はPhase 5のdevelop。次の本番更新は新しいmain SHAを全検証して通常のmain dispatchで公開する。

**停止・復旧**：旧runが発見されたら新dispatchせず停止。dev公開前で新公開未実行ならフラグfalseに戻して停止状態を維持できるが、旧workflowの再Enable/本番再公開は別承認。dev公開後はfalseへ戻して旧経路を再開しない（/dev消失）。

**許可**：旧workflow Disable、フラグtrue設定、新公開経路の使用開始。

### 2026-11-14 再確認（Phase 4未完了）

develop `7e6046e12da21c8440f352598a9f46e3eda26ff9`から開始し、main `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`、pages-verified `61d911d490ffabf5052aa190201ada1c0ab7d955`をremote APIで再取得した。保存stateはproduction SHA/digest/snapshotDigestがPhase 3記録と一致し、`pending=null`、development snapshotなし。Phase 3完了コメントとIssue Openも確認した。

フラグ検証修正後の初回run `43552298626`ではverify、isolation-browser両engine、local-onlineがsuccessしたが、Chromium Browser UIのService Worker再試行記録に同期競合があり失敗した。計測開始をService Worker再試行より前へ移し、develop `a7113b6fb7f029585c93bfd7f975a360b3e48f35`の全体run `43552735013`で再検証した結果、verify、Chromium/WebKit Browser UI、Chromium/WebKit環境分離、local-online、matrix auditがすべてsuccess。worker-production、worker-development、online、publishはすべてskipped。イベントはpushで、実行時の`DUAL_PAGES_ENABLED`は未設定。公開jobは起動していない。

GitHubの接続APIではRepository Variables、Environment/Secret登録状態、Pages設定、Deployment一覧を取得できず、ローカルGitHub CLIにも有効なAPI認証がない。したがってEnvironmentのbranch制限とSecrets存在、Pages Source、旧Repository Secrets、deployment IDの現在値を確認済みとは扱わない。旧deploy workflowのDisable、`DUAL_PAGES_ENABLED`変更、workflow_dispatchは未実施。必要なSettings確認と操作ができるまでPhase 4を完了扱いしない。

## Phase 5：開発版の初公開

**前提**：Phase 4成功、本番Sの全hash/保存remoteを再確認。最新develop Dの全CI成功、未解決pendingなし、URLが末尾slashなし。

**操作**：新`environments.yml`をdevelopで`publish=true`として一度だけdispatch。開発Worker→実online→candidate検証→stage→pendingのGit push→合成Pages公開→finalizeの順に待つ。開発Worker再デプロイを伴うことも許可範囲に含める。

**期待・判定**：本番側を再ビルドせず保存bytesを保持し、devだけDへ更新。environments.jsonとstateのprod=S/dev=D、release.json全SHA256一致、pending=null、remote確定commit、Pages成功を確認。worker-productionはskip。本番URLの既存ファイルhashは不変（台帳metadata追加は別に比較）。

**停止・復旧**：CI/Worker/online失敗はPages前停止。stage/push/upload/freshness/Pages/確定push失敗は下記復旧で停止し、再dispatchを重ねない。

**許可**：開発Worker再デプロイ、合成Pages公開、snapshot更新。

## Phase 6：公開後検証と失敗復旧

**前提**：対象deploymentの状態が確定。新規テスト用ルームだけを使用し、障害注入はローカルモックに限定。

**操作・判定**：両URLでHTML/CSS/JS/icon/manifest、CPU対局、対応Workerへのonline対局/切断再接続、ルール/参加session/cacheの環境分離を確認。各PWAの更新・独立起動・offline CPU、同環境複数タブ更新停止/反対環境だけなら更新可能を確認。公開release.json/environments.json、保存state、runの元SHA・digestを照合し、全成果物hashを比較する。第三者ルームやtokenを使用しない。

**停止・復旧**：

1. pendingがremoteにない：Pages前で停止したことをrunで確認して最新全検証からやり直す。Workerだけ更新済みの可能性は別確認。
2. pendingあり：後続stageは拒否される。branchの更新を凍結し、run/deployment ID、pending.siteDigest、公開bytesを比較する。main Sとdev D両方を記録する。
3. Pages成功・確定pushだけ失敗：正確なpending snapshotと実公開の全hash一致、deployment成功を確認した後にのみ、同じstoreをfinalizeして新commitを通常pushする。Pages再公開は不要。
4. Pages未公開を確定：pending commitの親にあるstate/siteを新commitで復元して通常push。公開済み旧snapshotは保持する。Git reset/force push/保存branch削除は禁止。
5. Pages結果不明・一部公開・hash不一致：pendingを消さず停止。公開成功/未公開を確定できなければ、直前の両版snapshotから検証済み合成artifactを作る明示承認付き復旧公開で一致状態を作ってから台帳を確定。古いworkflow再実行、単純フラグfalse、rootだけ旧公開での復旧は禁止。
6. 通常の機能rollbackは新しいrevert commitを対象branchに作り全ゲートを通す。保持側snapshotは同じbytes。Worker互換性/既知versionへの復旧は別途確認し、DO削除/逆migrationはしない。

**許可**：実online試験、復旧公開/Worker version復旧、pending解消commit。今回は実環境への障害注入なし。

## Phase 7：Issue完了判定

**前提**：Phase 6成功、ユーザーのiPhone Safari実機記録を受領。

**操作**：実機日付/iOS/Safari版/既存または新規PWA/通常Safari/更新・offline・CPU・online・再接続・分離の各OK/NGをIssue #47へ記録し、受入条件を1項目ずつ再評価する。

**期待・判定**：本番/開発URL、独立更新/保存、PWA、online、失敗時保全、SHA追跡が実証できる。自動WebKitをiPhone実機成功と扱わない。長期間offlineだった全利用者の旧SW消滅は保証できず、再訪時の更新とdev専用controller再取得を継続確認する。

**停止・復旧**：未確認/NGは未チェックでOpen維持。再現条件を記録しdevelopで修正・検証、必要な公開は別承認を得る。

**許可**：実機操作はユーザー。Issue Closeは別の明示指示後のみ。今回Openのまま終了する。
