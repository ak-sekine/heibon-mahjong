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

結果：成功。対象実装コミット `8e7e62801af9f144a47811b7aeaf278672fda674` の[Browser UI verification #65](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39129241443)で、既存回帰とStep 13.7の代表局面が通過しました。追加局面は二盃口ツモ、3翻、合計7翻・18,000点でした。結果画面の開閉、次局遷移、横はみ出しなし、CPU非公開牌IDの非露出、136枚の物理牌ID一意性も確認しました。

## GitHub Pages

最初の[Deploy to GitHub Pages #100](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39129241486)は、`automatic-turns.test.ts` の既存テスト「the next CPU wait was not scheduled」が1件失敗し、build前に停止しました（他の1,039件は成功）。失敗jobを再実行したattempt 2ではnpm test、build、deployがすべて成功しました。Browser UI verification #65のnpm testも1,040件すべて成功しています。

## iPhone Safari

実機確認は未実施です。Chromiumの結果と混同せず、ユーザー確認事項として残します。
