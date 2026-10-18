# Step 13.9 検証記録

実施日：2026-10-18

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| npm test | 成功。44/44テストファイル、0失敗、0 skip |
| tests/step13-9.test.ts | 成功。17ケース |
| npm run build | 成功。TypeScript検査、Vite build |
| git diff --check | 成功 |
| Browser UIテストのPython構文確認 | 成功。実ブラウザー実行はGitHub Actionsへ追加 |

Step 13.9の単体判定では海底摸月・河底撈魚の成立条件、役満排他、嶺上開花・槍槓との排他、翻数と結果名を検証します。局進行テストは最終通常ツモ、最終通常打牌、ロン見逃し、複数ロン、CPU自動ロン、荒牌流局、本場・供託、点数保存を確認します。局面フィクスチャは136枚の物理牌IDを保持します。

## GitHub Actions・Pages

既存のBrowser UI verificationに390px幅の最終通常ツモと最終通常打牌のシナリオを追加しました。対象commitは `4dbd06392bd468b36c8717abfd27926d0fdc3758` です。

- [Browser UI verification](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39173076686)：成功。既存の回帰シナリオとStep 13.9の代表2局面を実行しました。
- [GitHub Pages build/deploy](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39173076684)：成功。

## iPhone Safari

未確認です。公開後の実機確認はユーザー側で行います。
