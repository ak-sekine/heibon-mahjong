# Step 14.0.1 — オンライン待機ルーム

2026-10-19

## 目的と範囲

Step 14.0で作成したCloudflare Worker、SQLite-backed Durable Object、6文字コード、256ビット参加トークン、一度限りの60秒WebSocketチケット、24時間の有効期限を維持し、対局前の座席・準備・退出をサーバー管理にします。このStepではゲームを開始せず、手牌・打牌・ツモ・鳴き・和了・点数精算を同期しません。

## 状態と遷移

| 現在 | 操作 | 次の状態 | 主な変更 |
| --- | --- | --- | --- |
| `waiting` | 参加者が入室 | `waiting` | 最小の空席へ人間を割り当て、全人間のReadyを解除 |
| `waiting` | ホストが座席確定 | `finalized` | 人間席を維持し、空席をCPUで埋める |
| `waiting` | 人間が退出、残存者あり | `waiting` | 席を解放し、残存者のReadyを解除。必要ならホスト移譲 |
| `finalized` | 人間が退出、残存者あり | `waiting` | CPU席をすべて解除し、人間席を維持。残存者のReadyを解除 |
| `waiting` / `finalized` | 最後の人間が退出、またはホストが終了 | `closed` | ルーム操作を停止し、チケットを失効 |
| 任意 | 24時間期限 | `closed` | 接続を閉じ、Durable Objectのデータを期限時に削除 |

単なるWebSocket切断は状態遷移ではありません。席とホスト権限は残し、切断した人間の`connected`と`ready`をfalseにします。再接続した本人は、新しいチケットで接続し直してから再度Readyを押します。切断だけではCPU補充を解除しません。

座席は東・南・西・北の番号0〜3で固定します。`waiting`中の未使用席は`empty`、確定時にだけ`cpu`になります。参加者は入室時の席を保ち、席交換はありません。CPU名は`CPU（東席）`、`CPU（南席）`など席番号から決まり、CPUには参加トークンを発行しません。人間が1〜4人の場合のCPU数はそれぞれ3、2、1、0です。

## Readyと座席確定

- `set-ready`は接続中の認証済み人間が自分の席だけ変更できます。ホストもReadyが必要です。変更を受け付けるのは`waiting`中だけです。
- 参加者の増減で残存人間のReadyを解除します。切断時も切断者のReadyを解除し、接続復旧後に本人がReadyを設定します。
- ホストの`finalize-seats`は、`waiting`、人間が1人以上、全人間が接続中、全人間がReadyのときだけ成立します。サーバーはDurable Objectの認証済みWebSocket attachmentから席を決め、クライアント指定の席・ホスト情報は読みません。
- 座席確定後は再参加、Ready変更、二度目の確定を拒否します。全員へ完全な4席状態を配信し、「対局準備完了。オンライン対局の開始機能は今後のステップで対応します。」と表示します。

## ホストと退出

作成者の席0が初期ホストです。切断・再接続しても`hostSeat`は変わりません。ホストが明示的に退出した場合のみ、残る人間のうち席番号が最小の参加者へ引き継ぎます。残存者がいなければルームを閉じます。

「待機画面を閉じる」はWebSocketだけを切り、`sessionStorage`の参加トークンとサーバー席を維持します。「ルームを退出」は確認後に`leave-room`を送り、認証された本人の席と認証ハッシュ、未使用チケットを削除します。応答が成功するまでは画面上で退出完了にしません。確定後の退出はCPUを解除して`waiting`へ戻します。ホストの`close-room`はルーム全体を終了し、新規チケット・操作を拒否します。

## WebSocketプロトコルと認証

プロトコル名は`heibon-mahjong.v1`のままです。共有型の正本は[`src/online/protocol.ts`](../../src/online/protocol.ts)で、Step 14.1でも同じルーム状態・認証済み参加席・4席の確定情報を利用します。

クライアント操作は次の通りです。

| 操作 | 必須情報 | 動作 |
| --- | --- | --- |
| `set-ready` | `requestId`, `expectedRevision`, `ready` | 自席のReadyを変更 |
| `finalize-seats` | `requestId`, `expectedRevision` | ホストがCPUを割り当てて4席を確定 |
| `leave-room` | `requestId`, `expectedRevision` | 自席を解放して必要な権限を引き継ぐ |
| `close-room` | `requestId`, `expectedRevision` | ホストがルームを終了 |
| `request-state` | なし | 最新状態を要求 |

サーバーは`room-state`、`action-result`、`error`、`room-closed`を送ります。`room-state`は毎回完全な状態を含みます。Step 14.0の配信中クライアントを移行期間にサポートするため、同じ状態とrevisionを旧名`room_state`でも1通送ります。旧クライアントは新しい操作を送らなくても、座席状態の配信を引き続き読めます。新クライアントは両名を読み、revisionで重複を無視します。

256ビット参加トークンは`sessionStorage`だけに保持し、WorkerはSHA-256ハッシュだけを保存します。WebSocket接続ごとに60秒有効・一度限りのチケットを発行します。WebSocket接続後の操作には参加トークンを含めず、Durable Objectが保存した席番号と接続IDから操作者を決めます。Origin許可はブラウザー向け制御であり、参加トークン・チケットによる認証やレート制限の代用ではありません。

## revision、重複要求、接続復旧

