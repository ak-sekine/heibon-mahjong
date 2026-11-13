# Issue #32 操作パネル共通外枠（2026-11-11）

## 修正前のPC実機報告（2026-11-11）

**NG**：チーの種類選択から複数候補選択に切り替えると候補パネルの幅が元の操作パネルと異なり、背後に通常操作パネルの枠が見える。異なるサイズのパネルが二重に表示されるように見える（今回のユーザー報告）。

この記録を作成した2026-11-11時点では、修正後のPC実機・iPhone Safari実機確認は**未確認**だった。過去のOK結果で今回のNGを相殺しない。この時点の状態と、後日の確認結果は時系列で分けて記録する。

## PC実機による修正後の確認結果 2026-11-13

### 本人報告と判定

- 確認日：**2026年11月13日**。確認者：**ユーザー本人**。環境：**PCブラウザー実機**。
- 本人報告：「PCでも問題ないことを確認しました。」
- 判定：**操作パネル外枠統一修正のPC実機確認はOK**。
- 対象修正は、通常操作パネルと鳴き種類選択パネルの外枠統一、候補選択パネルの幅・左右位置・下端の統一、候補選択時に背後のパネル枠が見える問題の修正、候補パネルの上方向展開と卓サイズの維持。
- 修正前にNGだった二重枠表示は、**今回の修正対象範囲で解消確認済み**と判定する。本人は個別の検証項目を列挙していないため、対象修正全体へのPC実機OK報告として記録し、項目ごとの独立した確認結果には分解しない。
- ウィンドウリサイズ、マウス・キーボード操作、各種ダイアログ・順位表示、オンライン対局・再接続などを今回個別に確認済みとは扱わない。OS、ブラウザーバージョン、解像度も今回の報告にはなく、補完しない。

### 既存の自動検証との区別

