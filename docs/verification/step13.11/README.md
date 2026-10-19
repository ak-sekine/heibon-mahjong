# Step 13.11 検証記録

対象：天和・地和、親の配牌時ツモ、役満複合、CPU自動和了、結果表示と局精算。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `node tests/step13-11.test.ts` | 17項目すべて成功 |
| `npm test` | 成功。46テストファイル、失敗0 |
| `npm run build` | 成功 |
| `git diff --check` | 成功 |

単体・結合テストは通常形、七対子、国士無双の候補、既存役満との合算、1〜3役満の点数、本場・供託、親連荘・親交代、東4局、精算の冪等性、入力状態の不変性、136枚の物理牌ID一意性、CPU自動和了を確認します。

## Browser UI verification

既存のGitHub Actions `Browser UI verification` に390×844の2局面を追加しました。

1. 親の配牌直後に天和＋国士無双でツモ和了し、2役満・役名・96,000点・子3人の各32,000点・親連荘を確認。
2. 子の第一ツモで地和を成立させ、1役満・役名・32,000点・親16,000点と子2人各8,000点・親交代を確認。

両局面で最初のツモボタン、結果概要・詳細の開閉、次局遷移、390px幅の横はみ出し、物理牌IDの一意性、CPU非公開牌IDのDOM非露出を確認しました。既存の全ブラウザー回帰も含めGitHub Actionsで成功しました。

- [Browser UI verification #39196860671](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39196860671)（commit `cb02cc8`）。
- [GitHub Pages #39196860672](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39196860672)（commit `cb02cc8`）。`build` と `deploy` の両jobが成功しました。

Codex CloudではChromiumを起動していません。iPhone Safari実機は未確認です。
