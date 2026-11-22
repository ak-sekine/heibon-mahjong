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
