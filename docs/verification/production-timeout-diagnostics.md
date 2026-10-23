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
