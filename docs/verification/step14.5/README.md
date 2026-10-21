# Step 14.5 検証

**実施日:** 2026-10-21
**実装記録:** [Step 14.5 — 操作欄のソースコード共通化](../../development/step-14.5.md)

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。52/52。統合後の最終ランの実測時間20.18秒（Node test runner: 19.97秒）。 |
| `npm run build` | 成功。TypeScript検査とVite build。統合後の最終ランの実測時間4.01秒。 |
| Browser UI Python構文解析 | 成功。`tests/browser-action-controls.py`と`tests/browser-action-panel.py`をPython `ast.parse`で確認。 |
| `git diff --check` | 成功。 |

共通ActionPanelのDOM状態更新・イベント委譲と、ローカル／オンライン状態アダプターをゲーム進行から切り離して単体テストしています。詳細な状態ケースと検証の修正履歴は[処理時間記録](../codex-performance/step14-5-action-panel.md)にあります。

## GitHub Actions Browser UI

`.github/workflows/browser-ui.yml`に`tests/browser-action-controls.py`と`tests/browser-action-panel.py`を追加しました。既存のBrowser UIシナリオもワークフローに残しています。main pushで`deploy.yml`がこのワークフローを呼び出し、Worker本番通信テストとPages build/deployまで実行します。

main SHA `32518a8`のBrowser UI run `39609998145`とDeploy run `39609998208`は同じシナリオのassertionで失敗しました。`browser-action-controls.py`が他家の手番でもボタンが1個以上表示される前提だったため、実行可能な操作がなく全操作ボタンが隠れる局面を許容し、表示ボタンのサイズ・配置検査は維持しました。続くSHA `3437334`のBrowser UI run `39610619687`とDeploy run `39610620196`も失敗しました。追加したシナリオがツモ・ロン直後に結果ダイアログが自動で開くと期待していたため、「結果を見る」が表示され、操作後に開く従来動作に合わせました。2回目のDeploy runでも`verify`は成功し、Browser UI失敗によりWorker deploy・本番通信・Pages build/deployはskipされました。修正後のpushで3回目のActions再検証中です。最終結果と幅別レポートは最終報告にも記載します。Actionsの結果をローカルChromium実行とは扱いません。

Browser UIシナリオは共通の`ActionPanel`クラスを両モードのテンプレートインスタンスで使い、同じ状態が同じ表示になること、異なるハンドラーへイベントが渡ること、合法操作だけが表示されることを確認します。操作送信待ち、判断期限切れ、ロン・鳴き、カン、結果操作、320・375・390・430pxでの画面幅とボタン寸法、相手の非公開物理IDがDOMに露出しないことも確認対象です。

## 実機確認

Codex Cloud内ではChromiumを起動していません。iPhone Safari実機は未確認です。
