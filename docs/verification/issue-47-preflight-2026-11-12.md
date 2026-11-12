# Issue #47 公開移行前チェック（2026-11-12 UTC）

[確定した切替・復旧手順（Phase 1〜7）](../operations/issue-47-cutover.md)。**今回は公開移行していない**。main push、Worker再deploy、DO変更、Pages公開、フラグtrue、旧Secrets削除、保存snapshot変更、実障害注入、PR作成、Issue Closeは未実施。

## Git / Issue / Actions開始状態

| 対象 | 開始時の実取得SHA |
|---|---|
| work HEAD / origin/main | cb457bb0dfe00455adf66d5f8c51284d0d00081f |
| origin/develop | 7662b7d64d84a54cc141553cc1e1e4c398087e74 |
| origin/pages-verified | 232205c5efc7f86df8d70432a62224e82b4fb0ed |

作業場所 `/workspace/heibon-mahjong`、origin=https://github.com/ak-sekine/heibon-mahjong.git。開始workはclean、mainにbehind/ahead=0/0、未pushなし。通常fetchはproxy:8080接続失敗。同じfetchを正規の許可付き実行で成功。mainのみのfetch refspecだったためdevelop/pages-verifiedを明示fetchしls-remoteでも照合した。tracking付きswitchはrefspecのため失敗しindexがdevelop相当になったが、`git switch --no-track -c develop origin/develop`で正常に切替、cleanを確認。既存変更を破棄していない。developはmainにbehind/ahead=0/13（既存push済み履歴）、origin/developに対して未pushなし。

Issue APIで本文と4コメント、Openを取得。同一account方針と未完の受入条件を照合。開始時のin_progressは空、直近12runはcompleted。latest develop [43228505583](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43228505583)はfailure：verify、両分離browser、local-online、WebKit全UI成功、Chromiumのbrowser-pwa.pyで期待する`-v2-retry` cacheの代わりに`-v2` cacheを検出し失敗、audit/公開skip。直前[e0252daの43227915763](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43227915763)はsuccess。過去成功をlatest失敗の代わりに扱わない。

## 外部設定：実取得とユーザー報告の区別

| 項目 | 今回取得した事実 | 未確認・必要操作 |
|---|---|---|
| Repository Variables一覧 | GET actions/variablesは403 Resource not accessible by integration | 一覧・他の変数・DUAL_PAGES_ENABLED現在値は未確認。Settingsで照合 |
| PRODUCTION_WORKER_URL | 今回verify job入力は`https://heibon-mahjong-online.ak-sekine.workers.dev/` | 実Worker URLと末尾slash以外一致。新deployはslashを拒否。公開前に末尾slashを削除 |
| DEVELOPMENT_WORKER_URL | 同入力は`https://heibon-mahjong-online-dev.ak-sekine.workers.dev/` | 同様に修正必須。検証buildの正規化成功は公開設定OKを意味しない |
| CLOUDFLARE_ACCOUNT_ID | 今回inspect jobでvariable参照した`abb9bbfd207cd6e56648a331d5638f6b`の同一account配下から両settings取得200、account GETも200 | repository一覧から直接取得した値ではない。旧account secretとの値一致は未確認 |
| Environmentの存在/branch制限 | APIでworker-production=main、worker-development=develop、github-pages=main/developのbranch policiesを取得 | 制限はユーザー報告と一致 |
| Environment Secrets | 各GET environments/{name}/secretsは403。秘密値を取得/表示していない | 名前一覧未確認。本番tokenの登録・有効性はユーザー報告のみ。開発tokenは今回読取診断で利用成功（再deploy可能の再検証ではない） |
| 旧公開Secrets | GET actions/secretsは403 | CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_IDの現在の登録状態は未確認。維持を要請、削除せず |
| Pages | GET pagesでbuild_type=workflow、public=true、https_enforced=true、URL=https://ak-sekine.github.io/heibon-mahjong/ | source.branch=mainという付随値はbranch公開方式を意味しない |
| 公開SHA | 最新deployment一覧と既存github-pages deployment 7709559454 successを取得。SHA=d50e8a6a5a67e8767de824bb80d2e83751cf474d | 今回実URL全bytesの取得比較は未実施。ユーザー報告・旧記録とdeployment記録が一致 |
| 公開ゲート | 新公開jobは手動publish=true必須。今回pushではskip | skipからDUAL_PAGES_ENABLEDの値を推測しない |

