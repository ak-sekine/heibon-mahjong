# Production test timeout diagnostics

実施日：2026-10-23

## 対象と結果

- タイムアウトした実行：[Actions run 39975813514](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39975813514)
- 調査対象コミット：`3101181ab1227412c5e43172bf9a9f222ec037da`
- 診断テスト実行：[Actions run 39990797413](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39990797413)
- 診断テストのコミット：`5cb0bed3c70221c78f0b06b5cc73708b35b3bc07`
- Worker：`https://heibon-mahjong-online.ak-sekine.workers.dev`
- 本番テスト：成功。5シナリオすべて成功しました。
- Worker の再デプロイ：なし。診断用 workflow は既存 Worker URL を使い、テスト専用ジョブだけを実行しました。
- ゲーム本体、Worker、WebSocketプロトコルの変更：なし。

ローカル検証は `npm test`（54/54）、`npm run build`、`npm run typecheck:worker`、`node --check tests/online-production.mjs`、`git diff --check` が成功しました。

## タイムアウト箇所付近の状態遷移

診断ログの経過時間はテストプロセス開始からの値です。

| 経過 | クライアント | 観測 |
| ---: | --- | --- |
| 2,456 ms | host / guest | `passGameDecisions()` は判断待ちなしで終了。host は revision 2、guest は revision 1。どちらにも自分の未回答判断はありませんでした。 |
| 2,456 ms | guest | revision 2、`awaiting-draw` を受信。判断待ちはありませんでした。 |
| 2,527–2,528 ms | host / guest | revision 3、human の `awaiting-discard` を両方が受信。`waitForHumanTurn()` は guest の条件成立を検出し、待機開始から 72 ms で成功しました。両ソケットは open でした。 |

この再実行では、host と guest の受信 revision に一時的な差がありましたが、guest は revision 2、3 を受信して待機条件を満たしました。前回のタイムアウトが発生した host 打牌直後の判断待ちは再現しませんでした。

## 後続の CPU 局面で確認した遅延判断

別の CPU 進行局面では、`passGameDecisions()` が 2,922 ms 時点で判断待ちなしとして終了した際、host は revision 6、guest は revision 5 でした。その後、host は revision 8 の `awaiting-call` を受信し、自分の `call` 判断が未回答（`decisionAnswered: false`）であることを 3,151 ms と 3,331 ms 時点で報告しました。診断ログには、その窓への `pass-call` 送信・応答はありません。

再接続した guest では revision 8 の後に revision 9（`awaiting-draw`）が観測されました。host はその間 revision 9 を記録せず、3,453 ms 時点でテストにより接続を閉じました。このログだけでは、host が revision 9 を受信しなかった理由や、判断窓が進んだ Worker 内部の契機は分かりません。CPU Alarm の実行有無もテストログからは確認できません。

この後続局面は、「判断待ちなし」の確認後に別クライアントへ判断状態が遅れて届くことと、その判断がテストから回答されないことを示しています。ただしこれは問題の `waitForHumanTurn()` より後の局面で、テスト全体は成功しました。前回タイムアウトの直接原因を示す証拠ではありません。

## 原因判定

- **判断待ちの取りこぼし：未確定。** 後続局面では遅れて届いた未回答 `call` 判断を観測しました。一方、問題の待機区間では未回答判断は観測されず、human turn 条件が成立しました。前回 run に状態ログがないため、同じことがタイムアウト直前に起きていたかは分かりません。
- **CPU進行停止：今回の再実行では確認されませんでした。** CPU席の revision 更新があり、CPU進行のテスト条件も成功しました。Alarm 自体の実行有無は未確認です。
- **WebSocket配信：今回の対象区間では継続していました。** 両接続が open の間に guest は遅れていた revision を受信しました。前回タイムアウト時に配信が停止したのか、受信側で検出できなかったのかは未確認です。
- **待機条件／`Promise.race()`：今回の再実行では誤失敗しませんでした。** guest revision 3 が条件を満たし、待機は成功しました。前回に同じ条件を満たす状態が受信されていたかは記録がなく未確認です。

## 推奨する次の修正

最も根拠のある候補はテスト側の同期方法です。`passGameDecisions()` の一度きりの状態確認が終わった後も新しい判断窓を監視し、`waitForHumanTurn()` に切り替わった後に届いたロン／鳴き判断へ回答できる構造にします。待機時間の延長では解決しません。

この候補は今回観測した後続局面と整合しますが、元のタイムアウトの根本原因としては未確定です。ゲーム進行処理や Alarm、WebSocket 配信を修正する根拠は得られていません。

## 同期待機の安定化（2026-10-24）