ルーム作成時のrevisionは0です。席の参加・退出、接続状態、Ready、ホスト、statusが変化すると永続revisionを増やし、完全状態と操作結果へ含めます。変更操作の`expectedRevision`が現行値と違えば`revision_conflict`を返し、要求元へ最新状態を送ります。

操作履歴は`(participant_id, request_id)`でSQLiteに保存し、状態更新と同じ`transactionSync()`内で確定します。参加者IDは保存済みのトークンハッシュです。同じ参加者・ID・内容の再送は保存済み結果を返すだけでrevisionを増やしません。同じIDを異なる内容に使う要求は拒否します。履歴は24時間より古い行を削除し、参加者ごとに直近128件を保持します。履歴上限を超えた古いIDは再利用防止の保証対象外です。これにより、退出者の座席が新しい参加者へ再利用された場合も、前の参加者の履歴が新しい人のIDを妨げません。

接続attachmentには席番号とランダムな接続IDを保存し、Hibernation後も権限を復元します。接続状態の照合には`getWebSockets()`とattachmentを使います。再接続時は同じ席の古いソケットを閉じ、新しい接続IDを保存します。古いソケットの遅延closeは、保存中の接続IDと異なるため新しい接続の`connected`をfalseにしません。

ブラウザーは切断後、約1秒から始まる指数バックオフに最大30秒の上限とジッターを加えて再接続します。各回で参加トークンから新しいチケットを取得します。意図的に待機画面を閉じたとき、退出後、期限切れ、認証失敗、別タブに接続が移ったときは自動再試行を止めます。`visibilitychange`・`online`・`pageshow`で復帰し、既存ソケットが開いたままなら1回だけ状態要求を送り、8秒以内に応答がなければ再接続します。常時ポーリングはしません。再接続後は完全状態を受信し、以前の接続generationから来たメッセージは無視します。

## SQLite移行とTTL

Step 14.0の`room`、`seats`、`tickets`テーブルを残し、`PRAGMA table_info`で不足列だけを`ALTER TABLE`します。`room`に`status`・`host_seat`・`revision`、`seats`に`kind`・`ready`・`connection_id`を追加します。既存ルームは`waiting`、revision 0で始め、Step 14.0の作成者規則に基づいて席0が存在するときだけ席0をホストにします。席0がなければ他の人をホストにせず、`hostSeat`はnullです。既存の作成時刻・期限・座席・認証ハッシュは変更しません。

新しい`operations`テーブルに重複排除履歴を、`ws_rate_limit`に席ごとの短時間カウンターを保存します。既存の有効期限は変更せず、24時間時点で閉鎖通知を送り、Durable Objectのアラームで期限データを削除します。

## レート制限と入力制限

有料Rate Limiting機能や外部サービスを使わず、SQLite-backed `RateLimitDurableObject` 1個で送信元IPごとのバケットを直列化します。IPそのものは保存・ログ出力せず、SHA-256ハッシュをバケット識別子にします。

| 対象 | 制限 |
| --- | ---: |
| ルーム作成 | 10回 / 10分 / IP |
| ルームコード参加 | 12回 / 10分 / IP |
| チケット発行（無効トークン試行を含む） | 30回 / 分 / IP |
| WebSocket接続要求 | 24回 / 分 / IP |
| WebSocket操作 | 30回 / 分 / 席 |
| HTTP JSON本文 | 最大2 KiB |
| WebSocket操作本文 | 最大4 KiB |

IP別バケットは各制限期間の終了時に削除し、20,000件を超える場合は期限の早いものから整理します。共有IPでは同じ枠を利用者が共有します。送信元IPが変わる試行は別バケットになるため、この制限は大量攻撃を完全に防ぐものではなく、小規模サービスの連続試行を抑えるものです。WebSocket操作カウンターはルームごとの席を主キーにし、4席を超えて増えません。元の24時間TTLでルームデータと一緒に削除します。

表示名は前後空白を除き、空文字・制御文字・24文字超を拒否します。ルームコード・参加トークン・チケット・操作ID・パラメーターを形式検証し、未知の操作と余分なフィールドを拒否します。秘密値はWorkerやCIテストのログへ出力しません。

## Step 14.1で再利用する境界

- [`src/online/protocol.ts`](../../src/online/protocol.ts)の`OnlineRoomState`とWebSocket操作型を維持し、ゲーム状態をこの待機プロトコルへ混ぜません。
- Durable Object attachmentが与える認証済み席番号と`hostSeat`判定を、サーバー権威型ゲーム操作の操作者情報として再利用します。
- `finalized`の4席（人間・CPU）をオンライン対局開始時の参加者構成として渡します。Step 14.1はゲームデータ、牌山、手番、行動権限を別途サーバー側で権威管理します。
- このStepでは対局開始API、牌譜、ゲームrevision、牌IDをオンラインルームへ追加しません。

## 実装と検証

- Worker処理：[worker/index.ts](../../worker/index.ts)、[worker/room.ts](../../worker/room.ts)、[worker/rate-limit.ts](../../worker/rate-limit.ts)
- ブラウザー：[src/online/waiting-room.ts](../../src/online/waiting-room.ts)
- 開発中の検証結果とGitHub Actions、本番Worker、Pagesの結果は[Step 14.0.1検証記録](../verification/step14.0.1/README.md)に追記します。
