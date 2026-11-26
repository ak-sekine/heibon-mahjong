# オンライン v1 通信互換性（Issue #70 基礎調査）

この文書は `heibon-majong.v1` の現行契約と、拡張を有効化する前に必要な条件を示す。現行型定義が変更されたことだけを理由に、この契約や固定テストの期待値を更新しない。実配布されたすべての旧版を検証済みとするものではない。

## 現行契約

許可 Origin のみ HTTP と WebSocket を受け付ける。`POST /api/rooms` は displayName と任意の rules / format から部屋を作り、roomCode、participantToken、playerSeat、期限とルール等を返す。`GET /api/rooms/{code}` は待機状態、`POST .../join` は名前を受け参加トークンと座席を返す。`POST .../ticket` は Bearer participantToken を認証し一回限りの ticket を返す。`GET .../socket` は `heibon-mahjong.v1` と ticket を WebSocket subprotocol で提示する。能力情報は認証ではない。

room の `set-ready`、`finalize-seats`、`prepare-rematch`、`leave-room`、`close-room` は requestId と expectedRevision が必要。対局操作は requestId と expectedGameRevision が必要で、打牌・リーチは tileId、ロン・鳴き判断は windowId、鳴き・カンは optionId が必要。`request-state`、`request-game-state` は type のみ。未知操作・未知フィールドは拒否される。revision 競合、認可失敗、不正入力等は結果または error で返り、再送した requestId の操作結果は保存される。同じ ID で異なる内容を実行してはならない。

状態は `room-state` と旧 `room_state` の互換別名、`game-state`、開始・局終了・対局終了・中断通知で同期する。プレイヤー別 view の非公開牌保護を維持する。format だけの旧要求や rules の欠損には既存の補完がある。ルームの rules は対局中に変更しない。再接続では sessionStorage に保存した roomCode、participantToken、playerSeat、displayName、expiresAt を検証し、ticket を再取得する。DO の SQLite は room / seats / tickets / operations / online_game / game_operations 等を保持し、participant の認証 hash、revision と対局状態を復元する。SQL テーブルの配置・内部関数は外部 API ではないが、永続データと rollback の互換性は必要。

## 追加発見 API の試作と制約

`GET /api/capabilities` は `{ "protocol": "heibon-mahjong.v1", "features": [] }` を返す。追加機能はまだ存在せず、通常クライアントの接続フローには未接続。旧 Worker の厳密な `404 {"error":"not_found"}` のみ基本 v1 にフォールバックし、通信失敗、401/403、その他の応答や不正 JSON は失敗とする試作関数を用意した。404 の扱いの安全性は初回導入前に実配信経路で検証する。HTTP discovery は既存の厳格な WebSocket 操作に未交渉フィールドを加えないが、参加能力を証明しない。

## 拡張と保存の規則

- 既存フィールドの削除・型・意味の変更は非互換として扱う。任意の応答フィールド追加も旧クライアントで無視可能なことを固定契約テストで確認する。旧 Worker は未知の操作フィールドを拒否するため、送信フィールドの追加は無条件に互換とは扱わない。
- 機能 ID は小文字英数字とハイフンの名前に `.v1` のような正の整数版を付け、意味を変更する場合は新しい ID を付ける。共通能力を確認するまで新操作・フィールドを送らない。
- 必須機能付きルームは、Worker が作成時に条件を固定し、参加・操作・再接続を状態変更前に検証する仕組みが完成するまで提供しない。旧ルームの必要機能は空とする。自己申告は認証・認可の代替にならない。
- 旧 DO データの復元、座席・認証 hash、requestId と revision、二重実行防止を固定 fixture と再接続テストで維持する。旧 Worker が新データを読めない書き込みや非破壊と確認できないマイグレーションでは、独立公開・rollback を止め、段階移行と別途承認を必要とする。
- 非互換変更、v1 サポート終了は移行対象・影響・更新案内・進行中対局保護・rollback を明示し別途判断する。固定 fixture や期待値を更新する際は互換性の意味をレビューし、新テストを追加する。単に実装から期待値を生成し直さない。

## 初回導入と #69

通常の互換拡張では、契約・旧保存復元・新旧通信テストを同一 SHA の必須 CI とし、個々の配布 SHA の恒常的な突合や手動互換フラグをなくすことを目指す。現時点ではルーム単位の強制・新旧の通信契約テストが未完成であり、この条件を満たさない。初回導入は現行 Pages、itch Draft、PWA、開いたタブの実通信と再接続を別途確認する。itch Draft の元 SHA・digest・日付は不明。全旧 PWA の無期限保証はしない。進行中対局や保存形式の非互換変更では例外的な順序制御・停止が必要。

## Phase 2: 切り戻し境界の未解決事項

旧 Worker は能力取得後に有効化され得る。旧 Worker は通常のルーム作成時に未知フィールドを無視し、旧 RoomDurableObject は新しい必須機能の状態を認識しない。従って、通常 v1 の作成要求への能力フィールド追加や、既存ルーム保存行への必須機能の追加だけでは、切り戻し後の誤った作成・参加・操作を防げない。新規の拡張専用 API が旧 Worker で 404 になるだけでは、既に作成されたルームへの旧 v1 経路を保護できない。

候補として、拡張必須ルームを旧 Worker が参照できない別の DO namespace に隔離する方法、または拡張必須ルームが存在する間は旧 Worker への切り戻しを禁止し、完全なドレイン・移行後だけ切り戻す方法を比較する。前者もルームコードの衝突・ルーティング、namespace の非破壊な追加、再接続、権限、実配信版との互換性の検証が必要。後者は恒常的な通常公開の制約と、例外的な非互換データの移行制約を区別する。いずれもまだ実装・実証していないため、拡張必須ルームは提供しない。

能力取得試作はリクエストと応答本文を時間制限し、クライアントの明示的な対応集合との積集合を計算する。現行の対応集合は空であり、接続・再接続フローには未接続である。固定値と mock を使った検証は実 Worker 更新や旧 Worker との実通信の代替ではない。