- 実装・公開SHA：`d50e8a6a5a67e8767de824bb80d2e83751cf474d`。Deploy Actions [#43012562746](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746)は同SHAで全体success。
- 既存Browser UI自動検証はChromium **45 script**／WebKit **35 script**が成功。共通外枠のgeometry検証は各engineで182ケース成功し、候補と操作領域の左右端・幅・下端の差はすべて0pxだった。
- これらはChromium／WebKitによる自動検証結果であり、今回のユーザー本人によるPCブラウザー実機確認とは別の記録である。自動検証の詳細、測定値、artifactは本書の[最終結果](#最終結果公開済み)を参照。

### 未確認事項とIssue #32の状態

- iPhone Safariでの共通外枠・候補パネル位置・Safariツールバー変化後の操作は、この修正について**実機再確認未確認**。
- PCのウィンドウサイズ変更、マウス・キーボード操作、各種ダイアログ・順位表示、オンライン対局・再接続、およびIssue本文のその他の必須条件も**未確認**。
- Issue #32全体のClose条件は引き続き未達。Issueは**Openのまま**維持し、本文のチェックボックスは変更しない。

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

PC：操作パネル外枠統一修正は2026-11-13の本人報告で実機OK。個別の検証項目は列挙されていないため、ウィンドウサイズ変更、マウス・キーボード操作、各種ダイアログ・順位表示、オンライン対局・再接続は引き続き未確認。

iPhone Safari：この共通外枠修正後のツールバー表示・収納後の候補／戻る操作、低い可視領域での内部スクロール、確定後の通常操作復元は未確認。オフライン／オンライン／call-test.html／kan-test.htmlでの実機再確認が残る。

## 初回Actionsの失敗と追加確認

実装SHA `c4cc7e51b985e326d0066bfcd8e0d9344988101b`、[run #43009007946](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43009007946) attempt 1：verify成功、公開はゲートで停止。

- WebKit：itch前段smokeの1・2回目成功、3回目はCPU初手の九種九牌判定／解決後に`wall-exhausted`へ遷移し、人間の打牌状態待ちがtimeout（残り山69、局east1、humanSeat 3）。UI suiteには未到達。同jobだけを再実行依頼した。ゲームルール・CPU・smokeの条件は変更しない。
- Chromium：11 viewportの鳴き表示検査を通過後、種類ボタンのキーボードfocus検査で`covered:true`。候補geometryには未到達。別作業のIssue #52修正`9294d21`で、角丸外側の点を検査していたことが原因と特定された。種類領域のborder boxを従来どおり1px保持し、外枠の描画だけを共通側へ移す変更も追加した。focus検出修正とその最小再現・smoke終了局面対応はmainから取り込む。候補位置・高さ・scrollY条件は緩和しない。
- ローカルWebKit導入も試行したが、公式配布ホスト`cdn.playwright.dev`／`playwright.download.prss.microsoft.com`が環境のDomain forbiddenで拒否された。Actionsで検証を継続する。

- 追加コミット`4d028f8f6f171bd8fa2f78a2cf8ce91ca15d0233`のpush前fetchで、別作業の`9294d21bb611d7d26a80b1b730323b6b60d1be3c`を検出。behind/ahead `1/1`、通常pushはnon-fast-forward拒否、force pushなし。差分は上記Issue #52のfocus／smokeテスト修正で製品ソースに競合なし。内容を確認してmergeし、helper競合はmainの診断・最小再現をそのまま保持して解決する。元のコミット履歴は維持。

## 統合後のfocus検証

Issue #52の検出器修正を含むmain `9294d21`の[run #43009718350](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43009718350)で、WebKitは前段smokeと11 viewportの鳴き表示を通過し、候補のTab移動でoutline clippingと候補下端の遮蔽を検出した。候補一覧はoverflow:autoだが内側余白がなく、候補ボタンの外側5pxのfocus ringが一覧境界で切れる。共通候補一覧に5pxのpaddingとscroll-paddingを追加し、focus ringを含む表示領域を確保する。外枠幅・下端・高さ予約・卓寸法は変更せず、既存のfocus／候補矩形検査も維持する。

候補1行＋戻るを保証するSafari相当可視領域の最小高さ計算にも、実測の一覧padding上下を含める。Browser UIの最小高さ算定も同じ実要素寸法に合わせ、期待位置の許容差・scrollY条件は維持する。

全スクリーンショットは従来のBrowser UI artifactへ保存し、目視確認用に矩形JSONと代表3サイズの前後画像を`candidate-frame-<engine>-<SHA>-<attempt>` artifactへ分けて保存する。既存CI gateとテスト実行内容は変更しない。

## overflow fixtureの後始末

`a0fbd6e`のrun #43010475450は両engineとも1280×720までの鳴き表示を通過し、次の1366×768で候補到達性検査に失敗した。調査すると、1280×720の内部スクロール試験が一覧へ設定するテスト専用`style.maxHeight=55px`を候補確定後に解除していなかった。従来の独立620px幅ではPCで1行に収まり潜在化していたが、実操作幅で折り返す状態では次viewportの通常候補まで55pxへ制限された。スクロール試験のassertionをすべて維持して、その試験後に注入したmax-heightとscrollTopだけを復元する。製品CSSへ幅補正や55px対策は追加しない。

## 広い実操作幅でのoverflow試験

`674a2d0`のrun #43011576265で、WebKitの種類選択／候補Tab検査は成功し、call-testの10 viewportも通過。1920×1080の大量カン候補試験で、ダミー100件が新しい広い実操作幅にすべて収まり（clientHeight=scrollHeight=964、最終候補は表示・クリック可能、scrollY=0）、スクロールの前提を満たさなかった。call-testと共通geometryのダミー候補を200件に増やす。overflow:auto、scrollHeight>clientHeight、scrollTop>0、最終候補／戻るの到達、卓矩形・ページscrollYのassertionはすべて維持する。製品の高さ・幅へ専用上限は追加しない。

## 最終結果（公開済み）

- 公開SHA：`d50e8a6a5a67e8767de824bb80d2e83751cf474d`。
- [Deploy run #43012562746](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746)、attempt 1、全体 **success**。
- `verify`：npm test **1,518件成功**、build、Worker型チェック、itch build成功。最終製品変更後のローカル関連単体21件も成功。
- Chromium **45 script成功**／WebKit **35 script成功**（既存baseline観測を含む）。call-test／kan-test／PCレイアウト／共通操作パネル／候補geometry／Tab検査を含む。matrix audit、release-freshness、deploy-worker、production-test、pages-build、pages-deployはすべてsuccess。
- 現行geometryは各engineで **13 viewport × local/online × 7局面 = 182ケース成功**。複数候補104ケース、単一候補即時実行78ケース。指定11サイズに既存の375×560／375×635を加えた。
- 各engineの複数候補104ケースで、表示直前の操作領域に対する候補外枠の**左端・右端・幅・下端の最大差はすべて0px**。通常手番と種類選択それぞれを入口に測定する。操作内容で入口の高さは異なり、候補はその入口の実測下端に一致する。
- 背後の予約領域の`::before`は104/104で`display:none`。共通装飾は背景`rgb(18,63,50)`、枠線`1px solid rgb(57,118,94)`、角丸`8px`で一致。通常操作・種類選択はhiddenで、通常ボタンは表示・Tab対象から除外。
- 卓のx／y／幅／高さは候補表示時・大量候補追加時とも最大差0px。scrollYは全ケースで表示前後0→0。戻る後の操作領域x／y／幅／高さも最大差0px。
- 200件の表示用ダミー追加による上方向展開、内部スクロール後の最終候補到達は104/104成功。候補／戻るのhit、実クリック、Tab、ウィンドウresize復帰、Safari相当の可視領域縮小・復元・大offsetの既存条件も成功。実機Safariの証明とは扱わない。

### 代表矩形（両engineで同値、local）

各行で表示前と候補の左端／右端／幅／下端が一致する。異なる局面の入口高さを同一視せず、通常操作→候補と種類選択→候補の双方を比較する。単位はCSS px。

| viewport | 入口 | 左端→候補 | 右端→候補 | 幅→候補 | 下端→候補 | 高さ→候補 | 卓サイズ前後 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | チー種類選択 | 4→4 | 316→316 | 312→312 | 532→532 | 120→200 | 300×300→同値 |
| 320×568 | 通常操作・混在カン | 4→4 | 316→316 | 312→312 | 493→493 | 81→136 | 300×300→同値 |
| 1280×720 | チー種類選択 | 415→415 | 865→865 | 450→450 | 709.1875→同値 | 108→200 | 450×450→同値 |
| 1280×720 | 通常操作・混在カン | 415→415 | 865→865 | 450→450 | 709.1875→同値 | 108→136 | 450×450→同値 |
| 1920×1080 | チー種類選択 | 560→560 | 1360→1360 | 800→800 | 1059.1875→同値 | 108→136 | 800×800→同値 |
| 1920×1080 | 通常操作・混在カン | 560→560 | 1360→1360 | 800→800 | 1059.1875→同値 | 108→136 | 800×800→同値 |

### 画像確認と測定artifact

- [Chromium 代表画像・全矩形JSON](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746/artifacts/13853421124)
- [WebKit 代表画像・全矩形JSON](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746/artifacts/13852224661)
- [Chromium 全Browser UI画像・ログ](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746/artifacts/13853062563)
- [WebKit 全Browser UI画像・ログ](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746/artifacts/13852224651)

Codexはartifactを取得してJSONを集計し、Chromium 1920×1080 local混在カンの前後、Chromium 1280×720 onlineチーの前後、WebKit 320×568 localチーの前後、WebKit 1920×1080 online混在カン表示中の代表7画像を実際に開いて確認した。左右・下側に別パネルの背景や枠線がはみ出さず、候補は同じ幅・下端で上へ展開している。全ケースを目視したとは扱わず、残りは矩形・装飾・hit検査による自動検証と区別する。

baseline観測はChromium 757.551秒／WebKit 817.490秒、現行geometryはChromium 216.310秒／WebKit 248.928秒。過去配置の違反記録も残すためbaselineは観測として成功し、現行の受入assertion成功とは区別する。途中SHAのrunは失敗履歴を保持し、更新済みSHAへ検証を集約するため停止したものもある。最終runの失敗・再実行はない。

### 公開確認

Pagesのbuildとdeployは別jobでsuccessを確認。Deployment statusも以下すべてsuccess、SHAは上記公開SHAで一致した。

- Worker：`7709534462`
- GitHub Pages：`7709559454`
- production Pages追跡：`7709565599`

公開先：https://ak-sekine.github.io/heibon-mahjong/ 。call-test.html／kan-test.htmlも同じビルドへ含む。公開確認はActionsとDeployment statusによるもので、PC／iPhone Safari実機確認とは区別する。

今回作成したコード・検証変更の履歴：`c4cc7e5`、`4d028f8`、`2d51321`（mainのIssue #52修正を保全したmerge）、`0bb6fc2`、`a0fbd6e`、`2491ff1`、`674a2d0`、`d50e8a6`。force push・履歴改変は行っていない。最終公開SHAのpush後、リモートmainが同SHAであること、作業ツリーcleanを確認。結果追記はMarkdownのみの別コミットとする。

**2026-11-11時点では修正前PC本人確認がNG、修正後PC／iPhone Safari実機確認は未確認だった。** 2026-11-13に今回の修正対象についてPC実機OKの報告があり、修正前の二重枠NGは対象範囲で解消確認済みとなった。iPhone Safariの同修正再確認とIssue #32の他の必須条件は未確認のため、Issueは引き続きOpenとする。2026-11-11時点のIssue状態確認は当時の履歴として残す。