設定済みというユーザー報告は尊重するが、403項目を独立確認済みとはしない。接続環境にCloudflare credentialはなく、既存のActions読取専用診断を利用した。環境の外向き許可はapi.github.com等で、Cloudflare/Pagesへの直接経路を追加していない。

## 実Cloudflare状態の今回照合

test順序修正commit `e5829ad5839bc5dba3be4264d93131f131b57b03`を、既存の厳密メッセージ`bootstrap: inspect development Worker (Issue #47)`でdevelopへpush。[読取専用run 43234679552](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43234679552)のinspect success、prepare/bootstrap skip。既存scriptはGET settings/accountのみで、deploy・triggers deploy・DO変更・health/ルーム要求をしない。

| 対象 | 今回settings SHA256 | 既存13:28 UTC記録との比較 |
|---|---|---|
| 本番 | 254420624fc69761b80aeb61e4becdd5f805f214c198f86934cbd33de0a01c43 | 一致 |
| 開発 | 750d7549649787febbaa88e8b5eac688ee19b29c724be559ae6e991e8850934d | 一致 |

| binding | 本番namespace ID | 開発namespace ID |
|---|---|---|
| ROOMS / RoomDurableObject | bb2855728c5b42beba5771655a131f8d | 5d60a68fe93b40958b974e973ddb7eed |
| RATE_LIMITER / RateLimitDurableObject | 7aef4eef34c14bf594b0d8b2070a8f52 | f1a5e3c6ba1e40dc8eb60578409b1371 |

14:12 UTCのsettings GETは両方200。各bindingのclass/namespace、script_name外部指定なし、既存IDとの一致、環境間非共有を確認。settings hashはコードversionや全DOデータ内容の不変を証明するものではない。

既存[bootstrap run 43227915964](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43227915964)のjob成功とログを今回取得して、実URL、5オンラインシナリオ成功を照合した。health/DO比較/本番前後一致/rate-limitは該当stepの成功とscriptのassertを照合した過去実行の証拠であり、今回の再実行ではない。詳細は[既存記録](issue-47-worker-bootstrap-2026-11-12.md)。今回、実Workerで対局や429誘発を再実行していない。実両Workerでの相互token/ルーム非共有E2Eは未確認（本番テスト要求なし）。

## 旧・新公開経路と保存台帳

APIのworkflow一覧でdeploy.yml/environments.ymlはactive。現在mainには新environments/publisherがなく、旧deploy.ymlに停止フラグ判定がない。developには旧入口のフラグ判定と新手動公開が実装済み。新publisherはworkflow_call専用で独立dispatch入口ではない。新旧でconcurrency groupが異なり、同時Pages更新を防ぐには切替時の旧run終了/停止と旧workflow Disableが必要。main pushは今回禁止し、未実施。

pages-verifiedをGitで読取確認：README.md/state.jsonのみ、state=`{"version":1,"current":{},"pending":null}`、site/snapshotなし。開始SHAから変更していない。既存d50成果物は新SW移行前かつrelease sealなしで、そのままbootstrapに使わない。

初期登録は旧経路で移行版を公開後、その旧runの実公開artifactを抽出して公開bytesと照合・sealし、既存storeへstage/finalizeして通常pushする。Pages操作を伴わず、既公開という証跡を前提にcurrentへ登録する。追加metadataと公開済みファイルを区別する。登録後に同一main SHAを新経路で再publishすると拒否されるので、切替後の初回はdevelop。保持側再buildなし、各元SHA/ファイルSHA256/digest/snapshotDigestを追跡する。詳細は運用手順。

