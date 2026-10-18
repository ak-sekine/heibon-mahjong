# Step 13.7.1：自動ターン処理テストの安定化

実施日：2026-10-18

実装commit：`f3286d150f2438718e373318aba76cea679db07e`

## 発生していた問題

Step 13.7 の GitHub Pages workflow 初回実行で、`tests/automatic-turns.test.ts` が `the next CPU wait was not scheduled` で失敗しました。既存の記録では1,040件中1件失敗し、失敗jobの再実行では成功しています。

## 原因調査

`manualWait()` はCPU待機の登録を配列に保存します。従来の `nextPending()` は登録を最大10回の `setImmediate()` で探し、状態確認の `flush()` もPromiseのmicrotaskを2回だけ実行していました。どちらもrunnerの状態変化そのものを待つ同期方法ではありません。

さらに、キャンセルと新ゲーム開始を確認するテストだけ、CPUの打牌選択に乱数源を注入せず、既定の `Math.random` を使っていました。CPUの打牌後に人間のロン・鳴きが必要になる局面では、runnerはその判断を待つために停止し、次のCPU待機を登録しません。CPUの打牌によって手番が人間へ移る場合も同様にrunnerは正常終了します。このテストは3回分のCPU待機を常に期待していたため、合法な進行経路を「待機が登録されない」と誤認する状態でした。

同じ初期seedと `Math.random` を使った局面の再現では、CPUの待機を2回解放した後、CPUの鳴きを含む進行で `awaiting-discard`・人間手番へ移り、runnerが待機を終了する経路を確認しました。この時点では次のCPU待機が存在せず、従来の `nextPending()` なら同じ `the next CPU wait was not scheduled` を出します。原因はテスト入力の非決定性と待機登録の固定回数pollingです。`AutomaticTurnRunner`、`GameController`、CPU打牌処理に不具合がある証拠は得られませんでした。

手動待機を使う対象テストでは `chooseRandomDiscard` を注入しているため、通常の非同期CPU思考処理 `chooseShantenDiscardAsync()` のタイマーyieldは使いません。runnerの待機継続は `await wait` の後に実行されますが、CPU待機の登録時刻を固定microtask数で推定する必要はありません。

## 修正

- `manualWait()` に次の待機登録をPromiseで受け取る通知を追加し、`nextPending()` は登録通知を待つようにしました。
- 固定回数の `setImmediate()` pollingと2回固定のmicrotask `flush()`を削除しました。CPUが次の待機へ進むテストでは登録通知を待ち、最後のCPU手番ではrunnerのPromise完了を待ちます。
- キャンセル確認テストにも固定乱数源を注入し、CPU1〜CPU3が人間の判断を挟まず進行する経路を再現可能にしました。
- 手動待機に依存する3件へ5秒のテストtimeoutを設定しました。これは待機Promiseが解決されない場合の不具合検出用です。

テストコードだけを変更しました。ゲーム処理、役判定、画面、CPU戦略、Actionsのnpm test実行条件は変更していません。

## 検証

詳細なコマンドと回数は[Step 13.7.1 検証記録](../verification/step13.7.1/README.md)を参照してください。対象テストの最終反復は30回すべて成功し、全42テストファイル、ビルドも成功しました。

## 未解決事項

元のGitHub Actions失敗attemptの詳細ログは今回取得できず、GitHub APIから確認できたのは成功した再実行attemptのログでした。失敗時のassertion内容とローカルで再現したrunner停止経路、および修正後の反復結果からテスト側の原因を判断しています。
