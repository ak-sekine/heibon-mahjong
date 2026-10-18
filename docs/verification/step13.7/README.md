# Step 13.7 検証記録

実施日：2026-10-18

## 対象

三暗刻、二盃口、小三元、混老頭、混全帯么九、純全帯么九、三色同刻の候補判定・翻数・複合と、和了後の点数・結果表示。

## ローカル自動検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。42/42テストファイル |
| `npm run build` | 成功。TypeScript検査とVite本番ビルド |
| `git diff --check` | 成功 |
| `tests/step13-7.test.ts` | 成功。専用18件 |

専用テストは暗刻・和了牌割り当て、暗カンと明カン、二盃口と七対子、役同士の排他・複合、赤5、入力不変性、ロン・ツモ・副露・複数ロン、ドラ加算と点棒保存を確認します。

## GitHub Actions Browser UI verification

`tests/browser-step13-7.py` に二盃口ツモの代表局面を追加し、390×844表示で役名・役翻・合計翻・点数、詳細画面の開閉、次局遷移、横はみ出し、CPU非公開牌IDのDOM非露出、136枚の物理牌ID一意性を確認します。ローカルChromiumは起動せず、main push後のGitHub Actions結果を確認します。

結果：main push後の実行結果を確認して記録します。

## GitHub Pages

buildとdeployを別々に確認します。結果：push後に記録します。

## iPhone Safari

実機確認は未実施です。Chromiumの結果と混同せず、ユーザー確認事項として残します。
