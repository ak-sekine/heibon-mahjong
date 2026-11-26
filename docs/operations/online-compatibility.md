# オンライン通信契約と公開互換性

## v1 の契約

`heibon-mahjong.v1` は、許可 Origin からの HTTP と WebSocket の基本契約である。`POST /api/rooms` は displayName と任意の rules / format からルームを作り、roomCode、participantToken、playerSeat、期限とルールを返す。`POST /api/rooms/{code}/join` は名前を受け、参加トークンと座席を返す。`GET /api/rooms/{code}` はルーム状態、`POST .../ticket` は Bearer participantToken を認証し使い捨て ticket を返す。WebSocket `GET .../socket` は `heibon-mahjong.v1` と ticket を subprotocol で提示する。サーバーは非対応プロトコルを 400 `websocket_protocol_required` で拒否し、ticket を消費せず接続や状態変更を行わない。

ルームの `set-ready`、`finalize-seats`、`prepare-rematch`、`leave-room`、`close-room` は requestId と expectedRevision が必要。対局操作は requestId と expectedGameRevision、操作に応じて tileId、windowId、optionId が必要。`request-state`、`request-game-state` は type のみ。未知操作、未知フィールド、必須フィールドの欠落や不正な型は拒否する。操作結果は requestId と revision を返し、古い revision や同一 ID の異なる内容を拒否する。同じ要求の再送は保存された結果を使用し、二重に適用しない。

状態同期は `room-state` と旧別名 `room_state`、`game-state` および開始・局終了・対局終了・中断通知を使用する。非公開牌は参加者別 view によって保護する。旧形式の format だけの要求や rules 欠損には既存の補完がある。再接続時は環境別 sessionStorage に保存した roomCode、participantToken、playerSeat、displayName、expiresAt を検証し、ticket を再取得する。DO の room、seats、tickets、操作履歴、online_game 等と revision・認証 hash は復元時も維持する。

## 拡張・非互換と利用者への案内

互換な変更では v1 を維持する。フィールドの削除・型や意味の変更、必須入力の追加、既存操作・応答の意味変更は非互換として扱い、新プロトコル版と移行を別途設計する。任意フィールド追加も旧受信側が受け入れる場合に限る。特に現在の Worker は WebSocket 操作の未知フィールドを拒否する。ソース SHA はプロトコル互換性の判定に使わない。

WebSocket のプロトコル検査は HTTP 作成・参加後に行われるため、HTTP の状態変更を保護しない。将来非互換な HTTP 要求を追加する際は、旧 Worker が通常 v1 として受理できないバージョン付き経路等を使い、状態変更前に識別・拒否する。旧クライアントに新しい必須 HTTP フィールドを要求しない。今回 v2 や新しい経路は実装しない。

ブラウザーの WebSocket API はハンドシェイク失敗の HTTP 状態・本文を通常公開しない。そのため、現行クライアントはプロトコル不一致を通信障害や Origin 拒否と確実に区別できず、不明な障害を非互換と断定してはならない。明確に識別できる将来の非互換エラーでは、状態変更前に拒否し、セッションを安全に保持し、無意味な自動再接続を止めて更新方法を案内する。既に配布済みの旧クライアントに新たな案内を追加することはできない。Pages は最新ページを再読み込みし、PWA は提供される更新を適用する。itch.io は配布元が更新されるまで再読み込みだけで解決しない場合がある。

## 保存・公開・検証

通常の互換変更では固定通信契約テスト、既存の必須 CI、オンライン検証、旧 DO 保存データの復元と認証・非公開牌保護を維持する。固定期待値を現在の実装から自動生成し直さず、契約変更時は意図と影響をレビューする。既存データを破壊する保存形式変更は個別の移行設計・検証・承認が必要。現在の保存状態を安全に扱えない旧 Worker への切り戻しは禁止し、必要なら修正版への前進公開を検討する。例外操作は AGENTS.md の承認規則に従う。

通常の契約を維持した独立公開で、配布済みクライアント SHA の個別特定、Pages と Worker の SHA 一致、新旧全組合せの調査、手動互換フラグ、恒常的な Worker 先行公開、配布先間の版対応表を恒常的に要求しない。非互換な通信・保存変更や切り戻しでは公開順序・利用者更新・移行を個別判断する。代表的 fixture の成功は、実配布されたすべての旧版との互換性を証明しない。

Issue #70 の今回の候補は文書とテストのみで、クライアント・Worker の実行コードと DO 保存形式を変更しない。このため今回の開発・本番公開、itch.io 再配布および追加の実通信・実機確認は対象外であり、未実施を成功と扱わない。将来の通信実装変更や #69 の公開基盤変更では、変更内容に応じて Pages と itch.io 間のルーム作成・参加、対局の基本操作・状態同期・再接続、PWA と開いたままのタブの更新・再接続を必要な環境で確認する。itch.io Draft の現在の配布 SHA・digest・配布日は不明。実機確認と自動テストは区別する。

候補 SHA `91e71050b9d473146d13b8408cfa6f877a5fc664` の CI [45863636177](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45863636177) は Chromium・WebKit、環境分離、オンライン、audit が成功し公開は skip。候補 run は push CI のみで、GitHub Deployment 記録と公開台帳にも候補の公開は確認されなかった。Cloudflare 管理 API による直接確認は未実施。
