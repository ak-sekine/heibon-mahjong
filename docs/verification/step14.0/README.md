# Step 14.0 本番検証

## 実行結果

実装とローカル検証の結果を記録しています。Cloudflareへの初回配備後にGitHub Actionsのrun、Worker URL、通信結果、Pages build/deploy結果を追記します。

| 確認項目 | 状態 |
| --- | --- |
| `npm test`（CPU対戦回帰を含む） | 未確認 |
| Cloudflare Worker型検査・Wrangler dry-run | 未確認 |
| Cloudflare本番配備と公開URL | 未確認 |
| HTTPS、ルーム作成・コード参加 | 未確認 |
| WebSocket座席同期、切断・再接続 | 未確認 |
| 不正トークン拒否・非公開情報の非送信 | 未確認 |
| GitHub Pages build・deploy | 未確認 |
| iPhone Safari実機接続 | 未確認（ユーザーによる公開後確認） |

CIルームには`CI-<run id>-<attempt>`の参加者名が付き、GitHub Actions実行サマリーにルームコードと有効期限が記録されます。Cloudflare Durable Objectが作成から24時間後にデータを自動削除します。
