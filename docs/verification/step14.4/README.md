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

## Browser UI verification

`39590650104`（SHA `7d5bf44a67294ffe757e0f9486da417f4cd8e3ca`）では`verify`が成功しました。`browser-ui`は作成フォームを閉じた後のフォーカス復帰assertionで失敗し、Worker deploy・production test・Pages build/deployはskipされました。フォーカス復帰を修正した追従コミットで再実行します。

シナリオでは専用フォーム、入力条件、表示名共有、セッション中の安全制限、ルーム作成・参加・退出、再接続、オンライン対局操作、および320・375・390・430px幅を確認します。ローカルではChromiumを起動していません。

## 実機確認

iPhone Safari実機は未確認です。GitHub ActionsのChromium結果をSafari実機結果とは扱いません。
