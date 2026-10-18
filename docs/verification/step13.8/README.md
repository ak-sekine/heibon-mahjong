# Step 13.8 検証記録

実施日：2026-10-18

## 自動テスト・ビルド

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。43/43テストファイル、0失敗、0 skip |
| `npm run build` | 成功。TypeScript検査、Vite build |
| Browser UI用Pythonの構文確認 | 成功。ブラウザーは起動していません |
| `git diff --check` | 成功 |

Step 13.8の14テストで、主要役満の成立・不成立、通常役との排他、候補ごとの役満数、点数計算、ドラ無効、ロン・ツモ・複数ロン、本場・供託、牌IDと入力不変性を確認しました。九蓮宝燈は萬子・筒子・索子の各1〜9追加牌を検証します。

## GitHub Actions・Pages

対象commit：[`c8f57f9`](https://github.com/ak-sekine/heibon-mahjong/commit/c8f57f9c04e1234390d663fd4eaa8807ea1e8e30)

| 検証 | 結果 |
| --- | --- |
| Browser UI verification | 成功。[run 39169130052](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39169130052)。390px幅で新規役満1種類と複数役満を検証し、役名・役満数・得点・結果概要と詳細・次局遷移・牌ID一意性・CPU非公開牌情報・横はみ出しを確認 |
| GitHub Pages build | 成功。[run 39169130007](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39169130007) の `build` job |
| GitHub Pages deploy | 成功。同runの `deploy` job |

ブラウザー検証はGitHub Actionsで実行し、Codex CloudではChromiumを起動していません。

## iPhone Safari

未確認です。iPhone Safari実機での確認はユーザー側で行う予定です。
