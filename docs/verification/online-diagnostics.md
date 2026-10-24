# オンライン診断ログと認証情報の取り扱い

確認日: 2026-10-24

## ブラウザー診断ログ

右上の三本線メニューから「診断ログ」を開く。日時は日本時間で表示し、コピーされる日時はISO 8601 UTC（ミリ秒精度）。同じタブの `sessionStorage` に最新200件を保持する。保存領域が無効・満杯の場合でもゲーム処理は継続し、ログが失われることがある。ブラウザー診断ログはCloudflareへ送信せず、Worker Logsとは保存先が異なる。

`src/online/diagnostics.ts` は既存の許可リストを使う。操作ログには操作種別、`requestId`、送信時revision、結果、エラーコード、応答時間を記録する。参加トークン、WebSocket ticket、Authorization、Cookie、IPアドレス、HTTPヘッダー、牌ID、鳴き候補ID、ゲーム状態、生のリクエスト/レスポンス本文、例外内容は記録しない。requestIdに64桁の16進数文字列（トークン形式）が渡された場合は出力しない。

## Cloudflare Workers Logs

Cloudflareの自動Invocation Logsは、WebSocket接続のリクエスト情報や `Sec-WebSocket-Protocol` に含まれるticketが記録される可能性があるため無効にした。Cloudflare公式資料も、Invocation LogsにはRequest、Responseおよび関連メタデータが含まれると説明している。

`wrangler.jsonc` では次を維持する。

```json
{
  "enabled": true,
  "logs": {
    "enabled": true,
    "invocation_logs": false,
    "persist": true,
    "head_sampling_rate": 1
  }
}
```

Worker独自ログは `worker/room.ts` の `logWorker` がフィールド許可リストを通し、`console.log` に構造化オブジェクトとして渡す。`worker/index.ts` も固定のエラーコードとイベント名だけを構造化出力する。Worker Logsの有効化・永続化・100%サンプリングは維持される。

引き続きCloudflare側へ記録するイベント:

- `websocket_connected` / `websocket_disconnected`
- `game_action_received` / `game_action_succeeded` / `game_action_failed`
- `state_sync_requested` / `state_sync_response_sent`
- `server_internal_error`

ゲーム操作ログは `requestId`、`gameRevision`、処理時間、固定形式のエラーコードを保持し、同一操作の受信と結果を照合できる。ルーム操作も `requestId` とrevisionで記録する。ログには参加トークン、WebSocket ticket、Authorization、Cookie、IPアドレス、非公開の手牌/山牌、リクエスト/レスポンス本文を渡さない。catch処理ではリクエストや例外内容を記録せず、固定エラーコードのみを記録する。捕捉した内部例外は再throwせず、HTTP処理では汎用500応答を返す。WebSocketとalarm処理では固定の `server_internal_error` を記録して終了する。

### Dashboardでの確認方法

新設定のデプロイ後に新しい接続・操作を発生させて確認する。

1. Cloudflare Dashboardの **Workers & Pages** を開く。
2. **Overview** から `heibon-mahjong-online` Workerを選ぶ。
3. **Observability** を開く。
4. 新しい時間帯で `game_action_received`、`game_action_succeeded` / `game_action_failed` などを探す。操作の `requestId` で結果ログを照合する。
5. 自動Invocation Logsが新規に作られず、上記の独自構造化ログは記録され、新規ログにticketや認証情報がないことを確認する。

Cloudflare Dashboardへ接続できず、本番デプロイ後のログ確認は未実施。設定とローカル検証だけで実環境の記録を確認済みとはしていない。設定変更は将来のログに適用され、過去の保存済みログを消去しない。

## 過去のログの保持・削除

Cloudflare公式の [Workers Logs資料](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)（2026-10-24確認）では、最大ログ保持期間を **7日** と記載している。同じ資料には、個別の既存ログを即時削除する手順/APIを確認できなかったため、削除方法は未確認として扱う。保持期限前の削除が必要な場合は、Cloudflare公式サポートまたはDashboardの現行機能で確認する必要がある。削除手段を推測して実行しない。

既存ログの削除やCloudflareアカウント設定の変更は実施していない。`invocation_logs: false` は過去ログの削除・保持期限の変更を行わない。

## 検証結果

- Wrangler 4.151.2の設定スキーマ検証と `wrangler deploy --dry-run --config wrangler.jsonc`: 成功。Dry-runは既存WorkerとDurable Objectsのバインディングを確認し、実デプロイは行っていない。
- `npm run typecheck:worker`: 成功。
- `npm test`: 58件成功。クライアント/Worker診断ログの許可リスト、秘匿項目の除外、requestId保持のテストを含む。
- `npm run build`: 成功。
- `git diff --check`: 成功。
- 独自ログの安全性: `worker/room.ts`、`worker/index.ts`、`src/online/diagnostics.ts`、オンライン通信・診断ログ呼び出しを確認。request/responseオブジェクト、例外文字列、認証情報、IP、非公開牌情報をログへ渡す実装は見つからなかった。内部例外の再throwもCloudflare側の追加例外記録を避けるため停止した。
- `requestId`照合: Workerの操作受信/結果ログとブラウザー診断のrequestId保持を確認。テスト成功。
- GitHub Actions run [40086380784](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40086380784)（commit `00ab5337672eab6583ba6d82021c7ea5d9b59e56`）: 全job成功。Worker deploy、HTTPS/WebSocket/再接続/認証/privacy本番テスト、Pages build/deployを確認。
- Cloudflare DashboardのWorkers Logs、実環境での自動Invocation Logs停止と独自ログの表示: 未確認。production-testの成功はアプリ通信の検証であり、Workers Logs画面の確認とは区別する。

## 関連資料

- Cloudflare公式: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) — Invocation Logsの内容と無効化、Dashboardでの閲覧、最大保持期間。
- `tests/diagnostics.test.ts`: 200件リングバッファ、sessionStorageからの復元、許可リスト除外、storage例外の非伝播。
- `tests/browser-diagnostics.py`: 375×812のモバイル表示、再読み込み後の保持、日本時間表示、コピーのフォールバック、クリア確認。CIのChromium/WebKitはSafari実機確認とは異なる。
