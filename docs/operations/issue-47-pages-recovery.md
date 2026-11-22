# Issue #47 本番Pagesの予約からの復旧計画

この文書は2026年11月21日の一部公開向けの作業指示です。調査とモック検証まで実施済みです。Pages公開と台帳確定には別途、利用者の明示承認が必要です。

## 復旧対象

| 項目 | 固定値 |
| --- | --- |
| 元の本番公開 | [run 44869022035、attempt 1](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44869022035) |
| 予約時の `main` と本番公開元 | `c4baa3be9994fcc6d50d57ed3a7bf3ae998aa2ea` |
| 予約コミット | `1d538542c75bf0b49f468acb55ad414c35ce0c10` |
| 予約コミットの唯一の親 | `d4d9a8a7cc9723b9d4a1b5eac9c829929cb4cb61` |
| `pending.siteDigest` | `88d13c11d6c3a8a2349365c63474a6ea6ceecc9bd70453b66dc64e36822e2929` |
| 現行本番Pagesの公開元 | `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58` |
| 維持する開発Pagesの公開元 | `c3a6b6c4eeb72c82b8152ea299511df26e49c435` |
| 直近のGitHub Pages deployment | `7927524147` |
| 本番WorkerのGitHub deployment | `7959080796` |
| 本番Workerの稼働中Cloudflare deployment | `e951a473-6ec3-452d-9625-1d9ba4c8fbff` |
| 本番Workerの稼働中versionと配分 | `f00ddbc1-f0a2-4491-a4ba-fd13c0747fb6`、100% |
| 開発WorkerのGitHub deployment | `7927498780` |

読み取り専用監査では両Workerの `/health` がHTTP 200で、Pages Originが許可されていました。本番・開発の配信は予約前の両16ファイルとメタデータ3件すべてに一致しました。Cloudflare deploymentは元のWorkerデプロイステップの実行中に作成され、監査前後で同じversionが稼働していました。元runの実オンライン検証は成功しています。復旧実行前に最新値を再照合してください。[読み取り専用監査](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44874913578/job/136757405266)

## 実行経路とSHAの扱い

`main` を予約時SHAに維持し、現在の予約を使うPages専用経路を、承認後に既存の手動起動エントリー `environments.yml` の `develop` 側へ追加します。`github-pages` Environmentは `develop` と `main` を許可しています。既存の承認・Environment制約を守り、復旧用の手動入力は既定 `false` にします。復旧は `workflow_dispatch`、`refs/heads/develop`、復旧入力有効、`publish=false` に限定し、通常公開と相互排他にします。同じ `pages-publication` concurrencyを復旧全体に適用し、`cancel-in-progress: false` とします。復旧コードの承認済みSHAと現在の `develop` HEADの一致も要求します。

元runの予約所有者と復旧runを別に記録します。通常公開の `publication-reservation.mjs check` は現在runのID・attemptと、対象ブランチHEADが予約元SHAに一致することを求めます。`main` を先に更新すると元runも `Stale source SHA` で停止します。復旧runでも所有者検査は通りません。予約は自動消去されず、成果物は予約コミット内に残ります。この計画では `main` が動いたら停止します。先端が変わった状態で復旧するには、両方のSHAを固定した別の審査と承認が必要です。通常のfreshness検査と環境設定は維持します。

復旧経路にWorkerデプロイ、台帳予約、ビルド、再sealの処理を含めないでください。導入後は、まず非公開で成功・異常経路を検証します。復旧runがPagesを実際に更新するのは、専用経路の差分と確認条件を再レビューし、対象SHA・予約・Worker versionを示して利用者が明示承認した後です。

## 実行前の確認と手順

