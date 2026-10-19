# Step 14.1 — サーバー権威型オンライン東風戦

**実施日:** 2026-10-19
**対象:** `ak-sekine/heibon-mahjong`
**状態:** ローカル実装・検証済み。本番Cloudflare通信とGitHub Actionsの結果はpush後に追記する。

## 目的と範囲

Step 14.0.1の`finalized`ルームから、1〜4人の人間と不足席CPUで東風戦を始め、東4局終了まで進行できるようにします。既存の牌生成、役・点数計算、打牌、リーチ、ロン・フリテン、鳴き、カン、流局、精算、局進行の純粋関数を再利用し、既存のローカル1人用対CPU対局は維持します。

ランダムマッチング、アカウント、観戦、チャット、牌譜、途中CPU代打、途中参加、南場、通常打牌の制限時間、新ルールは追加しません。

## 責務と信頼境界

```text
認証済みブラウザー
  └─ 操作要求、requestId、expectedGameRevision、判断windowId
       ↓ WebSocket
Room Durable Object
  ├─ attachmentの参加席・接続確認
  ├─ 手番、所有牌、操作候補、revision、判断窓の検証
  ├─ 共有ゲーム関数で状態と点数を更新
  ├─ CPUを1操作ずつ進行
  ├─ SQLite transactionで状態と操作結果を確定
  └─ 接続席ごとにPlayerGameViewを組み立てて送信
```

クライアントは完全な状態を受け取らず、手牌・点数・和了結果を確定しません。送信された`playerId`・座席番号・牌種・得点は権限判定に利用しません。操作者は認証済みWebSocket attachmentと一致する人間席から決めます。

開始時、ホスト、`finalized`状態、4席の割当、全人間の接続を確認します。サーバーの暗号学的乱数で136枚を作り、席0を初期親として配牌します。各局の山もサーバー内で生成します。Workerが使う既定乱数は`crypto.getRandomValues`です。ローカル全局結合テストは`RandomSource`を注入して再現可能にします。この引数はWorkerのクライアント通信やHTTP APIには公開しません。

## 永続化と整合性

- Room Durable ObjectのSQLite `online_game` singleton行に、`schemaVersion`、完全な`MatchState`（完全な`GameState`を含む）、4席のサーバー内identity、`gameRevision`、状態、未解決判断窓をJSONで保存します。`game_revision`列とJSON内revisionをHydration時に照合します。
- JSONはモデルが持つ牌ID、牌、面子、和了候補、点数、履歴、フリテン、公開状態をそのまま構造化保存します。永続化したJSONをクライアント配信へ流用せず、表示情報は毎回allowlistから作ります。
- `game_operations`は`participant_id + requestId`を主キーに、操作payloadと結果を最大24時間保存します。ゲーム状態の更新、revision、操作結果の保存は同じ`transactionSync`内です。同じID・同じ操作の再送は結果を再送し、二度目の進行をしません。同じIDで別payloadを送った場合は拒否します。
- 待機ルーム`revision`とゲーム`gameRevision`を分離します。ゲームrevisionは開始時1から、操作回答、CPU更新、精算、次局、中断の確定ごとに単調増加します。不正な操作はゲーム状態を変更しません。
- 途中状態の状態復元時はSQLiteのJSONを検証してHydrateし、最新の座席別表示を再生成します。切断した席の通常手番では停止し、CPUへ交代しません。

## 座席別表示と非公開情報

`src/online/game-view.ts`の`createPlayerGameView`は`GameState`・`MatchState`をシリアライズせず、項目を明示的に組み立てます。

- 本人の席だけに、牌種と物理IDを持つ手牌・ツモ牌、discard/reach/kan/tsumo/kyuushu候補、本人に提示されたロン・鳴き判断を送ります。
- 他家には名前、席風、親、点数、接続、リーチ、河、副露、相手の伏せ牌枚数、公開ドラだけを送ります。他家の手牌・ツモ牌・物理IDはビューに作りません。
- 牌山、王牌、未公開裏ドラ、CPUの内部判断、他家の合法操作、他家の待ち・和了可能性をビューやエラーに含めません。暗カンは牌表示ルールに沿い両端を伏せます。
- 和了者の手牌・公開される和了牌、和了後の裏ドラを公開します。流局時は既存ローカル表示に合わせCPUのテンパイ手牌だけを表示し、明示的なテンパイ申告がない人間の手牌は隠します。
- HTTPは待機ルームの状態のみを返し、対局状態はWebSocketの認証済み席別ビューからのみ取得します。状態要求、WebSocket更新、拒否エラーに完全な状態や相手の秘密は含めません。

## 操作、判断窓、CPU

`src/online/protocol.ts`は既存のルームプロトコルを維持し、ゲーム操作・状態・結果の型を追加します。開始、打牌、リーチ、ツモ、ロン／見逃し、鳴き／パス、カン、九種九牌、次局は操作要求として送ります。ロン・鳴き回答にはwindowId、変更操作にはrequestIdとexpectedGameRevisionを付けます。`request-game-state`は最新の席別表示を再要求します。

