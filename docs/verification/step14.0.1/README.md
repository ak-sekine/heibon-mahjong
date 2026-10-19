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

2026-10-19、実装commit [`5648c15`](https://github.com/ak-sekine/heibon-mahjong/commit/5648c15f7600ad8bb81ee740bf628b58f4b488fb) に対する[GitHub Actions run 39274484619](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39274484619)を確認しました。全jobが成功しました。

- `verify`：成功。`npm test`、Worker型検査、Pages build
- `Browser UI verification`：成功。既存ブラウザー回帰と390×844のルーム作成、Ready、自動再接続、CPU座席確定、退出シナリオ
- `deploy-worker`：成功。既存のCloudflare Workerへデプロイ
- `production-test`：成功。CI専用5ルームで2人＋CPU2人、切断・再接続、ホスト退出と引き継ぎ、4人、3人＋CPU1人、同時参加、不正操作、revision競合、重複確定、秘密情報の非送信を確認。すべてのCIルームを正規の終了操作で終了
- `pages-build` / `pages-deploy`：成功。デプロイ済みWorker URLを含むGitHub Pages bundleをbuildし、Pagesへ公開

Workerの本番URLは[https://heibon-mahjong-online.ak-sekine.workers.dev](https://heibon-mahjong-online.ak-sekine.workers.dev)、Pagesは[https://ak-sekine.github.io/heibon-mahjong/](https://ak-sekine.github.io/heibon-mahjong/)です。

## 未確認

- iPhone Safari実機の操作はユーザーによる公開後確認が必要です。ActionsのChromium確認と実機確認は区別します。
