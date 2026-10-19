# Step 14.0.1 検証

## ローカル検証

2026-10-19時点で次を実行しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。テスト47件、47成功、失敗0件。Step 14.0.1専用スイートの9シナリオを含む |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功 |
| Wrangler `deploy --dry-run` | 成功。Room / RateLimit Durable Objectのbindingを確認 |
| Production testスクリプトの構文確認 | 成功 |
| Browser UIスクリプトの構文確認 | 成功 |
| `git diff --check` | 成功 |

Codex Cloudのローカル`wrangler dev`は、Workerの起動前に`uv_interface_addresses returned Unknown system error 1`で終了しました。Durable Objectのプロトコル検証はNodeのSQLite実装を使う専用テストで行い、Cloudflare実環境の通信検証はデプロイworkflowのProduction testで行います。

専用テストはStep 14.0のSQLiteスキーマからの非破壊移行、既存トークンハッシュ・期限維持、1〜4人のCPU補充、Readyと座席確定、古いrevision、重複操作、参加者退出、最後の人の退出、ホスト引き継ぎ、切断中のホスト維持、再接続後のReady解除、Hibernation相当のDO再生成、古いcloseイベント、メッセージ検証、席単位レート制限、IPバケット制限を確認します。

## GitHub Actions・Cloudflare・Pages

対象コミットの実行結果をpush後に記録します。次をそれぞれ確認し、未実行や取得できない結果は成功扱いしません。

- `verify`：回帰テスト、Worker型検査、Pages build
- `Browser UI verification`：390×844のルーム作成、2人状態、Ready、自動再接続、CPU座席確定、退出。通信は決定的なWorkerモックを使用
- `deploy-worker`：既存Cloudflare Worker名・認証設定でWranglerデプロイ
- `production-test`：2人＋CPU2人、切断・再接続、ホスト退出、1〜4人のCPU構成、同時参加、不正操作、revision競合、重複要求、非公開情報、終了操作によるCIルーム清掃
- `pages-build` / `pages-deploy`：Worker URLを使ったGitHub Pages buildとdeploy

## 未確認

- iPhone Safari実機の操作はユーザーによる公開後確認が必要です。
- Actions実行、Cloudflare本番通信、GitHub Pagesのbuild・deployは対象コミットの結果確認後に追記します。