stageは欠落/破損/未登録本番/URL変化/古いSHA/同SHA再実行/pendingを拒否。Git non-fast-forwardで競合停止。Pages失敗・結果不明・finalize push失敗はpendingが後続を止める。ただしfreshnessはチェック後のbranch更新まで原子的に止めず、公開フラグも開始済みrunを取り消さない。切替窓の更新凍結を必要条件とする。実公開で障害注入せず、既存モック/bare Gitテストで検証。

## 今回の自動検証と修正

変更はbrowser-pwa.pyの模擬障害復旧順序（retry SWを書いてからasset配信を復旧）と文書。障害解除→retry script書込みの間にv2がインストールされる競合窓を除いた。assert/公開ゲート/アプリ動作は緩和していない。

- ローカル`npm test`：91ファイル成功、失敗0、38.97秒。成果物合成、storage、PWAのモック、欠落/破損/古いSHA/URL drift/pending停止、ローカルbare Gitの競合拒否を含む。
- Worker型検査、本番Pages build、開発Pages build、itch build/ZIP成功。両Pagesを実Worker URL（slashなし）でseal/verify成功。ローカルビルドは開始develop SHAに対応する検証用で、実公開成果物ではない。
- ローカルのみの初期登録→dev合成リハーサル成功。既存storeと同じ空台帳からstage/finalizeし、dev追加後も本番17ファイルhash不変、pending=null。リモート保存branchは変更していない。
- Chromium/WebKit UIはAGENTS.mdの既知ローカル起動制限に従い既存Actionsで実施。実機Safariではない。
- 今回の[e5829ad / run 43234679693](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43234679693)：verify成功（npm test 1,542件、Worker型、両Pages/itch build、seal）、両ブラウザ分離success、local-online success。全UIとauditの確定結果は追記する。

## 未確認・公開開始に必要な操作

1. ユーザーがSettingsでDUAL_PAGES_ENABLED現在値、Secrets登録名・旧Secrets維持、本番token有効性を確認する。両URL Variablesを末尾slashなしに修正し、その入力でCIを再確認する。
2. 採用SHAと全CIを固定し、Phase 2のmain pushで旧Worker/Pagesが公開される副作用を含め、公開開始を明示的に許可する。今回の作業許可は公開許可ではない。
3. 旧経路の本番PWA移行後、既存インストール済みiPhone Safariで更新・保存値・offline CPUを確認する。未確認のまま/devを公開しない。
4. 実公開artifactの保存branch初期登録、旧workflow停止、フラグtrue、新経路での開発Worker/合成Pages公開はそれぞれ手順・許可境界に従う。
5. 実公開後の両URL/E2E/実機/PWA分離と全hashは未実施。全ユーザーの長期offline旧SW消滅は保証しない。共通origin/共通accountはセキュリティ境界ではない。

Issue #47の公開・実機を含む受入条件は未完。Openを維持し、今回の準備完了とIssue全体の完了を区別する。

## 記録保存と最終照合先

テスト修正`e5829ad5839bc5dba3be4264d93131f131b57b03`、手順・証跡文書`daeeba1fc42fa0d5f5d5ae31e2a366537213b5a8`をdevelopへpushし、各push後のremote SHAを取得して一致を確認。文書commit後もmainは`cb457bb0dfe00455adf66d5f8c51284d0d00081f`、pages-verifiedは`232205c5efc7f86df8d70432a62224e82b4fb0ed`のまま。

この記録のCI状態は文書保存時点のスナップショット。最終develop SHA、終了時3branch照合、CI全UI/auditの確定結果、公開job skip、作業ツリー・Issue Openの最終確認は[Issue #47の当作業検証コメント](https://github.com/ak-sekine/heibon-mahjong/issues/47#issuecomment-6826156964)へ同じコメントの追記として記録する。進行中を成功とみなさず、全ゲート結果を確認してから作業を終了する。最終文書pushで自動起動したrunもそこで照合する。
