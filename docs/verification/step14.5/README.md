# Step 14.5 検証

**実施日:** 2026-10-21
**実装記録:** [Step 14.5 — 操作欄のソースコード共通化](../../development/step-14.5.md)

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。52/52。テスト修正後のローカルrunner計測19.53秒。統合直後の成功runはwall time20.18秒（Node test runner: 19.97秒）。最新Actionsの回帰テストstepも成功（22秒）。 |
| `npm run build` | 成功。TypeScript検査とVite build。統合後の最終ランの実測時間4.01秒。 |
| Browser UI Python構文解析 | 成功。`tests/browser-action-controls.py`、`tests/browser-action-panel.py`、`tests/browser-table-ui.py`をPython `ast.parse`で確認。 |
| `git diff --check` | 成功。 |

共通ActionPanelのDOM状態更新・イベント委譲と、ローカル／オンライン状態アダプターをゲーム進行から切り離して単体テストしています。詳細な状態ケースと検証の修正履歴は[処理時間記録](../codex-performance/step14-5-action-panel.md)にあります。

## GitHub Actions Browser UI

`.github/workflows/browser-ui.yml`に`tests/browser-action-controls.py`と`tests/browser-action-panel.py`を追加しました。既存のBrowser UIシナリオもワークフローに残しています。main pushで`deploy.yml`がこのワークフローを呼び出し、Worker本番通信テストとPages build/deployまで実行します。

main SHA `837ed96e0e66a74b6b08b67cb6b335a3cd31decc`で最終検証しました。Browser UI run [39614995656](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39614995656) はsuccess。Deploy run [39614996215](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39614996215) では回帰テスト、Worker型検査、Browser UI、Worker deploy、本番通信テスト、Worker URLを含むPages buildがすべてsuccessです。Pages deploy jobだけは`github-pages` environmentで`waiting`となっており、Actions上の承認待ちのため未完了です。iPhone Safari実機確認は未実施です。

Browser UIと統合テストの初回失敗・修正は、原因ごとに以下の8件でした。各pushではstandalone Browser UIとDeploy内Browser UIが重複実行される場合があります。

1. `browser-action-controls.py`が非手番でもボタンが1つ表示される前提だったため、0件を許容してサイズ検査は表示ボタンに継続しました（`39609998145` / `39609998208`）。
2. 追加シナリオが和了直後に結果ダイアログが自動で開くと期待していたため、「結果を見る」を押す実動作に修正しました（`39610619687` / `39610620196`）。
3. 結果ダイアログを閉じずに次局ボタンを押していたため、閉じてから操作するよう修正しました（`39611329290` / `39611329424`）。
4. 新規対局ボタンが閉じたメニュー内にあり、Browser UI手順でメニューを開いていませんでした。実際のUI順にメニューを開いてから押すよう修正しました（`39611984823`）。
5. 既存のオンライン統合テストがCPUのポンでホストに手番が戻る局面を処理しておらず、ゲスト手番のassertionが失敗しました。サーバーviewの合法打牌を使ってホスト手番も進めます（Deploy `39611984983`）。本番ゲームコードは変更していません。
6. Browser ActionPanelテストの選択肢クリックが二つのパネルをまたぐ`nth(1)`指定だったため、オンラインパネルを直接指定しました（`39612673428` / `39612673531`）。
7. 次局クリックにも同じ曖昧な選択が残っていたため、オンラインパネル内のボタンを指定しました（`39613401366` / `39613402182`）。
8. `browser-table-ui.py`が卓と操作欄に異なるfixtureを描き、共有された固定物理IDを非公開ID漏えいと誤検出していました。同じ`MatchState`から卓とActionPanelを描くようにして、DOM全体の非公開ID検査は維持しました（`39614062727` / `39614062868`）。

最終Browser UI runでは、ActionPanelシナリオが320・375・390・430pxすべて通過しました。既存の卓・カン・モバイル検査は300 UI scenes、432 meld layouts、28 square-table scenes、10 kan-action layoutsを通過しました。Actionsの検査はCodex環境内でChromiumを起動した検査とは扱いません。

Browser UIシナリオは共通の`ActionPanel`クラスを両モードのテンプレートインスタンスで使い、同じ状態が同じ表示になること、異なるハンドラーへイベントが渡ること、合法操作だけが表示されることを確認します。操作送信待ち、判断期限切れ、ロン・鳴き、カン、結果操作、320・375・390・430pxでの画面幅とボタン寸法、相手の非公開物理IDがDOMに露出しないことも確認対象です。

## 実機確認

Codex Cloud内ではChromiumを起動していません。iPhone Safari実機は未確認です。
