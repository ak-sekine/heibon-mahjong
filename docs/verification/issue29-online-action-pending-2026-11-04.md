# オンライン対局の操作待機・復旧 — Issue #29

実施日：2026-11-04。Issue #29はOpenのまま維持します。2026-11-01に起きた実際の対局停止原因は特定されておらず、この修正で原因を特定したとは扱いません。

## 2026-11-05 iPhone Safari実機NGと追補

2026-11-05 0:14 JST頃、通常のオンライン対局で「打牌する」を押すと「操作が受け付けられませんでした。最新状態を確認してください。」と表示されました。iPhone Safari診断ログに同時刻の打牌クリックがあり、Cloudflare Workerは次の各要求を`rate_limited`で拒否しています。

| UTC | Workerイベント | エラー |
| --- | --- | --- |
| 2026-11-04 15:14:48.290 | `operation_rejected` | `rate_limited` |
| 2026-11-04 15:14:49.962 | `operation_rejected` | `rate_limited` |
| 2026-11-04 15:14:53.363 | `operation_rejected` | `rate_limited` |

同じ時間帯に`state_sync_requested`が繰り返されていました。席単位30要求/60秒の枠は操作と`request-game-state`で共有されています。これは今回の打牌拒否の確認済みの原因です。2026-11-01の約1分間の停止原因は引き続き未特定であり、この拒否と同一原因とは扱いません。

調査では、クライアントが成功結果を受信した時点で結果revisionの状態通知が未着だと即時に`request-game-state`を送る一方、Workerは成功結果の直後に状態を配信することを確認しました。通常操作の結果と状態通知の到着順により不要な同期が発生し、操作要求数を増やしていました。

追補修正では成功結果後に250msだけ対応状態通知を待ち、届かなければ同期要求を送ります。同じ未確定操作に対する同期要求は最大2回です。250msはWorkerが結果送信と同じ処理内で続けて状態を配信する通常経路を通す猶予で、既存の操作応答タイムアウト15秒や同期タイムアウト8秒より十分短く、異常時の復旧を遅らせません。同期要求のレート制限拒否では操作待機を解除せず、`retryAfterMs`後に再接続して同じ操作IDを保持します。明示的な操作レート制限拒否は状態同期拒否と別に記録・表示し、指定された待機中の再送をクライアント側で抑止します。

通常成功時のWebSocket要求は1操作あたり、修正前の「ゲーム操作1件＋不要な状態同期1件」の2件から、修正後はゲーム操作1件になります。WebSocketの席単位30要求/60秒は変更していません。通常のCPU対局ではCPU手番はWorker内部で進み、クライアント要求は人間が行う操作だけです。回帰ではCPU自動進行と通常結果先行経路を含め、レート制限を引き上げず要求数を確認します。

この文書冒頭の2026-11-04検証記録は最初の修正時点の履歴として残し、以下に今回の再修正後の結果を追記します。

## 確認されたコード上の不整合

- `OnlineGameController` は受信した任意の `game-state` で `actionPending` を解除していました。対応する `game-action-result` より先に状態通知が来ると、画面の操作ボタンが先に有効になり、`OnlineWaitingRoom.pendingGameAction` が残ることがありました。
- `sendGameAction` は送信できない場合に画面へ結果を返さず、送信例外は呼び出し元まで伝播していました。画面側の待機が通信側の保留と一致しない場合がありました。
- Workerはレート制限時に操作 `requestId` を含めず、画面はそのエラーを保留中操作へ対応づけられませんでした。状態同期要求の拒否と操作拒否も明示的に区別できていませんでした。
- 待機側にルーム単位で受信済みゲームrevisionを追跡する仕組みがなく、古い状態通知を操作結果の確定や同期処理から区別できませんでした。

これらはコードと通信処理から確認した不整合です。実際の2026-11-01停止との因果関係は未確認です。

## 今回の修正

- 画面の操作待機を `requestId` と対応させ、対応する確定拒否、または成功結果に対応するrevisionの状態を確認した場合に解除します。
- 送信前に接続がない場合は操作を受け付けず、画面待機を解除して再接続状態を表示します。`socket.send()` が例外を投げて受理有無が不明な場合は、保留中操作と同じ `requestId` を保持し、再接続後に冪等再送します。
- 操作結果が欠落した場合は15秒後に状態同期を要求します。同期中の重複要求を抑え、同期タイムアウト、送信例外、拒否、結果revisionより古い応答では再接続し、再接続後に最新状態と保留操作を確認します。
- 操作結果revisionより古い `game-state` は画面へ渡さず、同じ接続で同期要求を連打しません。room codeごとのrevision追跡は新しいルーム・退出後の再参加で初期化し、同じルームの再接続時は保ちます。Worker仕様の通り、同じルーム内の再戦revisionは単調増加として扱います。
- Workerのレート制限は維持し、エラーへrequestIdを付ける場合は4 KiB上限と既存操作スキーマを先に検証します。同期要求には操作IDを付けず、拒否がゲーム操作を解除しないことを保ちます。