### 変更

- 実装コミット：[0c7e05a](https://github.com/ak-sekine/heibon-mahjong/commit/0c7e05a3e83eeb16d35968da712f6d1ff93b4a7d)
- テスト専用変更で、ゲーム本体、Worker、WebSocket プロトコル、オンライン UI は変更していません。
- `tests/online-production-sync.mjs` に共通待機処理を追加しました。待機リスナーを登録してから両クライアントの受信済み状態を再走査し、各クライアントでは最大revisionを最新状態として扱います。
- 人間手番待機とCPU進行待機の両方で、届いたロン／鳴き判断を見送ります。回答には判断の `windowId` と `expectedGameRevision` を使い、同じwindowへの再送を防ぎます。`stale_revision` と `stale_decision` 後は届いた状態を確認し、他の操作エラーは失敗にします。
- 人間手番は、revisionが指定値以降であること、`playing`／`awaiting-discard`、人間の手番、本人の認証済みビュー、捨て牌候補があること、未回答判断がないことを確認します。局・対局終了状態は従来どおり呼び出し側に返します。
- CPU進行の確認条件は維持しました。CPUの河が増えるか、従来の終局状態に達した場合に成立します。途中の人間手番があれば、同じ期限と監視の中で打牌して継続します。
- 人間手番の期限は20秒、CPU進行の期限は15秒です。各待機で期限を一度だけ設定し、判断回答後も延長しません。成功・タイムアウト・切断時に共通タイマー、メッセージ待機、ソケットのclose/errorリスナーを解除し、進行中操作のPromiseも回収します。
- `PRODUCTION_TEST_DIAGNOSTICS=1` は既存workflow設定のまま維持しました。判断窓の検出・回答・解決と待機解除を追跡できます。手牌、トークン、ルームコード、requestIdは追加ログに含めません。

### ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。55ファイルすべて成功。同期回帰テスト18ケースを含みます。 |
| `npm run build` | 成功。 |
| `npm run typecheck:worker` | 成功。 |
| `node --check tests/online-production.mjs` と同期ヘルパー | 成功。 |
| `git diff --check` | 成功。 |

同期回帰テストは擬似WebSocketで到着順を制御し、遅延call／ron、受信済み判断、重複状態、連続判断、CPU待機中の判断、stale応答、切断・タイムアウト後の後始末、CPU進行停止の誤成功防止を確認します。実ネットワークは使いません。

### 本番結合テスト

3回とも同じコミット `0c7e05a3e83eeb16d35968da712f6d1ff93b4a7d` を対象に成功しました。run attempt 1 はmainへのpushで自動起動し、attempt 2 と3は成功した同じproduction-testジョブを再実行しました。

| Attempt | Actions実行 | 結果 | 5シナリオ | call／ron検出と回答 | timeout |
| ---: | --- | --- | --- | --- | --- |
| 1 | [run 40044828781](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40044828781)、attempt 1 | 成功 | 5/5成功 | 検出0件、回答0件 | なし |
| 2 | [run 40044828781](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40044828781)、attempt 2 | 成功 | 5/5成功 | 検出0件、回答0件 | なし |
| 3 | [run 40044828781](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40044828781)、attempt 3 | 成功 | 5/5成功 | 検出0件、回答0件 | なし |

成功した5シナリオは `two-human-game-host-cpu-handoff-reconnect`、`disconnect-reconnect`、`host-handoff-one-human-three-cpu`、`four-humans-zero-cpu`、`three-humans-one-cpu` です。3回の本番実行では実際のロン／鳴き判断窓が発生せず、この競合の本番再現にはなっていません。同期処理の判断対応は、上記の決定的なローカル回帰テストで確認しています。

3回の成功は安定性を示す観測結果であり、すべての潜在不具合が解消した証明ではありません。前回の本番タイムアウトの根本原因も未確定のままです。

### deploy workflowの誤起動

同期テスト専用の変更にもかかわらず、push時にDeploy workflow [run 40044828792](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40044828792) が起動しました。元の `.github/workflows/deploy.yml` は従来の `tests/online-production.mjs` だけをignoreし、新規の同期ヘルパーとテストを除外していませんでした。

再発防止として、コミット [`c81ed5a`](https://github.com/ak-sekine/heibon-mahjong/commit/c81ed5a) でこの2ファイルをdeploy workflowの `paths-ignore` に追加しました。この修正のpushではDeploy workflowは起動していません。今回誤起動したrunは最後の確認時点で `browser-ui` ジョブが実行中、`deploy-worker` ジョブは未開始でした。runの最終結果とWorker再デプロイの有無は未確認です。