通常打牌はタイムアウトなしです。未解決ロン窓では各人間のロン可能性を独立して検証して全員の回答を集め、誰かが先にロンを押しても他人の権利を消しません。ロンがなければ鳴き窓を作り、候補を持つ人間全員の回答後に既存のCPU判断と一緒に集約します。CPUポン・大明カンはチーより優先され、同じ優先度は放銃者からの席順で選びます。見逃しと期限切れはその席だけに通常フリテンを適用します。リーチ宣言牌、加カン・暗カンの槍槓、暗カンの国士無双制限、供託確定時点も共有ルール関数を維持します。

ロン・鳴き判断期限はwindow生成時刻から30秒です。Durable Object Alarmで最早期限またはルームTTLを処理し、期限到達前の回答とAlarmの更新競合をrevision/window IDで検査します。Alarm前に期限後の要求が届いた場合も、同じSQLite transactionでtimeout結果を確定して要求は`stale_decision`として拒否します。期限処理は二重実行しても結果を変えません。

CPUはブラウザーで実行しません。既存のツモ・九種九牌・カン・リーチ・向聴数打牌・ロン・鳴きをサーバー側で使い、オンラインの打牌・カン・リーチ戦略には自席の非公開牌だけを残した状態と公開情報だけを渡します。Worker alarmごとにdrawまたはdiscardを最大1操作実行し、最新revisionを照合して保存します。通常のシャンテン評価はCPUを短い区間に制限し、時間を超えた場合は喰い替え制限を満たす牌IDを決定的に選びます。CPU戦略はローカル対局と共通関数を使い、オンライン側で主に実行量を制限します。

## 局進行、切断、UI

共有`updateMatchGame()`と`settleRound()`で和了・通常流局・特殊流局を精算し、点数保存則、本場、供託、親連荘を維持します。ホストの`next-round`要求は局終了後だけ受け、全人間接続中、正しいrevisionで一度だけ進めます。東風戦終了状態・最終順位は永続化し、再接続後も表示します。

再接続は14.0.1の参加トークンと一回限りチケットを使います。同じ席の最新WebSocketだけを操作可能にし、再接続後は最新の手牌、操作候補、判断期限を再送します。単なる切断では状態を破棄せず、判断窓は設定済み30秒期限で処理します。対局中の明示的退出は状態を`aborted`にして残る参加者に理由を送り、待機状態へ戻しません。Roomの24時間TTLは維持します。

オンライン画面は専用`OnlineGameController`で`PlayerGameView`だけを表示し、ビューアーの席を下側へ回転します。SVG牌・河・副露の描画素材を再利用し、ローカル用`GameController`へ仮の完全状態を渡しません。390px幅の座席回転、裏向き他家牌、操作・結果・次局・再接続のケースを既存Browser UI verificationへ追加しました。ローカルChromiumはAGENTS.md記載のCodex Cloud Crashpad制限があるため実行せず、GitHub Actionsの結果で確認します。iPhone Safari実機確認はユーザー側の公開後確認が必要です。

## Workers Freeへの配慮と未実装

- WebSocket HibernationとSQLiteを維持し、常時ポーリングや新しい有料Cloudflare機能を追加しません。
- CPU判断は1 alarmにつき最大1ゲーム操作です。オンラインのリーチ候補評価は2.5msの期限、シャンテン探索は2ms区間・3ms中断予算で実行し、超過時は合法・決定的フォールバックを使います。全局の決定的なローカルhuman+CPU結合テストは約1.4秒で東4局終了を確認しました。初期手`advanceOnlineCpu` 12サンプルのNode wall timeは中央値7.23ms、最大18.16msでした。最大値には初回実行のcold/JIT影響も含まれます。これはローカル経過時間で、Cloudflare CPU時間の測定ではありません。実CloudflareのCPU限度適合は本番workflow結果や運用計測で継続して確認します。
- 同じルームでの再戦、牌譜、観戦、途中CPU代打、途中参加、通常手番タイムアウト、南場は未実装です。
- 本番Worker通信、production test、ActionsのBrowser UI、Pages build/deploy結果はpush後に検証記録へ追記します。

## ローカル検証時点

`npm test`（48テストファイル）、`npm run typecheck:worker`、`npm run build`、`git diff --check`、本番テスト・ブラウザー検証スクリプトの構文確認、Wrangler `deploy --dry-run`は成功しています。オンライン専用スイートは10ケース、Step 14.0.1のDurable Object統合は11シナリオです。全局human+CPU結合テストは決定的なRandomSourceで東1局から東4局終了まで進めました。結果の詳細は[Step 14.1検証記録](../verification/step14.1/README.md)を参照してください。