1. GitHub APIで `main`、承認済み復旧コードの `develop`、`pages-verified` のHEAD、および元runのSHA・attemptを取得します。元runの品質ゲート、Secret確認、予約、本番Worker、実オンライン検証の成功と、開発Worker・PagesジョブのSkippedを確認します。旧Workflowの無効、`github-pages` の許可ブランチ、`DUAL_PAGES_ENABLED=true`、進行中・待機中の競合公開がないことを確認します。
2. ロック取得後、`pages-verified` を読み取り専用で取得します。HEADと唯一の親が表の値であることを確認し、予約と親を別ディレクトリに `git archive` で展開します。親の `pending=null`、両環境のバイトとrelease、予約の所有者・元SHA・`siteDigest`、開発成果物の不変性を `inspectRecoverySnapshots({previousStore, store, expected})` で検証します。`expected` は表のSHA・run ID・attempt・digestと、本番Worker URL `https://heibon-mahjong-online.ak-sekine.workers.dev` を使用します。`runId` と `attempt` は文字列です。
3. GitHubの本番・開発WorkerとPagesの最新deploymentを表と照合します。Cloudflare管理APIをGETのみで使用し、本番の最新deploymentと単一version・100%配分が表の値であることを確認します。両Workerの `/health` とPages Originの許可を確認します。元のオンライン検証後にWorker version・設定・接続先が変わった場合は、既存のオンライン成功を再利用せず停止します。
4. GitHub-hosted runnerから `verifyRecoveryPublicSite(before)` で予約前の配信を照合します。本番16件、開発16件、メタデータ3件のHTTP 200とSHA-256一致を要求します。想定外の配信差分、欠損、取得不能で停止します。復旧前に既に予約済みバイトが配信されている場合は、新たなPages公開を行わず、公開済みのdeploymentを確定する手順へ切り替えるための承認を得ます。
5. 承認済み復旧runで、予約コミットの `site/` 全体をそのまま `upload-pages-artifact` へ渡します。`github-pages` Environment内で `deploy-pages` の直前に、三ブランチのHEAD、同じ `pending`、digest、Worker version、競合なし、Pagesの更新前deploymentを再確認します。すべて一致した場合のみ `deploy-pages` を1回実行します。想定する外部変更はGitHub Pagesのdeploymentのみです。新しいdeploymentのrun・attempt・状態・URLを保存します。復旧runのhead SHAは復旧コードの `develop` SHAであり、本番公開元は予約時 `main` SHAです。
6. Pagesの成功をGitHub deployment APIで確認し、`verifyRecoveryPublicSite(candidate)` で35件のHTTP 200とハッシュ一致を確認します。`release.json` の本番SHAは予約元、開発SHAは従来値です。`environments.json` は `pending.current` と一致させます。Worker両環境とGitのHEADが意図した値を維持していることも再確認します。従来のPhase 6-A監査のprovenanceは、最新の共有Pages deploymentを開発公開元に固定して比較します。復旧監査では、今回のPages deploymentのID・成功・復旧runをGitHub APIで、公開元SHAと配信バイトを予約でそれぞれ照合します。
7. その後に限り、予約コミットを親にした作業ツリーで `node scripts/environments/artifacts.mjs finalize <store>` を使用し、`state.json` だけを更新します。`site/` が予約と同一、`current` が `pending.current` と一致、`pending=null` を検証します。リモート先端がまだ予約コミットであることを再確認し、通常pushで確定します。新コミットの親・内容・配信ハッシュ・両Workerと開発版の保持を読み取り専用で確認します。

## 異常時の停止条件

| 事象 | 保持する状態と次の判断 |
| --- | --- |
| Pages公開前に失敗 | 予約とWorkerをそのまま保持。失敗理由を解消し、最新状態を監査するまで公開しない。 |
| Pages公開の成否が不明 | 予約を保持。元の復旧run、Pagesのdeployment API、旧版と予約版の配信バイトから成否を特定する。判定不能の間は公開や確定を行わない。 |
| Pages成功・台帳確定失敗 | 予約を保持。既存deploymentと全配信ハッシュの一致を確認し、別途承認のうえ台帳のみを確定する経路を使う。 |
| ハッシュ不一致・取得不能 | 差分とHTTP状態を記録して停止。予約の上書き・確定をしない。 |
| Worker互換性不一致 | 停止し、Workerの変更範囲とPagesへの影響を報告。Worker再デプロイやロールバックは別承認。 |
| 競合run・HEAD・予約の変化 | 停止し、変更元と実配信を確定。Gitの拒否をforce pushで回避しない。 |

復旧後もIssue #47は利用者の判断までOpen、B7未確認範囲はPARTIALを維持します。
