# Issue #64 GitHub Flow移行の検証記録

比較元はmain `db9dab59c836c26e54abf2563a0235fc2f5811ff`、develop `02926ae93b9292349296423c17baf851470ddf45`。共通祖先は `c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`。main固有22件、develop固有75件で、以下は共通祖先との差分ではなく先端同士の31件。既存履歴は両ブランチに保存し、必要な変更単位で採用する。

| ファイル | 採否と理由 |
|---|---|
| `.github/workflows/browser-ui.yml` | main維持＋共通化。#58の4分割と厳密な診断入力を維持。診断対象を制限し、実配信E2Eは専用の手動workflowに分離。 |
| `.github/workflows/environments.yml` | main維持＋共通化。#57の安全側分類と監査を維持し、Issue pushと手動開発公開を追加。 |
| `.github/workflows/issue47-phase6a-live-audit.yml` | main維持。通常の読み取り専用監査を使用。develop限定のrun 44839474104用入力と管理API Secret分岐は移行対象外。 |
| `AGENTS.md` | 共通化。最新main起点、候補CI・公開・fast-forward、最終main CI、本番承認を明記。 |
| `docs/ROADMAP.md` | main維持。developのitch.io対応は#46の別作業。 |
| `docs/SPEC.md` | main維持。itch.ioのviewport確定仕様・現状との不一致は#46と当時の監査記録で追跡し、#64で実装済みとして扱わない。 |
| `docs/operations/bootstrap-development-worker.md` | 過去の記録として保持。#47の初回作成の位置づけと#64の通常公開を明記。 |
| `docs/operations/environments.md` | 共通化。Issue公開、候補寿命、旧経路の停止条件を記述。 |
| `docs/operations/issue-47-pages-recovery.md` | 過去の記録として保持。別事例run 44869022035の固定条件は実行経路に転用しない。 |
| `docs/verification/README.md` | main維持。#57・#58・#63の検証記録を保存。 |
| `docs/verification/issue-47-environments.md` | 過去の記録として保持。developの当時の追記も比較元SHAに残す。 |
| `docs/verification/issue32-common-frame-2026-11-11.md` | 過去の記録として保持。#32の実機記録と対象SHAを保持。 |
| `docs/verification/issue32-itchio-viewport-audit-2026-11-15.md` | 過去の記録として移植。#46の未解決範囲を確認できるようにする。 |
| `docs/verification/issue32-responsive-layout-2026-11-03.md` | 過去の記録として保持。実機・CI記録は比較元SHAで追跡。 |
| `docs/verification/issue52-webkit-chi-reopen-diagnostics.md` | developから移植。診断のSHAと当時の結果を保持。 |
| `docs/verification/issue57-docs-only-environment-workflow.md` | main維持。分類失敗時を含むmainの確認記録を保持。 |
| `docs/verification/issue58-browser-ui-sharding.md` | main維持。分割・診断の実行記録を保持。 |
| `docs/verification/issue63-pages-deployment-provenance.md` | main維持。共有deploymentの履歴と修正後の監査記録を保持。 |
| `scripts/environments/pages-live-audit.mjs` | main維持＋共通化。来歴をIssue ref/SHAとタグに対応。旧台帳のdevelop来歴照合を維持。固定予約監査と管理APIアクセスは移行対象外。 |
| `scripts/environments/pages-recovery.mjs` | developから移植。親、予約ID/attempt、反対環境の保存、hash、公開bytesの汎用検証。旧runを再公開するworkflowは対象外。 |
| `tests/browser-candidate-geometry.py` | developから#52のWebKitチー再表示診断を移植。既存のキー操作と配置の検証を維持。 |
| `tests/browser-live-environment-e2e.py` | developから移植。手動経路からのルーム作成は開発Workerのみ。本番とのオンライン相互復帰はこの経路では部分確認と記録。 |
| `tests/browser-pwa.py` | 共通化。mainの人間操作待ちを保持し、Service Worker更新失敗と再試行の診断を移植。 |
| `tests/ci-change-classifier.test.mjs` | main維持。イベントと診断のマトリクス契約を保持。 |
| `tests/environment-artifacts.test.mjs` | 共通化。復旧fixture、Issue予約と既存公開の互換を検証。 |
| `tests/environment-workflows.test.mjs` | main維持＋共通化。分類不能時の安全性、旧／新のref、CI・公開ゲートを検証。 |
| `tests/pages-live-audit.test.mjs` | main維持＋共通化。固定予約の管理APIテストは移行対象外。Issue公開の来歴とref削除後を追加。 |
| `tests/run-browser-regressions.py` | main維持。#58の厳密な診断選択とゼロ件拒否を保持。 |
| `tests/test_browser_regressions_selection.py` | main維持。ブラウザー別選択を検証。 |
| `tests/test_itch_smoke_startup.py` | main維持。#46の追加fixtureは本移行の公開・CI契約に不要。 |
| `tests/test_live_environment_e2e.py` | developから移植。実公開を伴わない監査・テストルームの契約試験。 |

