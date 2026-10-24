# オンライン診断ログ

実装日：2026-10-24

## ブラウザー

右上の三本線メニューから「診断ログ」を開きます。日時は日本時間で表示し、コピーされるテキストの日時はISO 8601 UTC（ミリ秒精度）です。同じタブのsessionStorageに最新200件を保持します。保存領域が無効・満杯の場合でもゲーム処理は継続し、ログが失われることがあります。

操作ログは操作種別、requestId、送信時revision、結果、エラーコード、応答時間を含みます。牌ID、鳴き候補ID、通信本文、ゲーム状態、認証情報、参加トークン、WebSocket ticketは記録しません。requestIdを使って同じ操作をCloudflare Workers Logsと照合できます。

## Cloudflare Workers Logs

`wrangler.jsonc` はWorkers Logsを有効にし、永続化とログのサンプリング率100%を設定しています。初期調査では操作単位の欠落を避ける設定です。永続ログの保存量はWorkerの呼び出し数と操作・同期イベント数に応じて増え、Cloudflareアカウントのプラン・ログ保持条件に従います。外部ログ基盤やデータベースは使いません。長期利用時はDashboardの使用量・料金を確認し、調査終了後にサンプリング率を見直してください。

Dashboardでの確認：

1. Cloudflare Dashboardで **Workers & Pages** を開き、`heibon-mahjong-online` Workerを選びます。
2. **Logs** または **Observability > Logs** を開き、Worker Logsを選択します。
3. 対象時間帯で絞り、JSONログの `event`（例：`game_action_failed`）またはブラウザー診断ログの `requestId` を検索します。
4. 同じ `requestId` の `game_action_received`、`game_action_succeeded` / `game_action_failed` を時刻順に比較します。再同期は `state_sync_requested` / `state_sync_response_sent`、Worker決断タイムアウトは `decision_timeout` です。

ログ例（同じ操作の追跡）：

```json
{"timestamp":"2026-10-24T08:00:00.000Z","level":"INFO","event":"game_action_received","actionType":"discard","requestId":"a1b2c3-request","gameRevision":42}
{"timestamp":"2026-10-24T08:00:00.018Z","level":"INFO","event":"game_action_succeeded","actionType":"discard","requestId":"a1b2c3-request","gameRevision":43,"result":"accepted","durationMs":18}
```

Cloudflare側のアカウント設定、プラン上の保存・保持期間、実際の永続化とDashboard表示はこのリポジトリの設定だけでは確認できません。実環境での確認は未確認です。プランがWorkers Logsの永続化を無効にしている場合はDashboardのWorker Logs設定で永続化を有効にしてください。Workerへの次回デプロイでwrangler.jsoncの設定が反映されます。

## 検証

- `tests/diagnostics.test.ts`：200件リングバッファ、sessionStorageからの復元、機密項目の許可リスト除外、storage例外の非伝播。
- `tests/browser-diagnostics.py`：375×812のモバイル表示、ページ再読み込み保持、日本時間表示、iOS Safari向け`execCommand('copy')`フォールバック、クリア確認。CIではChromiumとWebKitで実行します。WebKitはSafari実機ではありません。
- iPhone XSのSafari実機確認は未実施です。
