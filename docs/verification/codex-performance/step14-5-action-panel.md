# Step 14.5 — 処理時間記録

日付: 2026-10-21 UTC

工程時間はコマンド実行時間または明示的に記録した時刻だけを記載します。計測されていない工程時間は推測していません。

| 工程 | 実測・状態 | 根拠 |
| --- | --- | --- |
| 既存実装の調査 | 全工程時間は未計測。確認済み時刻の区間は13:12:40–13:14:30 UTC（1分50秒） | この区間は調査・設計中のcheckpoint間隔であり、調査全体の時間とはみなしません。 |
| 共通インターフェース設計 | 未計測 | 工程境界の時刻を記録していません。 |
| ActionPanel実装 | 未計測 | 工程境界の時刻を記録していません。 |
| ローカル・オンラインへの組み込み | 未計測 | 工程境界の時刻を記録していません。 |
| `npm test` | 成功。52/52。 | 統合後の最終成功ランはNode test runner 19.97秒、コマンドwall time 20.18秒。テスト修正後の再実行も52/52で、runner 19.53秒。GitHub Actionsの最終`Run regression tests`は22秒。 |
| `npm run build` | 統合後の最終成功ラン4.01秒 | コマンド呼出しのwall time。TypeScriptとVite build成功。Vite処理は1.07秒。 |
| Browser UIシナリオのPython構文解析 | 成功、所要時間未計測 | `ast.parse`で`tests/browser-action-controls.py`、`tests/browser-action-panel.py`、`tests/browser-table-ui.py`を解析。 |
| `git diff --check` | 成功、所要時間未計測 | 修正後に実行。 |
| Browser UI Actions | 最終standalone Browser UI job success、7分17秒。Deploy内Browser UI success、6分21秒。 | SHA `837ed96`のBrowser UI job `39614995656`: 14:13:43–14:21:00 UTC。Browser test step 14:14:46–14:20:56 UTC。Deploy run `39614996215`のBrowser UI job: 14:13:44–14:20:05 UTC、Browser test step 14:14:44–14:19:58 UTC。 |
| Deploy Actions | Worker deploy 29秒、本番通信検証42秒、Pages build 24秒、Pages deploy 9秒。 | run `39614996215`: Worker deploy 14:20:08–14:20:37 UTC、本番通信テスト14:20:40–14:21:22 UTC、Pages build 14:21:25–14:21:49 UTC、Pages deploy 14:27:51–14:28:00 UTC。全jobは14分20秒で完了。Pages deploy jobはrunner割り当てまで14:21:49–14:27:51 UTCの6分02秒waitingでした。 |
| 記録・ROADMAP更新 | 未計測 | 工程境界の時刻を記録していません。 |

## 検証失敗と修正回数

- `npm run build`は初回に1回失敗しました。`seatNames`の統合漏れと、プロジェクトのTypeScript設定で`NodeList`を直接反復できない箇所を直し、次のbuildは成功しました。
- `npm test`は最終成功前に2回失敗しました。1回目はNode 24のstrip-only TypeScript実行がparameter propertyを受け付けない既存テストfixtureと、`renderSelection()`が操作DOMを更新する旧前提のテストが原因でした。fixtureを実行環境に適合させ、表示条件テストをActionPanel状態アダプターへ移しました。
- 2回目はFake DOMの親子構造不足、ローカルアダプターのnull状態判定、Ron controlsの初期hidden期待値の3件でした。テストハーネスと判定・期待値を直し、最終ラン52/52成功しました。
- Browser UI／統合テストは8つの原因で修正しました。内訳は非手番時の空表示、結果ダイアログの開き方、dialog下の次局ボタン、閉じたメニュー内の新規対局ボタン、CPUの鳴きによるホスト再手番を扱わないオンラインテスト、二重ActionPanelの曖昧な選択肢selector、同selectorの次局操作、別fixtureのIDを比較したプライバシー検査です。最後のプライバシー検査修正は画面と操作欄を同じMatchStateから描き、検査条件を弱めずに誤検出を除きました。修正後のBrowser UIはすべてsuccessです。
- Browser UI jobが単独実行とDeploy再利用で重複するため、修正前の同じ原因がそれぞれのActions runに現れました。詳細なrun ID、結論、後続Deployへの影響は[Step 14.5検証記録](../step14.5/README.md)にあります。

失敗したコマンドの実行時間は個別計測していません。Pages deployのjob待ち時間は実測していますが、job自体は9秒で成功しました。
