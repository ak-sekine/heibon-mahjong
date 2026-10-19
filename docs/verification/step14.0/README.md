# Step 14.0 本番検証

## 実行結果

初回のGitHub Actions実行と本番通信確認が完了しました。

| 項目 | 結果 |
| --- | --- |
| GitHub Actions | [run #117](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39264664967)、commit `0bace825ddcf28accea1bb27ee754fddc636598f`、全job成功 |
| Cloudflare Worker | `https://heibon-mahjong-online.ak-sekine.workers.dev` |
| GitHub Pages | `https://ak-sekine.github.io/heibon-mahjong/` |
| 本番CIルーム | code `72FBPE`、参加者名 `CI-9264664967-1`、期限 `2026-10-20T14:04:57.291Z` |
| GitHub Actions Variable | 追加設定不要。Wranglerの実デプロイ出力から取得したWorker URLをPages buildへ渡します。 |

## 確認項目

| 確認項目 | 状態 |
| --- | --- |
| `npm test`（CPU対戦回帰を含む） | 成功（46/46） |
| Cloudflare Worker型検査・Wrangler dry-run | 成功 |
| Cloudflare本番配備と公開URL | 成功。Wranglerの出力URLを使用 |
| HTTPS、ルーム作成・コード参加 | 成功 |
| WebSocket座席同期、切断・再接続 | 成功 |
| 不正トークン拒否・非公開情報の非送信 | 成功 |
| GitHub Pages build・deploy | 成功 |
| iPhone Safari実機接続 | 未確認（ユーザーによる公開後確認） |

本番テストではHTTPS応答、ルーム作成、ルームコード参加、WebSocket接続と2クライアント間の座席同期、切断後の再接続、不正認証トークンの拒否、非公開情報の非送信、Origin制限を確認しました。GitHub Actions実行サマリーにはCI識別名、ルームコード、有効期限が記録されます。Cloudflare Durable Objectが作成から24時間後にルームデータを自動削除します。

GitHub Pagesの許可Originは`https://ak-sekine.github.io`です。本番通信テストでこのOriginからの要求を確認し、Pages自体のbuild・deployも成功しました。iPhone Safari実機での操作はユーザー側での最終確認が必要です。
