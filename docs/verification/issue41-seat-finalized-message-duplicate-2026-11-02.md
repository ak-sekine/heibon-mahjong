# Issue #41 追加修正 — 座席確定メッセージの重複表示

## 実機で見つかった事象

ユーザーから、Issue #41の実装・自動検証・本番公開後に行ったiPhone Safari実機確認で、待機画面の操作ボタンは正常だった一方、座席確定後の「座席が確定しました。ホストはオンライン対局を開始できます。」が二重表示されたと報告を受けた。表示位置は、ルームコードより上の状態メッセージと、プレイヤー一覧下の黄色い通知枠。これは修正前の実機結果であり、修正後のiPhone Safari確認はユーザーから報告されるまで未確認とする。

## 原因と修正

`src/online/waiting-room.ts`の`renderState()`は、初回の座席確定状態で同じ文言を上部`#online-status`と下部`#online-finalized-message`の両方へ設定していた。両要素の表示条件も成立するため、同じ案内が二か所に出ていた。

下部`#online-finalized-message`は共通エラー欄ではなく、座席確定または再戦準備の案内専用。エラー通知は隣接する別要素`#online-error`（`role="alert"`）、接続状態は`#online-connection`が担当する。修正では下部欄を再戦準備中だけ表示する。通常の座席確定状態は上部メッセージに一本化し、再戦準備案内、エラー、接続状態の処理は維持する。Worker、CPU補充、座席確定条件、ゲーム進行処理は変更しない。

## 回帰確認

`tests/browser-online-waiting-room.py`に、ホストと非ホストの座席確定後に上部の状態文言が正しいこと、下部の重複欄が隠れていることを検査する回帰アサーションを追加した。下部欄が再戦準備中に引き続き表示されることと、サーバーエラーが独立した`#online-error`に表示されることも確認する。既存の待機ルームBrowser UIシナリオが扱う準備完了→座席確定→対局開始、CPU補充、非ホスト、退出、再接続の確認を継続する。

- `npm test`：成功（76テストファイル、失敗0、skip 0）
- `npm run build`：成功（TypeScript検査、Vite production build）
- `python -m py_compile tests/browser-online-waiting-room.py`：成功
- `python tests/test_browser_regressions_selection.py`：成功（5件）
- Chromium／WebKit Browser UI：GitHub Actions実行後に記録
- Issue #41追加修正の本番公開：GitHub Actions Deploy gate結果を確認後に記録
- 修正後iPhone Safari：未確認。自動テストやChromium／WebKitの結果で代替しない

## 修正後のiPhone Safari確認項目

1. 準備完了→席を確定→対局開始ができ、座席確定文言はルームコード上部の一か所だけに表示される。
2. 座席確定後もCPU席と東南西北の割り当てが表示され、ホストには対局開始、非ホストにはホスト専用操作が表示されない。
3. エラー、接続・再接続、プレイヤーの準備状態が引き続き見える。
4. 退出後の再参加・再接続で、参加席と状態が正しく復元される。
5. 320〜430px程度の縦向き画面で通知・ボタンが重ならず、横はみ出しがない。

実機結果とIssue #41のClose判断はユーザーの再確認後に記録する。
