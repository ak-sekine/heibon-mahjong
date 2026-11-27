# Issue #69 Phase 3-A: 分類と読み取り診断

この記録は候補の調査結果であり、実公開や基準初期化の承認ではない。

公開対象分類は成果物に対する影響を表し、CI・監査の実行要否とは別である。CI・公開・監査・旧復旧専用の追跡ファイルを明示的に `none` とし、`docs/` の文書と記録画像・データ・ログを対象拡張子に限って `none` とする。未知のコードや未分類ファイルは引き続き停止する。`scripts/environments/artifacts.mjs` は release.json の生成にも関係するため `pages` のままとする。現在追跡されるファイルを両環境で分類できることを必須テストで検証し、削除・移動時も旧パスを直接比較する。

公開済みPages基準 `8b66b925fad1eab2a773a512e0e36b9e87eb3b01` と開発基準 `99f6d146049133a1471bd62265089f5b65500563`、および同SHAのWorker仮基準で候補を比較すると、本番はPages、開発は両方が対象となる。Workerの仮基準は稼働版の確定を意味しない。

公開を伴わない読み取り専用診断 [run 45979397697](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45979397697) は、開発Environmentの既存SecretでCloudflare deploymentsとsettingsをGETした。2026-11-27時点で開発Worker `heibon-mahjong-online-dev` のdeploymentは `fae43ae3-76d2-4224-bf6d-ddb687fa43cf`、作成時刻2026-11-22 15:36:19 UTC、version `2f35e7e9-8e31-4cb8-9032-d20299e7e7a3` に100%であった。DO bindingは `ROOMS` と `RATE_LIMITER` それぞれにnamespaceがある。過去公開 [run 45038169955](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955) の元ログではversion IDを確認できず、近接した時刻だけではSHAとの対応を確定できない。本番Environmentはmainのみ許可され、候補refからは診断できない。診断専用workflowの変更は最終候補から除去する。

**診断による意図しないGitHub記録変更：** Environment指定に `deployment: false` を付けなかったため、GitHubが `worker-development` Deployment `8107050354` を自動作成し、診断成功をstatus `success` とした。この記録のSHA `c3165603f31f9efd2cebe3ced87fcbcea7576551` は診断workflowのSHAであり、Worker公開を意味しない。Cloudflareの実公開要求は行っていない。記録を削除・修正していない。旧 `pages-live-audit.mjs` は `worker-development` の最新Deployment SHAと現行台帳を比較するため、この記録により監査がSHA不一致で停止する。新方式の独立Worker基準 `heibon-independent-worker-development` は未初期化のまま。移行・旧監査の前に管理者が本記録と元公開の証跡を照合し、記録の取扱いと復旧を別途承認する必要がある。

移行時は管理者が他Issueの公開、旧main・develop・過去Issue refの公開や再実行、Cloudflare等からの手動公開を一時停止し、共有Pagesへの競合を防ぐ。各操作直前に待機・実行中run、Pages pending・実配信・snapshot、対象Workerの最新version・trafficと記録を再確認する。過去refを技術的にすべて無効化したわけではない。環境別の元公開SHAと稼働versionを確実に結び付けられなければ独立基準を作らず、承認済み初回公開による基準確立の実現方法を別途判断する。GitHubの書き込み権限やEnvironment設定、Cloudflareの本番readは管理者が確認する。

## 誤Deployment復旧の事前確認（2026-11-27）

GitHub APIで `worker-development` 最新の誤Deployment `8107050354`、SHA `c3165603f31f9efd2cebe3ced87fcbcea7576551` が[診断run 45979397697 / job 140439145030](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45979397697/job/140439145030) に対応することを確認した。全statusは新しい順に `success`（ID 23297617226、10:07:28 UTC）、`in_progress`（23297614005）、`queued`（23297611248）、`waiting`（23297609562）。診断workflowはCloudflareへのGETのみを実行した。

元の正常Deployment `7980952202`、SHA `99f6d146049133a1471bd62265089f5b65500563` は[公開run 45038169955 / job 137259637776](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955/job/137259637776) に対応し、最新statusは `success`（ID 22861091348、2026-11-22 15:36:24 UTC）。過去statusは新しい順に `in_progress`（22861076849）、`queued`（22861075502、22861075273）、`waiting`（22861074385）で、inactiveへの変更は確認されなかった。元runのWorker公開・オンラインjobは成功。

事前確認時、`pages-verified` HEADは `3c96a4ef4606d4890dd6c34bd0d0b59ece0b642c`、pendingはnullで、保存済み35ファイルと実配信のhashが一致した。queued・in_progress・waitingのActions runは0件。両Deploymentと全statusのAPI応答・診断workflow・台帳の写しは作業環境の `/tmp/issue69-deployment-recovery/` に保存した。Webhook一覧はGitHub APIがHTTP 403を返し、status変更による外部連携の有無を確認できなかった。削除・status変更は行っていない。
