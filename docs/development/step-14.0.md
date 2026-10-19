# Step 14.0 — Cloudflareオンライン待機

2026-10-19

## 目的

GitHub Pagesのオンライン待機画面からルームを作成・参加できるようにし、Cloudflare Workers Free上で座席状態を同期します。Cloudflareの公開Worker URLを推測せず、Wranglerのデプロイ結果からGitHub Pagesのビルドへ渡します。

## 実装

- `heibon-mahjong-online` Workerを公式Wranglerで配備する設定を追加しました。`workers.dev`を有効にし、独自ドメイン、アカウントID、APIトークンはWrangler設定に含めません。
- SQLite-backed Durable Objectにルーム・席・トークンハッシュ・一回限りのWebSocketチケットを保存します。ルームは24時間後にアラームで削除されます。
- ルーム作成、ルームコード参加、認証チケット発行、WebSocket接続、席の接続状態配信を実装しました。公開状態に手牌や牌IDなどを含めません。
- GitHub Pagesに待機ダイアログを追加しました。参加トークンはURLに含めず、タブ内の`sessionStorage`で復帰します。
- GitHub Actionsのverify成功後にWranglerでWorkerを配備し、本番通信テストの成功後に同じ出力URLでPagesをbuild・deployします。既存のPages配備をこのworkflow内で維持します。
- 本番テストはCIルームに`CI-<run id>-<attempt>`の表示名を付け、ルームコードと24時間の有効期限をActionsの実行サマリーへ記録します。APIトークン・参加トークンはログ出力しません。

## 初回のworkers.dev設定

Wranglerがアカウントのworkers.devサブドメイン未設定を報告した場合は、Cloudflareダッシュボードでサブドメインを初期設定します。そのエラーを回避するためにAPIトークンや認証設定を変更しません。

## 対象範囲

このStepではルーム待機と座席の接続状態までを扱います。麻雀の打牌・和了・局進行のオンライン同期は含みません。

## 検証

実行した検証とCloudflare・GitHub Actionsの結果は[Step 14.0検証記録](../verification/step14.0/README.md)に記録します。
