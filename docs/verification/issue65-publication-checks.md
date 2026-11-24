# Issue #65 CI・公開フローの簡素化

## 調査基準

2026-11-24に、前回の調査基準 `b22c40654a29fb963bda3fbed05aa85981d2d76f` と実装開始時の最新mainが同一であることを確認した。Phase 3は候補ブランチの必須CIまで。本番・開発公開、台帳の手動復旧、main統合は保留する。[Issue #65](https://github.com/ak-sekine/heibon-mahjong/issues/65) / [基準コミット](https://github.com/ak-sekine/heibon-mahjong/commit/b22c40654a29fb963bda3fbed05aa85981d2d76f)

## 棚卸しと実装判断

| チェック・実行段階 | 判断と理由 |
|---|---|
| CI分類・文書・Skipped監査 | 維持。明確なdocs-onlyだけを軽量化し、分類不能や必須CI欠落を成功にしない |
| 全CI・Chromium/WebKit・環境分離・local-online・最終audit | 維持。候補push、main push、開発dispatchと例外の本番fullは既存のゲートを適用。本番reuseは検証元を使う |
| ref・event・公開フラグ・対象Secret/Environment、Issue push CI・保持タグ | 維持。対象環境と承認範囲、候補来歴を保護 |
| Worker URL・共有account ID | 本番reuseだけ本番URLと共通設定に限定。全検証は両URLを維持。開発Workerの稼働設定と保持側Pagesの保存・配信hashは独立 |
| 本番の最新main一致 | 選別、予約作成、予約push直前、Worker公開直前は維持。Worker成功後のオンライン前・Pages前から各1回削除。公開後auditの開始・終了時の一致判定は、参考情報の1回の参照に集約 |
| 予約作成・Worker前・オンライン前・Pages前 | 維持。予約作成では台帳と両保存版を読み、各後段ではsnapshot・run/attempt・SHA・URL・digest・保存先端を照合する。外部状態が変わり得る境界 |
| Issue公開時のbase mainと候補ref、本番の保持確認 | 維持。開発Workerを更新するときの本番deployment、共有Pages前後の保持側bytes、来歴を保護 |
| 確定時のsnapshot digest・fast-forward | 維持。別の書き手が進めた台帳への確定を拒否。外部操作の排他には共有ロックと運用上の調整を使用 |
| seal前後・展開後の成果物検証 | 維持。PWA、参照先、Workerの接続先、転送後のdigestを確認。seal直後の重複部分は変更費用に対する効果が小さく見送り |
| 本番reuseのrun/attempt・必須job・artifact来歴・期限・ZIP digest | 維持。転送前後と選別中の変化を検知。2回目の選別縮小は等価性と効果が未確認のため保留 |
| 実Workerオンラインと独立audit、公開終了判定 | 維持。実Workerと配信の確認はローカルテストやジョブ成功だけで代替できない。Pages deployと台帳確定を個別に表示し、Workerはdeploy step、auditは独立jobで判定 |

開発dispatchへの成果物再利用は、開発artifactの来歴と共有Pagesの権限境界の確認が必要なため保留。Issue候補とmainの品質ゲートの役割変更、予約確認自体の削除、監視・自動復旧の追加は見送った。

## 過去の障害と計測

- #47はWorker稼働後にPagesがSkippedとなり予約が残った。旧Workerへの切り戻しと、親snapshot・台帳の復元を実施した。別runのSecret不足とWebKit品質ゲート失敗は別の事象。[公開中断](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44869022035) / [検証記録](issue-47-environments.md)
- #62旧fullでは意図した再利用ジョブSkippedがWorkerに伝播し、未完了のままworkflowがSuccessとなった。条件式と未完了の終了判定は修正済み。別のreuseではWorker・オンライン成功後のPages deployが失敗し、終了チェックがFailureを報告した。Pagesの根本原因・利用者影響は未確認。その後のreuseは独立auditまで成功。[旧full](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45276890552) / [Pages失敗](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45381502132/job/138403036227) / [成功audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598/job/138468007873) / [復旧記録](issue-62-full-publication-recovery.md)
- #57は文書変更の重複実行、#58はUI時間、#63は共有Pages補助auditの誤判定、#64はIssue開発公開の来歴と権限を扱った。main先端や開発URLだけを原因とする停止は、今回の代表履歴では未確認。[#57](issue57-docs-only-environment-workflow.md) / [#58](issue58-browser-ui-sharding.md) / [#63](issue63-pages-deployment-provenance.md) / [#64](issue64-github-flow-migration.md)

attempt 1、Skippedを除いたジョブ数、wallは開始から完了、runner時間は各ジョブの開始から終了の合計。合計wallはrunごとの時間の和で、承認・復旧の待ち時間を含む経過時間とは別。

| 前回調査の実測 | ジョブ | 全検証 | wall | runner |
|---|---:|---:|---:|---:|
| [Issue push](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45028825181)＋[同一SHAの開発公開](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955) | 27 | 2 | 23:55 | 73:02 |
| [候補push](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45281204111)＋[同一SHAのmain push](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45294395931)＋[成功reuse](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598) | 31 | 2 | 27:02 | 77:32 |
| 上記のうち成功reuseのみ | 9 | 0 | 4:14 | 3:30 |

ソース差分上、ジョブ数と全検証回数は同じ。本番の継続・auditでmain一致を要求する箇所は4→0、main参照の回数は4→1、reuseで検証する開発URLは1→0。予約の所有者・配信・確定の照合は継続する。以前のAbort手順は5段階、特定予約向けのPages復旧計画は7段階。今回の共通手順は書込前・直前・書込後の3段階に整理し、状態ごとの判断を分けた。承認数や操作数の削減、人手・wall・runnerの短縮は未測定。変更後の実公開比較は行っていない。

## 検証境界と受入条件

候補差分の限定テスト18件、関連テスト81件、`npm test` 1,599件が成功した。`npm run build`、`npm run typecheck:worker`、`git diff --check` も成功。ブラウザーは既存の候補CIで確認する。

| シナリオ | 自動検証で示した範囲 | 手動判断・未実施 |
|---|---|---|
| 外部公開前の失敗 | stale、失敗・Skipped・キャンセルの後続抑止。隔離したGit fixtureでAbortが親ツリーを復元 | 実環境で未公開と断定する証拠・個別承認 |
| Workerのみ／Pagesのみ | 依存関係、旧Pagesを候補として扱うことの拒否、live bytes照合 | 稼働Worker、互換性、Rollbackかロールフォワードかの判断と実行 |
| 両方公開後の確定失敗 | 予約と候補の一致、mockで候補の配信bytes照合後に台帳だけ確定。破損時の確定拒否 | deploymentとの突合、承認、外部操作 |
| 台帳確定後のaudit失敗 | 台帳確定状態を保持し、異常なdeployment・health・配信bytesでaudit失敗。終了判定も失敗 | 読み取り再確認。再公開の要否は別判断 |
| 外部不明・競合 | HTTP失敗と不一致の拒否。別run/attempt・先端変更・staleな確定pushを拒否 | 管理操作の有無と調整。Cloudflare独自の状態は未確認 |
| DO非互換 | 手順で機械的な切り戻しを禁止 | 実際の保存データとmigrationの互換性検証、復旧の個別承認 |

| Issue受入条件 | 候補段階の評価 |
|---|---|
| 1 チェック棚卸し | 達成 |
| 2 過去の実例と証拠 | 達成 |
| 3 最小変更と不採用案 | 達成 |
| 4 採用差分の回帰検証 | 限定・関連テストを実施。候補の必須CI結果は[候補ブランチのActions](https://github.com/ak-sekine/heibon-mahjong/actions?query=branch%3Aissue%2F65-simplify-publication-checks)で対象SHAを照合。main側は未実施 |
| 5 同等条件の実測比較 | 一部達成。現行実測と差分の処理数を記録。変更後の実公開計測は未実施 |
| 6 AGENTS.md・運用と履歴 | 達成。現行文書を整合させ、過去記録を保持 |
| 7 機能開発へ戻る条件 | 達成 |
| 8 状態別復旧検証 | 一部達成。fixtureで検証できる範囲と手動判断を記録。実復旧は未実施 |
| 9 GitHub正本と承認範囲 | 手順として達成。外部設定とデータの独立確認は障害時の対象に限定 |
| 10 代表障害と安全停止 | 一部達成。既存コードの拒否条件は検証。部分公開・DO非互換の実復旧は手動手順 |

[運用手順](../operations/environments.md#障害と復旧ロールバック)の契約に沿い、今回の候補CIが成功すればPhase 3を終了する。main統合時には最新先端・候補SHA・CIを再確認し、統合後の必須CIと最終auditを確認する。承認範囲内で通常公開する段階ではWorker、Pages、台帳確定、auditを個別に確認する。重大な安全上の問題がなければ、開発reuseなどの追加改善を保留してゲーム機能開発に戻る。

## Phase 4 — main統合・最終検証（2026-11-24 UTC）

実装開始時のmainは `b22c40654a29fb963bda3fbed05aa85981d2d76f`。候補先端、全必須ジョブのhead SHAとattempt、無関係な差分がないこと、fast-forward可能であることを照合し、検証済み `837f298a9b64200bb374c83182ff08e6a6339363` をmainへ通常pushした。統合前の台帳先端は `ce7703dc428ff0eba54422eccb6440a811cdf9a9`、`pending=null`。GitHub Actionsに進行中・待機中の公開・復旧runは見つからなかった。外部の人手による操作履歴の全件確認は未実施。今回の追記は別の文書コミットで、全検証の対象は上記のコードSHA。

限定18件、関連81件、単体テスト全1,599件、ビルド、Worker型検査はPhase 3の同一候補SHAの結果を利用した。候補pushは必須11ジョブと最終auditが成功。統合後のmain pushも同じSHAのattempt 1で、必須11ジョブ、Chromium／WebKit UI各2グループ、両環境分離、local-online、最終auditが成功した。両runとも公開ジョブはSkipped。候補CIの実測はwall 10:07、runner合計35:55。main CIはwall 10:40、runner合計34:29。[候補CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45411513670/attempts/1) · [main CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45414795376/attempts/1) · [main最終audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45414795376/job/138524912553)

### 障害シナリオの照合

Pは確定済み親、Cは予約した候補、Rはrun 50・attempt 1の予約とする。以下は模擬入力であり、障害・公開・データ変更は実環境で発生させていない。自動欄はPhase 3で成功した既存fixtureの証跡を再利用した。机上欄は運用手順の「書込前→直前→書込後」を適用し、書込範囲と終了時の整合を判定した。配信変更は対象Environment保護と個別の明示承認、手動台帳変更は別の個別承認と台帳書込権限が必要。読取確認に公開承認は不要。

| シナリオ・模擬入力と証拠 | 期待する判断 | 照合結果と承認条件 |
|---|---|---|
| 両方未公開。Worker・Pagesのstepは未実行、対象deploymentはP、両側の配信と親hashが一致、Rは先端 | Abort | **自動＋机上、一致。** Git fixtureはRを親にPのtreeを復元し、競合した確定pushを拒否。運用上は未公開の証拠を確認し、台帳の承認だけを取り、配信を維持して両パスとpendingを照合 |
| WorkerのみC。Worker deploymentとhealthはC、Pages配信はP。P WorkerがCの書いたDO形式を読め、migration変更なし | Rollbackまたは安全なロールフォワード | **机上、一致。** Pの既知の正常版へのWorker切り戻しを選択可能。Workerの個別承認とEnvironment保護を適用し、PのWorker・Pages整合後に別承認で親台帳を復元。C Workerと候補Pagesの互換・正常性が揃えばPages側のロールフォワードも可能 |
| WorkerのみC。CのDO保存形式はPで読めない | 機械的Rollback拒否 | **机上、一致。** 旧版を戻す経路を停止。Cと候補Pagesの互換性、あるいはデータを保持できる互換版が証明されるまで追加書込を保留。配信変更やデータ操作の個別承認は別 |
| PagesのみC。全配信hashはC、Worker deploymentはP。C PagesはP APIと非互換、旧PagesはPで動作 | Rollbackまたはロールフォワード | **机上、一致。** 保持側bytesを確認し、PagesだけPに戻す経路を選択。Pages承認とEnvironment保護を適用し、両環境のhashとP Workerを再確認してから別承認で親台帳を復元 |
| 両方C。対象deployment、Worker health、両環境の配信hash、Rの所有者が一致。確定pushだけ未完了 | Finalize | **自動＋机上、一致。** 既存fixtureはCの全bytesを照合した後、Cのsiteを保持して台帳だけ確定。実運用は別の台帳承認と直前の先端照合を要求し、成功後にpendingなしとCを確認 |
| C確定済み。Worker/Pages deploy成功、確定commitあり、auditが配信hash差異を報告 | 読取再確認 | **自動＋机上、一致。** audit mockは不一致を失敗扱いし、確定台帳を保持。運用手順で再デプロイを選ばず、deployment・hash・healthを読取比較。追加書込は別判断・別承認 |
| Pages deploy要求後に応答が途切れ、deployment不明、配信hashの取得は503 | 必要証拠がない書込を停止 | **自動＋机上、一致。** 既存fixtureはHTTP 503でC配信確認を拒否。運用手順でAbort・Finalize・Pages再実行を保留し、Pages側だけを調査。停止中に承認があっても書込へ進まない |
| Cloudflare全履歴が取得不能。元Worker deployは未実行、追加deploymentなし、Worker正常、両PagesはP、競合なし | 他の証拠で安全なら復旧選択肢を残す | **机上、一致。** GitHubの操作証拠と親配信で台帳のみのAbortを選択可能。Cloudflare履歴は未確認と記録し、手動台帳の個別承認を要求。直接操作を示す矛盾が出れば再判定 |
| R確認後に別の保守操作が始まり、pages-verified先端も変化 | 影響する書込を停止 | **自動＋机上、一致。** Git fixtureは古い確定pushを拒否。運用手順で配信操作も止め、競合解消後に証拠を取得し直す |
| Rはattempt 1だが作業元がattempt 2、または候補の保持側digestが異なる | 不正な確定・復旧を拒否 | **自動＋机上、一致。** 既存の予約・復旧fixtureは所有者、snapshot、digest不一致を拒否。確定コマンド単体は所有者や外部配信を証明しないため、手順の書込前照合を通過できず停止 |

参照先は [環境運用](../operations/environments.md#障害と復旧ロールバック)、[成果物・復旧fixture](../../tests/environment-artifacts.test.mjs)、[Git競合fixture](../../tests/environment-git-store.test.mjs)、[再利用・監査fixture](../../tests/reuse-production-ci.test.mjs)。

### 公開とコスト

統合差分と直前の本番公開SHAからの差分は、CI・公開制御、テスト、文書に限られる。通常のアプリ公開を要する差分がないため、本番・開発とも新規公開は実施しなかった。成果物選別、予約、Workerの新規デプロイ、実オンライン、Pagesの新規デプロイ、台帳確定、公開後auditの各段階は今回未実施。

公開Pagesの `release.json` を読取確認し、本番 `422ca54a1ccf1df3531017e4e0b3ec5e41d7ec4c`、開発 `99f6d146049133a1471bd62265089f5b65500563` が確定台帳と一致した。本番Worker `/health` は `ok=true`。開発WorkerのGETはこの環境からHTTP 403だったため健全性は未確認。403の発生元と利用者影響、両WorkerのCloudflare稼働version、現時点の全配信bytesは未確認。台帳に記録された前回の本番公開では独立auditが成功した。[確定台帳](https://github.com/ak-sekine/heibon-mahjong/blob/ce7703dc428ff0eba54422eccb6440a811cdf9a9/state.json) · [前回本番audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598/job/138468007873)

ソース上、公開のジョブ数、全検証回数、予約照合の回数は変わらない。本番継続・auditのmain一致要求は4→0、main参照は4→1（参考情報）、本番reuseの開発URL検証は1→0。旧成功reuseは9ジョブ・全検証0回・wall 4:14・runner合計3:30。変更後の公開wall、runner、人手・承認回数は未計測。机上検証ではAbortの配信作業、Finalizeの再デプロイ、audit失敗時の無条件再公開を避けられることを確認した。CIの実測はSkipped除外、wallはrun開始から完了、runner合計は各ジョブの開始から終了の和。[旧成功reuse](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598)

### 最終受入条件

| 条件 | 評価 |
|---|---|
| 1 チェック棚卸し | 達成。実行段階・重複・故障境界・採否を記録 |
| 2 過去の実例と証拠 | 達成。Skipped、予約残存、重複、監査誤判定を区分 |
| 3 最小変更 | 達成。選定した3項目を統合し、保留案を保持 |
| 4 回帰検証 | 達成。限定・関連・候補・mainの必須CIと最終audit |
| 5 同等条件の公開コスト | 一部達成。過去実測とソース・CIを比較。変更後の公開実測と復旧手間は未計測 |
| 6 文書・運用の整合 | 達成。履歴を保持し手順と結果を記録 |
| 7 機能開発へ戻る終了条件 | 達成。重大な問題のない追加改善は保留 |
| 8 状態別復旧と整合 | 達成。既存fixtureと具体的な模擬入力で実行条件・互換性・停止・整合化を照合。実復旧は未実施 |
| 9 GitHub正本と承認範囲 | 達成。操作対象・証拠・権限・データ保護を手順化 |
| 10 代表障害の限定検証 | 一部達成。所有権・競合・hash・台帳処理を自動fixtureで検証。DO非互換と部分公開での復旧選択は机上検証 |

Phase 4の範囲を終了し、通常のゲーム機能開発へ戻れる。項目5の公開実測と項目10の自動検証範囲に残りがあるため、IssueのCloseは別判断とし、状態を変更しない。開発公開再利用や監査基盤の追加は保留する。