## 状態遷移

1. 接続・最新状態が確認済みなら操作ボタンを有効にします。
2. 操作を送信すると、画面と通信の両方で同じ `requestId` の待機を開始します。
3. requestIdに一致する確定拒否なら両方の待機を解除します。成功なら結果revision以上のゲーム状態を確認してから解除します。
4. 結果が欠落した場合、操作待機を保持したまま状態同期します。同期で結果を確定できなければ再接続し、同じrequestIdで再送します。
5. 通信が切れている間は操作を無効にします。再接続して同じルームの新しいゲーム状態を受け取った時点で、未確定操作の結果が解決済みなら操作を再び有効にします。

## 自動検証

追加・更新した回帰テスト：

- `tests/online-game-revision.test.ts`：別ルームへの切替、同じルームの再接続、再戦revision、退出後の再参加、遅延した古い状態を確認します。
- `tests/step14-0-1.test.ts`：有効な操作のレート制限がrequestIdを返すこと、同期要求や不正な同期要求には操作IDを付けないこと、巨大入力ではrequestId解析を行わないことを確認します。同一requestId再送時にゲーム状態が二重更新されない既存Workerテストも維持しています。
- `tests/browser-online-waiting-room.py` の action sync シナリオ：成功、rate-limit、状態通知と操作結果の順序逆転、結果欠落、状態同期rate-limit、古い状態の連続受信、再接続、送信例外、接続前の操作拒否を確認し、表示中のrevision・待機表示・ボタン有効状態・同一requestId・二重適用なしを検証します。Chromium／WebKit双方を回帰マニフェストへ登録しています。
- 同シナリオでは、旧WorkerのrequestIdなしrate-limit拒否も状態同期中でない場合に操作拒否として解除する互換経路を確認します。

ローカル検証結果：

- 関連テスト `npm run test:file -- tests/online-game-revision.test.ts tests/step14-0-1.test.ts`：2ファイル成功、失敗0。
- `npm test`：81テストファイル成功、失敗・skip 0。
- `npm run build`：成功（TypeScript検査、Vite build、PWA shell生成を含む）。
- `npm run typecheck:worker`：成功。
- Browser UI Pythonシナリオ3ファイルのPython AST構文検査：成功。
- `git diff --check`：成功。

GitHub Actions run [#41843992570](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41843992570)（検証コードSHA `0658dfb35b430e0debf624f2cc2abbec281adcb2`）はsuccessしました。

- `verify`：`npm test`、Worker型チェック、Pages buildが成功。
- Browser UI：Chromium 41シナリオ、WebKit 31シナリオが成功。Browser UI matrix auditも成功し、両engineでaction syncシナリオが成功。
- Deploy gate：release freshness、Worker deploy、本番Worker通信検証、Pages build／deployが成功。
- WorkerおよびPagesの公開記録SHAはともに検証コードSHA `0658dfb35b430e0debf624f2cc2abbec281adcb2` と一致。

Actions実行中にブラウザー検査の期待条件を2点修正しました。選択前の打牌ボタンは仕様どおり無効なため、テストは選択可能な合法手牌を確認します。再送操作の成功後は相手手番になるため、最新状態の一致と自分の手番での復帰を個別に確認します。

## 未確認範囲と残るリスク

- iPhone Safari実機での接続切断、操作ボタンの無効化、再接続、最新状態への復帰は未確認です。ユーザーによる実機確認後もIssue #29はその指示なくCloseしません。
- 自動テストは決定的なWorker・ブラウザーmockで対象遷移を確認します。Cloudflare本番障害やすべての通信順序を網羅するものではありません。
- 2026-11-01の実際の停止原因は未特定です。今回の修正がその停止を再現・説明したとは主張しません。

## 追補修正の自動検証

- `tests/diagnostics.test.ts`、`tests/online-game-revision.test.ts`、`tests/step14-0-1.test.ts`：3ファイル成功、失敗0。診断イベント優先保持と永続化、revision管理、既存のWorkerレート制限・同一requestId重複防止を確認。
- `npm test`：81テストファイル成功、失敗・skip 0。
- `npm run build`：成功（TypeScript検査、Vite build、PWA shell生成）。
- `npm run typecheck:worker`：成功。
- `tests/browser-online-waiting-room.py`：Python構文検査成功。結果先行の通常打牌で余分な同期がないこと、欠落状態からの1回の同期、同期レート制限後の再接続、利用者向けエラー表示、同一requestId維持のシナリオをChromium／WebKit双方に追加。
- Browser UIはCodex Cloud内の既知のChromium Crashpad起動制限によりローカル実行していません。Chromium／WebKitの実行結果はこのコミットに対するGitHub Actionsを確認後に追記します。
- `git diff --check`：成功。レート制限を誘発する本番要求試験は実施していません。

コミットSHA、Actions、Deploy gate、Worker／Pages公開状態はmain反映後にここへ追記します。Issue #29はiPhone Safari実機再確認までOpenのままです。
