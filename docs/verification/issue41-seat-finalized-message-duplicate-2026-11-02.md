# Issue #41 追加修正 — 座席確定メッセージの重複表示

## 実機で見つかった事象

追加修正前のiPhone Safari実機確認では、待機画面のボタン操作は「動作は問題ありません」と総括報告された一方、座席確定後の「座席が確定しました。ホストはオンライン対局を開始できます。」が二重表示された。表示位置は、ルームコードより上の状態メッセージと、プレイヤー一覧下の黄色い通知枠だった。修正後の確認結果は本記録末尾に追記する。

## 原因と修正

`src/online/waiting-room.ts`の`renderState()`は、初回の座席確定状態で同じ文言を上部`#online-status`と下部`#online-finalized-message`の両方へ設定していた。両要素の表示条件も成立するため、同じ案内が二か所に出ていた。

下部`#online-finalized-message`は共通エラー欄ではなく、座席確定または再戦準備の案内専用。エラー通知は隣接する別要素`#online-error`（`role="alert"`）、接続状態は`#online-connection`が担当する。修正では下部欄を再戦準備中だけ表示する。通常の座席確定状態は上部メッセージに一本化し、再戦準備案内、エラー、接続状態の処理は維持する。Worker、CPU補充、座席確定条件、ゲーム進行処理は変更しない。

## 回帰確認

`tests/browser-online-waiting-room.py`に、ホストと非ホストの座席確定後に上部の状態文言が正しいこと、下部の重複欄が隠れていることを検査する回帰アサーションを追加した。下部欄が再戦準備中に引き続き表示されることと、サーバーエラーが独立した`#online-error`に表示されることも確認する。既存の待機ルームBrowser UIシナリオが扱う準備完了→座席確定→対局開始、CPU補充、非ホスト、退出、再接続の確認を継続する。

- `npm test`：成功（76テストファイル、失敗0、skip 0）
- `npm run build`：成功（TypeScript検査、Vite production build）
- `python -m py_compile tests/browser-online-waiting-room.py`：成功
- `python tests/test_browser_regressions_selection.py`：成功（5件）
- 最初のコミット`9dc494b341566ad4933f4caea62e4c8e4e4f04ac`のrun [#41473236060](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41473236060)：`verify`成功後、Chromium／WebKitが追加したエラー通知チェックで失敗。テストmockが実際の`action-result`拒否を通さずにraw WebSocket errorを送っていたため、テストfixture側の誤りと特定。matrix auditも失敗しDeploy gateは不成立、Worker／Pagesは公開されなかった。
- テストmockを実際のaction-result拒否経由に直したコミット`5d9121fa6e5b2f00c441c9c51c85878ea22a0a5f`をmainへpush。最終run [#41474025754](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41474025754) は`docs-check`、`verify`（回帰テスト・Worker型検査・Pages build）、Chromium、WebKit、`browser-ui-matrix-audit`、`release-freshness`、`deploy-worker`、`production-test`、`pages-build`、`pages-deploy`がすべてsuccess。mainと`origin/main`のSHAは同じ。
- 文書更新run [#41476660809](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41476660809)：main SHA `cfb7e17bf75d9b284b81a0d950091c5371c9ca1d`、completed/success。`docs-check`はsuccess。`verify`、Browser UI、matrix audit、release freshness、Worker／Pages関連ジョブは、文書のみの変更分類による正常なskip（検証・公開の実行を意味しない）。

## 当初の修正後iPhone Safari確認項目

1. 準備完了→席を確定→対局開始ができ、座席確定文言はルームコード上部の一か所だけに表示される。
2. 座席確定後もCPU席と東南西北の割り当てが表示され、ホストには対局開始、非ホストにはホスト専用操作が表示されない。
3. エラー、接続・再接続、プレイヤーの準備状態が引き続き見える。
4. 退出後の再参加・再接続で、参加席と状態が正しく復元される。
5. 320〜430px程度の縦向き画面で通知・ボタンが重ならず、横はみ出しがない。

## 最終のiPhone Safari実機確認 — 2026-11-03

ユーザー本人から次の2点がOKと報告された。

- 座席確定後のメッセージが、ルームコードより上の1か所だけに表示される。
- プレイヤー一覧の下に同じメッセージが重複表示されない。

追加修正前のボタン操作は「動作は問題ありません」と総括報告あり。個別の操作条件それぞれの実機OK報告とはみなさない。エラー通知、再接続、CPU補充、非ホスト操作、個別のボタン状態遷移、その他の表示幅は実機で個別確認されておらず未確認。NGの報告はない。iPhone Safari以外の機種情報、iOSバージョン、確認時刻は報告されていないため補完しない。

最終Deploy run [#41474025754](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41474025754)はmain SHA `5d9121fa6e5b2f00c441c9c51c85878ea22a0a5f`で、`verify`、Chromium／WebKit Browser UI、matrix audit、release freshness、Worker deploy、production test、Pages build/deployがsuccess。これは自動検証・公開結果で、実機未確認項目のOK根拠にはしない。

操作ボタン仕様と対応自動検証・公開は完了し、座席確定メッセージ重複の解消はiPhone Safariで確認された。実機未確認の項目は未確認と明記しており、Issue #41に未解決の必須受け入れ条件はないと判定。Issue #41をcompletedとしてCloseする。
