# プレイヤー情報欄のレイアウト検証

**実施日:** 2026-10-21

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。53テストファイル、53成功、失敗0件。 |
| `npm run build` | 成功。TypeScript検査とVite build。 |
| `git diff --check` | 成功。 |
| `python -m py_compile tests/browser-online-waiting-room.py` | 成功。 |

## Browser UI verification

`tests/browser-online-waiting-room.py`を更新し、320・355・375・390・430・1280pxで、オンラインとオフラインの4行表示、相対席順、席風・親・点数、手番強調、補助状態の非表示、24文字表示名の省略、点数の右揃え、画面幅、卓の正方形、中央のドラ・局情報の共通配置を確認します。既存のBrowser UI検査で河・副露・カン表示も引き続き確認します。

main push時に[Deploy workflow](../../.github/workflows/deploy.yml)から既存の[Browser UI verification workflow](../../.github/workflows/browser-ui.yml)を実行します。Codex環境ではChromiumを起動せず、該当commitのActions結果を別途確認します。

初回Deploy run [39683183233](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39683183233)は`verify`が成功し、Browser UIは既存`browser-action-controls.py`が成立後の「リーチ」を点数欄に期待して失敗しました。リーチ状態と点棒減算を保ったまま、欄に「リーチ」がなくstatus要素もないことを検査するよう更新し、次のmain pushで再検証します。

再検証run [39683742864](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39683742864)は`verify`とBrowser UI内の既存回帰を通過し、最後のオンライン長名検査で停止しました。24文字の漢字・ひらがな混在名は320px欄に収まり、省略が必要な幅になっていないfixtureでした。24文字の日本語名に変えて幅320pxで省略表示を検査します。

## 実機確認

iPhone Safari実機は未確認です。
