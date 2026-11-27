# Issue #69 Phase 2-B-1: Worker 専用候補

## 初回公開の候補（未導入）

独立Deployment記録のない環境では、承認済み `environments.yml` 手動実行で `publish=true`、`publication_target=worker`、`worker_first_publication=true`、`expected_current_worker_version=<直前に確認・承認した稼働version UUID>` を指定する。本番は最新main、開発は承認済みIssue候補で、既存の同一SHA必須CI、Environment、共有排他、環境別Workerとオンライン検証を維持する。別対象、空・不正なversion、publish=falseは拒否する。

Cloudflareが単一version・traffic 100%であり、指定versionと一致することと、独立Deploymentが空であることを公開前に二度確認する。APIエラー、既存の成功・失敗・pending・不明記録、version変更、競合は停止する。過去のソースSHAは推測せず、開始記録・deploy・deployed・オンライン確認・verifiedの処理は通常公開と共通。開始記録後に失敗した場合は記録を消して再実行せず、公開結果を再照合する。verified記録後、通常のWorker基準取得を再確認する。

初回開発公開前に旧ref・手動公開の停止と権限を確認し、現時点のCloudflare versionを読み取り、対象環境とversionについて承認を受ける。過去の `2f35e7e9-8e31-4cb8-9032-d20299e7e7a3` は現在値として流用しない。初回公開成功後、開発Pages専用公開とautoの公開不要判定を検証する。実公開、独立基準の初期化、main統合は未実施。

この文書は候補ブランチの実装と未検証事項を記録する。新方式は実公開・実台帳移行済みではない。現行方式の運用規則を置き換えない。

## 候補の経路

`Verify isolated environments` の手動入力 `publication_target=worker` は通常の必須 CI・audit 後、共有 `pages-publication` 排他の下で `worker-only` job を選ぶ。Worker Environment の既存承認・Secrets と環境別排他を使う。Pages 予約・stage・deploy・finalize に入らない。旧経路 `both` は維持するが、独立記録が存在する環境では旧経路を停止する。旧 `deploy.yml` も同じ共有排他と停止判定を使う。開発は承認された Issue ブランチ、本番は最新 main とする。明示指定により Worker に差分がない場合も公開でき、Pages 側の差分不明を Worker 公開済みとしない。非祖先でも両コミットのツリーを比較する。

Worker の記録には GitHub Environment に自動生成される deployment と区別する `heibon-independent-worker-production` / `heibon-independent-worker-development` を使用する。GitHub Deployment の SHA と payload は環境、Worker 名、run ID、attempt を保持し、最初の pending は公開要求前に作成・再取得される。最新状態は次のように扱う。

- 記録の作成前に失敗：Wrangler を呼ばない。作成の HTTP 結果が不明な場合も GitHub の最新記録を調べる。
- 記録なし、pending、状態なし、異常終了、成功記録の書き込み失敗：不明として後続公開を停止。
- `success / deployed:<version>`：Worker の公開成功は確認済み、オンライン検証は未完了または失敗。後続公開は停止。
- `success / verified:<version>`：公開とオンライン検証の両方が成功。次回は最新記録だけを参照し、Cloudflare の現行 version が単一・100% で一致した場合に基準 SHA とする。外部公開や交通分割が検出されれば停止。

Cloudflare の version は Wrangler 出力と Workers deployments API の最新 deployment の `versions` を照合する。開始記録があっても runner 停止時の終了処理を前提にしない。失敗時に以前の success を自動採用しない。現在の run の同一 SHA の既存必須 CI に加え、Issue 候補は同一 SHA の成功済み push CI を検証する。本番 Worker 専用経路は Pages Artifact の再利用を要求せず、手動 run の全品質ゲートを実行する。

## 切替・手動再照合の前提（未実施）

1. 公開を停止・排他し、現行台帳の pending、Worker Environment の deployment・Actions run と同一 SHA の CI、Cloudflare のアカウント・Worker 名・実際の deployment/version、オンライン検証結果を照合する。必要な資料が揃わなければ初期化しない。
2. 確認された環境・Worker・SHA・公開 run ID/attempt を payload に持つ独立 Deployment と、照合済みの `verified:<version>` status を作る移行を別途承認・実行する。記録自体を稼働状態の証拠とせず Cloudflare と照合する。これを作成すると旧一体経路は対象環境で停止するため、切替を伴う。現時点では基準を初期化していない。
3. pending や `deployed` のまま終了した場合、GitHub Deployment と run/attempt、Wrangler ログ、Cloudflare 最新 deployment/version・対象アカウント・必要なオンライン検証を照合する。成功か未公開か確定できなければ停止を維持する。証拠に応じて承認された記録だけを復旧し、確認前に Worker を再公開しない。`deployed` は公開後のオンライン確認失敗を未公開として扱わない。

GitHub token に Deployments の read/write、Actions・contents の read が必要。Workers API token に対象アカウント・スクリプトの deployments 読み取りと既存の deploy 権限が必要。名前付き GitHub Deployment environment の作成・保護設定、実際の token 権限、Cloudflare の実応答形式は実環境で未確認である。必要な設定や移行は事前に確認し、今回変更しない。GitHub concurrency は一つの running と pending を保持し、待機 run がキャンセルされることがある。公開開始前のキャンセルと開始後の pending を区別する。

## 検証範囲

隔離テストは API・Wrangler を代替し、本番・開発、旧経路との分岐、開始失敗、キャンセル相当、公開後の記録失敗、オンライン未完了、最新不明、別 version、SHA 不一致、権限不足、traffic 分割を検証する。模擬テストは GitHub・Cloudflare の実際の権限や実公開の成功を証明しない。実公開・実機確認・実台帳変更は未実施。Pages 側の snapshot・専用再開は次段階の対象。

2026-11-27 のローカル検証：限定テストおよび既存公開 workflow・snapshot 関連テストは成功。`npm test` は 1,621 件成功、型検査（アプリ・Worker）、ビルド、YAML 構文確認も成功。追加の workflow 分岐・競合テストは別途成功。ブラウザー UI の実行結果は候補 SHA の GitHub Actions を参照する。