比較元の文書・コードは[main](https://github.com/ak-sekine/heibon-mahjong/tree/db9dab59c836c26e54abf2563a0235fc2f5811ff)と[develop](https://github.com/ak-sekine/heibon-mahjong/tree/02926ae93b9292349296423c17baf851470ddf45)を参照。

## CIの照合方法

候補のEnvironments push runで、分類・docs-check・verify・local-online、Chromium／WebKit各2グループ、両エンジンの環境分離、最終auditが同じSHAの同じattemptで成功したことを照合する。従来と同様、文書だけのpushではdocs-checkと軽量auditを行い、重いジョブは明示的にskipする。候補公開は全件成功のpush runを要求し、手動runでも既存の全品質ゲートと成果物のsealを実行する。公開検証時はworker-productionがskip、worker-development・online・共有Pages・台帳確定が成功し、本番のGitHub deploymentと保存・配信ファイルが前後一致することを確認する。Cloudflare実稼働版は外部確認が必要。

初回公開には `worker-development` と `github-pages` の候補ref許可および個別承認が必要。取得時点の許可はそれぞれdevelopのみ、mainとdevelopのみ。Secretsと変数の一覧APIは403。公開前に対象ref、Secretsの適用範囲、Cloudflareトークン範囲、本番Workerの現行versionを確認する。

## 2026-11-23 停止後の運用と全件分類

[固有コミットと先端ファイルの分類台帳](issue64-history-inventory.md)に、比較元mainの24件、developの75件、先端差分39ファイルを記録した。Issue #64に必要な未反映コードはなく、itch.ioの未完成要件は #46 に残す。

GitHub APIで `worker-development` は `issue/*`（67787637）、`github-pages` は `main`（62746357）と `issue/*`（67787723）、`worker-production` は `main`（66445039）であることを確認。develop向けの旧ルール 66442603、66457633 は削除済み。旧手動公開は資格情報確認で止まり、bootstrapとinspectも開発Environmentで拒否される。通常CIと読み取り専用監査は維持する。詳細は[現行環境運用](../operations/environments.md)を参照。

## 受入条件4の証跡評価

| 要素 | 判定と証跡 |
|---|---|
| 保存ファイルと実配信hash | **達成。** [開発公開](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955)で予約前・確定前に照合。[Actionsランナーの公開後監査](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45039422886/job/137260311028)で本番・開発各16/16ファイル、メタデータ計3/3件が一致。当時の実配信を対象とし、今回の確認は台帳とdeploymentの読み取り。 |
| Worker・Pages・snapshot来歴 | **達成。** 同監査で開発Worker 7980952202、共有Pages 7980964874、公開run・対象job・attempt 1と確定snapshotを照合。 |
| pending・予約・競合拒否 | **達成。** 実公開で予約から確定へ遷移。現在の `pending=null` を確認。未解決・所有者・stale・競合の失敗系は[成果物契約テスト](../../tests/environment-artifacts.test.mjs)、公開順・ロックは[workflow契約](../../tests/environment-workflows.test.mjs)で確認。実環境で競合や故障を発生させていない。 |
| 本番bytes・Worker保持 | **達成。** 本番ファイルとrelease・snapshotの公開前後一致、worker-productionジョブのskip、GitHub Worker deployment 7965528881とstatus 22804845478の維持を確認。Cloudflare管理APIでの稼働version独立比較は未実施。今回の操作に対する保持には、固定した開発向け操作・ジョブ履歴・前後照合を根拠とする。 |
| PWAと保存状態 | **達成。** 実配信監査で両版のmanifest、Service Worker、scope、cache namespaceを照合。[最終コードmain CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45087187156)で[環境分離テスト](../../tests/browser-environments.py)と[PWA回帰](../../tests/browser-pwa.py)が成功。[本人のiPhone XS報告](issue-47-environments.md#2026-11-20-phase-6-b-b7-safari実機確認)は当時の開発公開版の証跡。新候補SHAの実機再検証と#47 B7の残項目は未確認。 |
| Issue refの更新・main統合後 | **達成。** 実公開の固定SHA `99f6d146049133a1471bd62265089f5b65500563` はmain統合後も台帳のrelease、完全ref、run/attemptと保持用タグから追跡可能。開発公開元SHAは現在のmain先端から独立。 |
| 候補ref削除後 | **達成。** [監査テスト](../../tests/pages-live-audit.test.mjs)は候補ref削除を模擬し、保持用タグとrun/jobで来歴が成立すること、タグのSHA不一致を拒否することを確認。現行タグと台帳の固定SHAの一致は実リモートで確認。配信中の候補refを実際に削除した監査は未実施。 |

条件4は公開分離と来歴を維持できることを要求している。実公開と監査、自動回帰、異常系の契約を組み合わせて達成と評価する。上表の観測限界は保持し、Cloudflare管理面の独立照合や最新候補での実機確認を実施済みとは扱わない。検証目的の再公開や候補ref削除は行わない。

最終コードSHA `32569b894ca788ffc6fdf1ede0031b508962ce17` の [全必須CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45087187156/attempts/1) は成功。過去のWebKit再表示失敗の根本原因は未確定。新しい文書コミットには、該当する文書CIの結果をコードSHAの全件CIから区別して適用する。Issue #64のClose、develop削除、本番公開はそれぞれ別の判断とする。
