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
