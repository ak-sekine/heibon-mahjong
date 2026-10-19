# Step 13.10 検証記録

対象：流し満貫、九種九牌、四風連打、四家立直、共通の途中流局精算と局進行。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `node tests/step13-10.test.ts` | 16項目すべて成功 |
| `npm run build` | 成功 |
| `npm test` | 成功。45テストファイル、失敗0 |
| `git diff --check` | 成功 |

## Browser UI verification

既存のGitHub Actions `Browser UI verification` に次の3局面を追加しました。各ケースは390×844で表示し、結果名、結果詳細の開閉、次局遷移、横はみ出し、牌IDの一意性、CPU非公開牌IDのDOM非露出を確認します。

1. 九種九牌ボタンの表示・宣言・途中流局
2. 四風連打による自動流局
3. 流し満貫の成立者、満貫相当支払い、本場・供託、次局遷移

GitHub Actionsで次の検証に成功しました。

- [Browser UI verification #39179525131](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39179525131)（commit `abf9f52`）。3ケースすべてで結果名、詳細の開閉、次局遷移、390px幅の横はみ出し、物理牌IDの一意性、CPU非公開牌IDのDOM非露出を確認しました。
- [GitHub Pages #39179525129](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39179525129)（commit `abf9f52`）。`build` と `deploy` の両jobが成功しました。

Codex CloudではChromiumを起動していません。

## 公開・実機確認

Browser UI verification はGitHub Actions上のChromiumで実施しました。iPhone Safari実機は未確認です。
