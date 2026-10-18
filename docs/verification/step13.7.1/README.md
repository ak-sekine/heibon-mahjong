# Step 13.7.1 検証記録

実施日：2026-10-18

## 対象

自動ターンテストにおけるCPU待機登録の同期、CPU手番の再現性、キャンセル後の古い処理の無効化。ゲーム機能や画面の変更はありません。

## ローカル自動検証

| 検証 | 実行回数 | 結果 |
| --- | ---: | --- |
| 修正前 `node --test tests/automatic-turns.test.ts` | 1 | 成功 |
| 修正後 `node --test tests/automatic-turns.test.ts` | 1 | 成功 |
| 修正後の対象テスト反復 | 30 | 30成功、0失敗 |
| `npm test` | 1 | 42/42テストファイル成功、0失敗、0 skip |
| `npm run build` | 1 | 成功。TypeScript検査、Vite build |
| `git diff --check` | 1 | 成功 |

補助調査では、固定乱数を加える前のキャンセルテストで待機登録が現れず、5秒timeoutになった回が1回ありました。手番とソースを追うと、既定の `Math.random` が選ぶ打牌によってCPUが人間の鳴き・ロンを待つ局面があり、runnerはその時点で正常に待機を終えます。固定乱数未使用時の反復は失敗を含んだため30回完了とは数えていません。原因確認後に乱数源を固定し、最終状態で30回連続実行しました。

GitHub Pages初回実行の失敗メッセージは `the next CPU wait was not scheduled` でした。元の失敗attemptのログは取得できませんでした。確認できた再実行attemptでは、既存記録どおりnpm test・build・deployが成功しています。[Step 13.7 のActions記録](../step13.7/README.md#github-pages)を参照してください。

## 回帰範囲

対象テスト内でCPU1・CPU2・CPU3の手番順、キャンセル済みwaitと古いfinallyの無効化、新ゲーム開始後の安全性、runner二重起動の拒否、壁切れでの停止、最終ツモ・最終打牌、AbortSignalによる通常wait解除、牌枚数保存を維持して確認しました。全テストファイルも通過しています。

テストの並列条件は既存の `npm test` のままです。ローカルChromium検証は不要な変更範囲のため実施しておらず、GitHub ActionsやPagesの設定も変更していません。

## GitHub Actions・Pages

Step 13.7.1の実装commit `f3286d150f2438718e373318aba76cea679db07e` で、既存workflowが成功しました。

| Workflow | 結果 |
| --- | --- |
| [Deploy to GitHub Pages #39131956753](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39131956753) | 成功。npm testは1,040成功・0失敗、build成功、Pages deploy成功。 |
| [Browser UI verification #39131956752](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39131956752) | 成功。npm testは1,040成功・0失敗、build成功、既存ブラウザー回帰成功。 |

Browser UI検証はmain pushで起動した既存workflowです。ChromiumはGitHub Actions上で実行し、Codex Cloudでは起動していません。workflow条件・テスト実行条件の変更はありません。
