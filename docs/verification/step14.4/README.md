# Step 14.4 検証

**実施日:** 2026-10-21
**実装:** [Step 14.4開発記録](../../development/step-14.4.md)

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。50/50。テストランナー実測32.39秒。最終実行は11:13:08–11:13:42 UTC。 |
| `npm run build` | 成功。TypeScript検査とVite build。実測6.44秒。 |
| Browser UIスクリプト構文解析 | 成功。Python `ast.parse`。 |
| `git diff --check` | 成功。 |

## Browser UI verification

GitHub Actionsの実行番号・対象SHA・Browser UI結果をpush後に記録します。シナリオでは専用フォーム、入力条件、表示名共有、セッション中の安全制限、ルーム作成・参加・退出、再接続、オンライン対局操作、および320・375・390・430px幅を確認します。ローカルではChromiumを起動していません。

## 実機確認

iPhone Safari実機は未確認です。GitHub ActionsのChromium結果をSafari実機結果とは扱いません。
