# Step 13.6 検証記録

実施日：2026-10-18

## 自動テストとビルド

| 確認 | 結果 |
| --- | --- |
| `npm test` | 成功。41テストファイルすべて成功 |
| `node tests/step13-6.test.ts` | 成功。31テスト |
| `npm run build` | 成功。TypeScript検査とVite production buildが完了 |
| `git diff --check` | 成功 |
| `python -m py_compile tests/browser-step13-6.py` | 成功 |

新規単体テストでは、4役の成立・不成立、門前/副露の翻数、固定チー、暗カン・大明カン・加カン、七対子、他役との複合、赤5、入力の不変性と決定性を確認しました。実物理牌136枚の固定牌山を使い、人間のロン/ツモ、CPU1〜3のロン/ツモ、ダブルロン、符、親子支払い、清一色の満貫/跳満、本場・供託、100,000点保存も確認しました。

## ブラウザ検証

`tests/browser-step13-6.py` は、実際のロン・ツモ操作と結果画面を確認するため既存の `Browser UI verification` workflow に追加しました。三色同順・一気通貫・混一色の代表局面と、清一色の門前/副露局面を用意し、門前・副露の翻数、結果概要・詳細の正式名/翻数/点数、結果画面の開閉、次局遷移、CPU非公開牌ID、横はみ出しを確認します。清一色の結果は320・375・390・430・1280px、他役は390pxで確認します。

Codex Cloud上ではViteのloopbackサーバーを起動できましたが、Chromiumは `setsockopt: Operation not permitted` のcrashpadエラーで起動直後に終了しました。AGENTS.mdに従い、同じブラウザ起動を繰り返していません。GitHub Actionsの実行結果はpush後に追記します。iPhone Safari実機は未確認です。

## GitHub Actions・GitHub Pages

実装検証対象のmainコミット `695301d5dee01ec531e3daaeaaa5dbfbfd9ab6db` で次を確認しました。

| 確認 | 結果 |
| --- | --- |
| [Browser UI verification #39123239277](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39123239277) | 成功。既存ブラウザ回帰とStep 13.6の局面を実行 |
| [GitHub Pages build・deploy #39123239294](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39123239294) | build、deployとも成功 |

ブラウザでは三色同順・一気通貫・混一色のロン、清一色の門前ツモ・副露ツモを確認しました。清一色は320・375・390・430・1280px、他3役は390pxで確認し、概要・詳細の役名/翻数/点数、結果画面の開閉、次局遷移、横はみ出し、CPU非公開牌IDのDOM露出を検証しました。局面ごとの牌山は136枚で、物理牌IDが一意であることも確認しました。

最初のBrowser UI実行では、ブラウザ検証コードが副露清一色を6翻と期待して失敗しました。期待値を5翻へ修正して再実行し、Browser UI verification全体が成功しました。

ローカルChromiumは起動時にcrashpad socketの権限エラーで終了したため起動を繰り返していません。iPhone Safari実機は未確認です。
