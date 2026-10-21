# Step 14.4 検証

**実施日:** 2026-10-21
**実装:** [Step 14.4開発記録](../../development/step-14.4.md)

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。修正後50/50。テストランナー実測24.61秒（11:21:21開始、11:21:46終了）。 |
| `npm run build` | 成功。修正後TypeScript検査とVite build。実測3.43秒。 |
| Browser UIスクリプト構文解析 | 成功。Python `ast.parse`。 |
| `git diff --check` | 成功。修正後に再確認。 |

最終ローカル再検証も成功しました。11:30:21 UTC開始の`npm test`は50/50で約29.48秒、11:30:52 UTC開始の`npm run build`は3.79秒でした。テストスクリプトのassertion更新後にPython構文解析と`git diff --check`も成功しています。

## Browser UI verification

`39590650104`（SHA `7d5bf44a67294ffe757e0f9486da417f4cd8e3ca`、11:15:50–11:20:05 UTC）は`verify`が成功しました。`browser-ui`は作成フォームを閉じた後のフォーカス復帰assertionで失敗し、Worker deploy・production test・Pages build/deployはskipされました。フォーカス復帰を修正し、Escapeによる閉じる操作とフォーカス復帰を含むテストは変更せず維持しました。

`39591517679`（SHA `2bd28993afb27406897bf6de8f631cb5a3384429`、11:22:49–11:28:35 UTC）も`verify`は成功しました。Browser UIではフォーム分離・ルーム参加後の遷移・共有名などが確認された後、成功時メッセージの固定文言検査で失敗しました。座席確定済みルームでは既存状態メッセージが優先されるため、固定文言だけを外し、待機画面と非空の状態表示を引き続き検査するようにしました。Worker deploy・production test・Pages build/deployはskipです。

このassertion更新後の最終ローカル`npm test`、build、構文解析、diff検査はいずれも成功しています。3回目のActionsでBrowser UIとdeploy系jobの結果を確認します。

シナリオでは専用フォーム、入力条件、表示名共有、セッション中の安全制限、ルーム作成・参加・退出、再接続、オンライン対局操作、および320・375・390・430px幅を確認します。ローカルではChromiumを起動していません。

## 実機確認

iPhone Safari実機は未確認です。GitHub ActionsのChromium結果をSafari実機結果とは扱いません。
