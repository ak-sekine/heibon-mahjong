# Issue #45 — Cloudflare互換日付とWebSocket 1006調査

調査日: 2026-11-05
作業開始SHA: `f8eee988c0a59cc575f1d6be09737ea981bcf2f7`
fetch後の作業基準SHA: `7263bdd8e3f16adac7036ede5d599adff8a4dee3`
Issue: [#45](https://github.com/ak-sekine/heibon-mahjong/issues/45)

## 結論

- `2025-03-01` はStep 14.0を追加した2026-10-19のcommit `0bace825ddcf28accea1bb27ee754fddc636598f` で導入されました。commit、[Step 14.0の開発記録](../development/step-14.0.md)、[初回本番検証](step14.0/README.md)に、選定理由の説明はありません。古い日付を維持する技術上の必要性は確認できませんでした。
- 2026-04-07以降はWorkersが受信したWebSocket Closeフレームへ自動応答します。現行の`webSocketClose()`は切断状態を保存するだけでClose応答を送っておらず、旧互換日付でハンドシェイク不備になり得る実装でした。`socket.close(code, reason)`で明示応答し、互換日付更新後も旧日付へ戻した際に応答できるようにしました。
- 1006はクライアントが記録した異常終了コードです。run #41941954653には、該当接続でWorkerがCloseフレームを受信した証拠、Worker例外、Cloudflare側の終了理由がありません。互換日付の古さは根本原因として確定していません。
- 候補は段階的更新の`2026-04-07`を採用しました。2026-08-04以降のNode.js互換機能既定有効化を含む`2026-11-05`への一括更新は今回採用していません。Workersの古い互換日付は引き続きサポートされ、すべての新機能へ追従する必要はないとCloudflareは説明しています。

## 互換性変更の評価

現行コードで使うDurable Object、ハイバネーションWebSocket、SQLite、Fetch/Request、Web Crypto、TextEncoder/Decoder、WebSocket Closeを基準に、公式の[互換性フラグ履歴](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)を確認しました。表は`2025-03-01`以降、採用候補日までの関連項目をまとめています。

| 変更日 | 機能 | 旧動作 | 新動作 | 影響 | 対応 | 根拠 |
| --- | --- | --- | --- | --- | --- | --- |
| 2025-03-03 | WebSocket Close理由の長さ | 長さ検証なし | `close()`の理由はUTF-8で123 byteまで | Workerの定型理由は短いASCII文字列。受信側理由はWebSocketプロトコル上の上限内 | 追加対応不要。Closeハンドラで受けた理由を同じコードとともに返す | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-04-01 | Node.js互換時の`process.env` | `nodejs_compat`を設定してもruntime bindingは`process.env`に自動反映しない | `nodejs_compat`を伴う互換日付でbindingを反映 | `nodejs_compat`は未指定でWorkerコードに`process.env`使用なし | 追加対応不要 | [Node.js互換性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) |
| 2025-05-01 | URLPattern標準動作 | 旧実装 | 仕様準拠実装 | Workerに`URLPattern`使用なし | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-05-05 / 05-19 | `WeakRef`、`FinalizationRegistry`、`navigator.language`、Cache APIの`cf` override | 各APIの旧既定 | 標準APIを有効化・Cache設定の適用を変更 | Workerでこれらを使用せず、Cache APIも使用しない | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-06-01 / 06-16 | 起動時eval、AsyncLocalStorage request binding、import assertion | 旧評価・context・import属性処理 | 起動時コード評価を許可し、ALSをrequestへbind、未知のimport属性を拒否 | Workerは起動時eval、ALS、import assertionを使用しない | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-08-01 / 08-07 / 08-15 | EventTargetの`this`、Cache `no-cache`、MessageChannel、Node HTTP API | 旧EventTarget・cache・global/API可用性 | Node.js互換時に追加API、標準準拠・cache変更 | `nodejs_compat`は未指定。WorkerコードにEventTarget listenerやCache使用なし。DOのWebSocketはhibernation handlerを使用 | 追加対応不要 | [Node.js互換性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)、[互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-09-01 / 09-20 | cross-origin redirect時のAuthorization除去、Workflow entrypoint検証 | redirect先にも旧規則で転送、Workflow検証なし | redirect時にAuthorizationを除去し、Workflow定義を検査 | WorkerのHTTP要求は内部DO stubへの直接呼出しで、外部redirect・Workflowsを使用しない | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-11-17以降 | `ctx.exports`、Node API追加 | 既定無効 | `ctx.exports`有効。追加Node APIはNode.js互換有効時に利用可 | `ctx.exports`を使用しない。2026-04-07採用日では対象外 | 今回の設定変更で影響なし | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2025-12-03 / 12-04 | Runtime struct最適化、Node module stub | 旧runtime実装、Node module stubはNode互換有効時のみ | runtime struct構築の最適化、追加Node module stub | struct最適化はAPI契約変更ではない。Node互換は未指定 | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-01-20〜01-29 | RPC引数stub複製、`require()` default export、Node stub | RPC引数の旧所有権、旧module解決、Node互換時に一部stubなし | stubを複製、default exportを返却、Node互換時にmodule stub追加（`node:sqlite`等） | WorkerはRPC / CommonJS requireを使わず、Node互換も未指定 | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-02-10 / 02-19 | Node.js global timer、Fetch iterable body | 旧timer戻り値、iterable body未対応 | Node互換時のtimer object拡張、sync/async iterable bodyの処理 | Node互換未指定。WorkerのRequest / Response bodyは文字列または通常のJSON | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-02-24 | Durable Object `storage.deleteAll()` / alarm、UTF-16LE TextDecoder | `deleteAll()`はalarmを残す。UTF-16LE decoder lone surrogateはそのまま | `deleteAll()`がactive alarmも削除。UTF-16LE decoderはlone surrogateをU+FFFDに置換 | `deleteAll()`はroom期限切れ後だけ実行し、alarm削除は整合する。コードのTextDecoderは既定UTF-8でUTF-16LEを使わない | migration・保存形式変更なし | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)、[SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) |
| 2026-03-03 | WebSocket Close理由byte上限、CJK TextDecoder、unhandled rejection処理 | 旧挙動 | Close理由を123 byteに制限。CJK decoderとrejection処理タイミングを変更 | 定型理由は上限内。WorkerはUTF-8 decoderで明示的CJK overrideなし | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-03-12 | Queueエラーコード | 旧Queueエラー | 詳細コードを返す | Queue bindingなし | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-03-17 | WebSocket標準binary type、Node module additions | runtime既定はArrayBuffer。Node互換時の一部moduleなし | WebSocket標準binary type flag時はBlob。Node互換時に追加module | 公式資料でhibernation用`webSocketMessage`へのbinary type影響なしと明記。Node互換未指定 | 明示フラグ不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-03-24 | TextEncoderStream / TextDecoderStream / WritableStream | 旧stream動作 | backpressureとwriter lockを仕様準拠に修正 | Workerにこれらのstream API使用なし | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-04-01 | Containers PID namespace | 旧container設定 | isolated PID namespace | WorkerにContainersなし | 追加対応不要 | [互換性フラグ](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) |
| 2026-04-07 | WebSocket Closeフレームへの応答 | Closeイベント後も`CLOSING`で、アプリが`close()`を呼ばないとハンドシェイク未完了となり、クライアントで1006となる可能性 | runtimeがClose応答を送り、イベント前に`CLOSED`へ移行 | 現行handlerは状態保存のみで、以前はClose応答なし。更新で自動応答し、コードでもClose応答を追加 | 採用。`web_socket_auto_reply_to_close` flagはこの日付で既定ON。DOの`acceptWebSocket`はproxyでなく、half-open設定不要 | [WebSocket runtime API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)、[Workers changelog](https://developers.cloudflare.com/changelog/post/2026-04-07-websocket-auto-reply-to-close/)、[DO WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |

### 2026-04-07より後の候補

2026-06-16のTLS option検証はWorkerがNode TLS APIを使わないため直接の影響を確認しません。2026-08-04以降は`nodejs_compat`と`nodejs_compat_v2`が既定で有効になります。WorkerソースにNode.js module importや`process`使用はありませんが、現在のWorkerはNode.js互換を明示しておらず、2026-11-05まで上げると未使用のNode互換runtimeとpolyfill群も追加されます。今回のClose応答の目的を超えるため、2026-11-05は不採用としました。後日更新する場合はNode互換の既定変更を独立に検証します。[Node.js互換性変更](https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/)

互換日付の更新はDurable Object SQLiteのclass migrationではありません。既存の`new_sqlite_classes`のtag、SQL schema、保存済みroom/game state、token hash、connection IDを変更していません。SQLiteの`deleteAll()`変更は期限切れ処理に限られ、保存データ移行は不要です。

## 実装変更

- `wrangler.jsonc`の日付を`2025-03-01`から`2026-04-07`へ更新しました。互換flagは追加していません。Close自動応答は日付で既定有効になり、DO hibernationのbinary message形式を変えるflagも不要です。
- `RoomDurableObject.webSocketClose(socket, code, reason)`で受信Close code/reasonを返してから、既存の`socketEnded()`でSQLite接続状態を更新します。新しい日付ではruntimeが先に閉じるため、この`close()`呼び出しは公式仕様上無視されます。古い日付への切り戻し時にもClose応答が残ります。
- `webSocketError()`、WebSocketプロトコル、認証方式、ticket、room state、connection ID検査、SQLite schema / migration tagは変更していません。
- Close code/reasonの返送を回帰テストに追加しました。既存テストは接続置換後の古いclose callback無視、DO再生成後のattachmentとSQLite state復元、Ready解除、再接続後のhand state復元も確認します。

Durable Objectは`ctx.acceptWebSocket()`のhibernation APIでWebSocketを受け入れます。座席・ルーム・ゲーム状態はSQLiteへ保存し、seat、connection ID、participant token hashはWebSocket attachmentへ`serializeAttachment()`で保存します。復帰時は`deserializeAttachment()`を読み、SQLのseat `connection_id`と照合します。新しいticket接続は旧接続を同seat tag内で閉じてconnection IDを置き換え、遅延した旧socketのcloseはDB stateを消さない実装です。これらの構造は既存のユニットテストで確認しています。Cloudflare公式の[hibernation WebSocket guide](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)でもattachmentを使った状態復元を示しています。

## 本番1006事象 — run #41941954653

Actions job `production-test` / job ID `126964708130` のログを取得しました。GitHub checkout target SHAは`c57d35cd65adc5cb28c977383c379127f734e305`（run [#41941954653](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41941954653)）。ログの時刻はUTCです。診断開始は`2026-11-05T00:31:45.556Z`。

### 確認できた事実

| 時刻 (UTC) | 診断開始からの経過 (`elapsedMs`) | 観測 |
| --- | ---: | --- |
| 00:31:47.197 | 1,597 ms | host WebSocket open |
| 00:31:47.627 | 2,027 ms | guest WebSocket open |
| 00:31:48.516 | 2,916 ms | host `start-game`送信 |
| 00:31:48.780 | 3,180 ms | host `start-game`成功、game revision 1。host/guest両方にgame-started state |
| 00:31:49.156 | 3,556 ms | guest `discard`成功、game revision 4。両者に状態反映 |
| 00:31:49.317〜49.438 | 3,718〜3,838 ms | hostのdiscard成功後、CPU手番の自動進行を両者が受信 |
| 00:31:49.959 | 4,359 ms | game中のguest再接続open、revision 10の状態を受信 |
| 00:31:50.154 / 50.445 | 4,555 / 4,845 ms | hostは明示的退出後のseat takeover時、`guest-reconnected`は最後のhumanが明示的に退出した時にclose code 4003。各closeはテストの想定経路 |
| 00:31:51.662 | 6,062 ms | 次のhost WebSocket open |
| 00:31:52.063 | 6,463 ms | guest WebSocket open |
| 00:31:52.090 | 6,490 ms | host close code 1006 |
| 00:32:00.476 | 14,876 ms | guest close code 1006 |
| 00:32:02.065 | 16,465 ms | hostの`action-result for set-ready`待機が10秒でtimeout。closeから約9.975秒後。最近受信したprotocol message typeは`room_state`のみ |
| 00:32:12.131 | 26,531 ms | guestに追加のclose code 1006 |

ゲーム開始、権限拒否、正常操作、ゲームstate同期、CPU進行、ゲーム中の1回の切断・再接続とhost退出のテストまでは成功しています。失敗した`set-ready`は、[本番テスト実装](../../tests/online-production.mjs)ではstate同期の後に送信し、対応する`action-result`を10秒待つ操作です。timeoutイベントはそのaction-result待機中に出ており、hostは先に1006でclosed、guestもtimeoutより約1.59秒前に1006でclosedです。送信処理は`socket.send()`後の応答待ちに到達しているためテストコード上は送信済みですが、Workerが受信したかはログから確認できません。action-resultは観測されていません。

timeout logの`recentTypes=room_state`は、`waitForClientMessage()`がset-ready送信後に登録したwait開始index以降、timeoutまでの直近8 message typeです。したがって少なくとも`room_state`はset-ready送信後に届きましたが、そのmessageがset-ready処理由来か別のroom state配信かは不明です。`action-result`は受信していません。Workerの処理結果・SQLiteのReady値・接続認証はクライアントログだけでは確認できません。失敗後、テストは`set-ready`で停止し、後続のguest切断・再接続確認には到達していません。よって再接続テストの範囲はゲーム中の先行シナリオまでです。

### 原因候補と未確認事項

- **WebSocket Closeハンドシェイク**: 公式仕様上、互換日付`2026-04-07`より前はpeer Closeを受けた後にアプリが応答しないと1006になる可能性が明記されています。現行`webSocketClose()`がcloseを呼ばないことは実装上の不備になり得ます。ただし該当ログは「Close code 1006」としか記録せず、peer Close受信、Worker callback code/reason、応答フレームの有無を含みません。今回の切断がこの経路だったとの証拠はありません。
- **Worker/DO例外、Cloudflare runtime更新、ネットワーク切断**: いずれも1006の候補ですが、該当時刻のCloudflare Workers Logsを取得できず、区別できません。CloudflareのWebSocket docsはruntime更新・crash・shutdownが接続を切断し得ることを説明していますが、このrunで発生したかは未確認です。
- **認証、connection ID、room/Ready state**: アクションへの応答がないため確認できません。先行シナリオは同一Worker buildで成功していますが、別roomに対する失敗時の正当性を証明しません。
- **通信環境または診断テスト実装**: 両socketのcloseがホスト・ゲストで少し異なるタイミングに発生した事実はありますが、理由の根拠になりません。1006のみから原因を選びません。
- run #41941954653のログにはWorker側error logが含まれていません。`webSocketError()`や`server_internal_error`の実行有無、Durable Object invocationの例外は**未確認**です。Workers Logsのアカウント接続はこの調査環境で利用できませんでした。

## 更新候補

| 候補 | 利点 | リスク・変更範囲 | 判断 |
| --- | --- | --- | --- |
| 段階的: `2026-04-07` | Close自動応答を含み、今回のWebSocket lifecycleに関わる変更までに限定 | 2025年以降の互換変更も含む。ローカル型・単体・build・Wrangler dry-runと本番Deploy gateを実行 | **採用**。Close応答コードと回帰テストを併用 |
| 最新化: `2026-11-05` | 互換性履歴を一日単位で最新化 | `nodejs_compat`/`nodejs_compat_v2`既定有効を含み、Close調査を超えたruntime API範囲が広がる | **不採用**。Node互換を使わず、追加の変更に必要性がない。別途テストして更新可 |

## 検証記録

### 更新前

| 検証日時 | 互換日付 | Worker対象SHA | Actions run | WebSocket結果 | 操作応答 | 再接続 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 00:31 UTC | `2025-03-01` | `c57d35cd65adc5cb28c977383c379127f734e305`（Actions checkout target） | [#41941954653](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41941954653) | 正常Close 4003あり。host/guestは1006で異常終了。1006のClose frame detailなし | game action successあり。最後の`set-ready` action-resultは未受信、10秒timeout | game中の先行再接続は成功。失敗したset-ready後の再接続は未実施 |

### ローカル変更後

| 検証日時 | 結果 |
| --- | --- |
| 2026-11-05 | `npm test`: 成功 82/82 |
| 2026-11-05 | `npm run build`: 成功 |
| 2026-11-05 | `npm run typecheck:worker`: 成功 |
| 2026-11-05 | `npx wrangler deploy --dry-run --config wrangler.jsonc`: 成功、Worker bundle/bindingsを生成 |
| 2026-11-05 | `git diff --check`: commit前に実行予定 |
| 2026-11-05 | `wrangler dev --local`による本番通信テスト: 未実施。通常起動・`--ip 127.0.0.1`とも`uv_interface_addresses returned Unknown system error 1`でWorkerd起動前に終了。Actionsの既存デプロイ／本番検証ゲートで補う |
| 公開後 | Worker deploy、Browser UI Chromium/WebKit、Deploy gate、HTTPS/API、複数回WebSocket、set-ready、再接続結果をActions終了後に追記する |

## 切り戻し

互換性でWorker回帰が確認された場合は`wrangler.jsonc`の`compatibility_date`を`2025-03-01`へ戻し、今回追加した`webSocketClose(socket, code, reason)`の`socket.close(code, reason)`は残します。古い互換日付で必要なClose応答を保つためです。`new_sqlite_classes`、migration tag、保存データは変更していないため、Durable ObjectのDB移行を戻す操作は不要です。修正後は同じDeploy gate、本番通信確認、Worker/Pages SHA確認を通し、force pushや履歴改変はしません。

## 残るリスクと次の調査

- 1006と互換日付更新の因果関係は、再現・Worker Logs・同条件の複数回更新後テストがそろうまで未確認です。
- Cloudflare Workers Logsで該当時間の`websocket_error`、`server_internal_error`、`websocket_disconnected`、`operation_received/succeeded/failed`をrequest/room IDで照合する必要があります。ログにsecretやparticipant tokenを追加してはいけません。
- 更新前runでは再接続テストを最後まで完了していません。更新後は既存production testを同じSHAのActions runで複数回実行し、Close code、`set-ready`応答、timeout、再接続後stateを比較します。単回成功は根本原因解決とみなしません。
- Node.js互換の既定変更を含む2026-08-04以降の日付は別調査で判断します。
