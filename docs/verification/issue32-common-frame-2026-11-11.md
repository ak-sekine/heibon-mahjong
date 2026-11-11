# Issue #32 操作パネル共通外枠（2026-11-11）

## 本人のPC実機報告

**NG**：チーの種類選択から複数候補選択に切り替えると候補パネルの幅が元の操作パネルと異なり、背後に通常操作パネルの枠が見える。異なるサイズのパネルが二重に表示されるように見える（今回のユーザー報告）。

修正後のPC実機・iPhone Safari実機確認は**未確認**。過去のOK結果で今回のNGを相殺しない。Issue #32は**Open**を維持する。

## 開始時の状態

- 対象：`ak-sekine/heibon-mahjong`、`/workspace/heibon-mahjong`、ブランチ`work`。
- 作業ツリーはclean、未pushコミットなし。fetch成功。
- 開始HEAD：`044824516446882d819bcdfae7b8c815b8345fa2`。
- fetch後origin/main：`5c93ece9fb726197a0ebe780b356031a82c97a33`、behind/ahead `3/0`。fast-forwardして同SHAを基準に実装。

## 原因と修正

通常操作領域は卓幅に従うが、候補は独立した620px上限とPC専用幅で中央固定されていた。候補中も高さ予約された通常操作領域の背景・枠線が描画され、候補より広い部分や下端に別の枠が見えた。鳴き種類領域も独自の背景・枠線を持っていた。

- `src/style.css`：操作領域と候補領域の共通`::before`で外枠・背景を描画。予約領域の疑似要素は候補中`display:none`。種類選択の独自装飾と候補の固定幅・PC専用幅を撤去。レイアウト用border boxは保持。
- `src/ui/action-panel.ts`：実操作領域の実測left／widthで候補を配置。ウィンドウ変更では基準下端も再測定し、visualViewportだけの変化は従来の保存下端と最小補正を維持。
- 既存共通テンプレート、`candidate-selection.ts`、`call-viewport.ts`を調査し、変更不要と判断。オンライン／オフライン／call-test／kan-testは同じActionPanelとCSSを使用。
- 通常操作は既存のhidden状態で操作対象から除外。候補の高さ予約、上方向展開、内部スクロール、戻る、単一候補即時実行、合法判定・通信仕様は維持。

## 検証

- `npm test`：1,518件成功。
- `npm run build`、`npm run typecheck:worker`：成功。
- `npm run build:itch`：最初は必須VITE_ONLINE_API_URL未指定により停止。本番Worker URLを指定した再実行は成功（ZIP 3ファイル）。
- `tests/browser-candidate-geometry.py`：既存の厳密な高さ・下端・卓矩形・scrollY条件を維持。左右端／幅差1px以内、共通装飾一致、予約領域の外枠非描画、ウィンドウresize復帰を追加。13 viewport（指定11サイズと既存375×560／375×635）、local／online、7局面で測定。全局面の表示前後スクリーンショットをartifactへ保存する。
- `getBoundingClientRect()`、`getComputedStyle()`、`elementFromPoint()`で矩形・装飾・ボタン到達性を検査。既存Tab・内部スクロール・Safari相当可視領域変更検査を維持。
- ローカルChromiumの既知の起動制限はAGENTS.mdに従い繰り返さず、既存Actionsの両engineとDeploy gateで確認する。結果は対象実装SHAのrun完了後に追記する。

## 実機再確認事項

PC：通常操作→鳴き種類→チー複数候補→戻る、暗カン／加カン複数候補、ウィンドウサイズ変更時に左右・幅・下端が揃い、背後の別枠が見えないこと。

iPhone Safari：ツールバー表示・収納後の候補／戻る操作、低い可視領域での内部スクロール、確定後の通常操作復元。オフライン／オンライン／call-test.html／kan-test.htmlを確認する。修正後はいずれも未確認。

## 初回Actionsの失敗と追加確認

実装SHA `c4cc7e51b985e326d0066bfcd8e0d9344988101b`、[run #43009007946](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43009007946) attempt 1：verify成功、公開はゲートで停止。

- WebKit：itch前段smokeの1・2回目成功、3回目はCPU初手の九種九牌判定／解決後に`wall-exhausted`へ遷移し、人間の打牌状態待ちがtimeout（残り山69、局east1、humanSeat 3）。UI suiteには未到達。同jobだけを再実行依頼した。ゲームルール・CPU・smokeの条件は変更しない。
- Chromium：11 viewportの鳴き表示検査を通過後、種類ボタンのキーボードfocus検査で`covered:true`。候補geometryには未到達。別作業のIssue #52修正`9294d21`で、角丸外側の点を検査していたことが原因と特定された。種類領域のborder boxを従来どおり1px保持し、外枠の描画だけを共通側へ移す変更も追加した。focus検出修正とその最小再現・smoke終了局面対応はmainから取り込む。候補位置・高さ・scrollY条件は緩和しない。
- ローカルWebKit導入も試行したが、公式配布ホスト`cdn.playwright.dev`／`playwright.download.prss.microsoft.com`が環境のDomain forbiddenで拒否された。Actionsで検証を継続する。

- 追加コミット`4d028f8f6f171bd8fa2f78a2cf8ce91ca15d0233`のpush前fetchで、別作業の`9294d21bb611d7d26a80b1b730323b6b60d1be3c`を検出。behind/ahead `1/1`、通常pushはnon-fast-forward拒否、force pushなし。差分は上記Issue #52のfocus／smokeテスト修正で製品ソースに競合なし。内容を確認してmergeし、helper競合はmainの診断・最小再現をそのまま保持して解決する。元のコミット履歴は維持。

## 統合後のfocus検証

Issue #52の検出器修正を含むmain `9294d21`の[run #43009718350](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43009718350)で、WebKitは前段smokeと11 viewportの鳴き表示を通過し、候補のTab移動でoutline clippingと候補下端の遮蔽を検出した。候補一覧はoverflow:autoだが内側余白がなく、候補ボタンの外側5pxのfocus ringが一覧境界で切れる。共通候補一覧に5pxのpaddingとscroll-paddingを追加し、focus ringを含む表示領域を確保する。外枠幅・下端・高さ予約・卓寸法は変更せず、既存のfocus／候補矩形検査も維持する。
