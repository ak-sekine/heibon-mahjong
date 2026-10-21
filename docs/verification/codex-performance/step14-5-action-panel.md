# Step 14.5 — 処理時間記録

日付: 2026-10-21 UTC

工程時間はコマンド実行時間または明示的に記録した時刻だけを記載します。計測されていない工程時間は推測していません。

| 工程 | 実測・状態 | 根拠 |
| --- | --- | --- |
| 既存実装の調査 | 全工程時間は未計測。確認済み時刻の区間は13:12:40–13:14:30 UTC（1分50秒） | この区間は調査・設計中のcheckpoint間隔であり、調査全体の時間とはみなしません。 |
| 共通インターフェース設計 | 未計測 | 工程境界の時刻を記録していません。 |
| ActionPanel実装 | 未計測 | 工程境界の時刻を記録していません。 |
| ローカル・オンラインへの組み込み | 未計測 | 工程境界の時刻を記録していません。 |
| `npm test` | 統合後の最終成功ラン20.18秒 | Node test runner報告19.97秒、コマンド呼出しのwall time20.18秒。52/52成功。 |
| `npm run build` | 統合後の最終成功ラン4.01秒 | コマンド呼出しのwall time。TypeScriptとVite build成功。Vite処理は1.07秒。 |
| Browser UIシナリオのPython構文解析 | 成功、所要時間未計測 | `ast.parse`で`tests/browser-action-controls.py`と`tests/browser-action-panel.py`を解析。 |
| `git diff --check` | 成功、所要時間未計測 | 修正後に実行。 |
| Browser UI Actions | 初回runは2分29秒、2回目を確認中 | `39609998145`のBrowser UI jobは13:40:14–13:42:43 UTC。`39609998208`のverify jobは46秒で成功、Browser UI jobは13:40:14–13:42:42 UTCで同じassertionにより失敗し、その後のWorker deploy・本番通信・Pages build/deployはskip。修正後のrun結果・待ち時間は完了後に最終報告します。 |
| 記録・ROADMAP更新 | 未計測 | 工程境界の時刻を記録していません。 |

## 検証失敗と修正回数

- `npm run build`は初回に1回失敗しました。`seatNames`の統合漏れと、プロジェクトのTypeScript設定で`NodeList`を直接反復できない箇所を直し、次のbuildは成功しました。
- `npm test`は最終成功前に2回失敗しました。1回目はNode 24のstrip-only TypeScript実行がparameter propertyを受け付けない既存テストfixtureと、`renderSelection()`が操作DOMを更新する旧前提のテストが原因でした。fixtureを実行環境に適合させ、表示条件テストをActionPanel状態アダプターへ移しました。
- 2回目はFake DOMの親子構造不足、ローカルアダプターのnull状態判定、Ron controlsの初期hidden期待値の3件でした。テストハーネスと判定・期待値を直し、最終ラン52/52成功しました。
- Browser UIは2つの独立runが同じ1つの古いassertionで失敗しました。既存の`browser-action-controls.py`は他家の手番でも操作ボタンが必ず1個以上存在する前提でしたが、実行可能な操作だけを表示する方針では0個になるのが正しいため、空配列を許容し、表示ボタンがある場合のタッチ寸法・配置assertionを維持しました。新しいBrowser UI専用シナリオの失敗は確認されていません。修正後のActions実行結果・待ち時間は完了後に最終報告します。

失敗したコマンドの実行時間は個別計測していません。上記に時間を補っていません。
