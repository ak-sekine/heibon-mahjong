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

**2026-11-11時点では修正前PC本人確認がNG、修正後PC／iPhone Safari実機確認は未確認だった。** 2026-11-13に今回の修正対象についてPC実機OKの報告があり、修正前の二重枠NGは対象範囲で解消確認済みとなった。この段落の未確認事項・Issue評価は当時の状態であり、以降の報告と評価は次節に時系列で追記する。

## 2026-11-21 本人実機確認と本番昇格事前調査

### 本人実機確認

確認者はユーザー本人、確認日は2026年11月21日。iPhone XS Safariの対象URLは開発版 <https://ak-sekine.github.io/heibon-mahjong/dev/>。報告にないOS／ブラウザーのバージョン、画面サイズ、確認時刻は記録しない。

#### iPhone XS Safari：8項目

| # | 本人報告 | 判定 |
| --- | --- | --- |
| 1 | 鳴き候補が上方向に展開し、下端位置が固定される | OK |
| 2 | 候補がすべて表示され、選択できる | OK |
| 3 | 操作パネルに二重枠や候補の位置ずれが発生しない | OK |
| 4 | Safariのツールバーを表示・収納した後も、候補と「戻る」を操作できる | OK |
| 5 | 候補確定・「戻る」の後に通常操作へ復帰できる | OK |
| 6 | ルール確認・局結果詳細・最終順位の各ダイアログを最後までスクロールできる | OK |
| 7 | 金色の共通スクロールバーと白い標準スクロールバーが重複表示されない | OK |
| 8 | ダイアログを閉じて卓へ戻り、通常操作を続けられる | OK |

**集計：OK 8／NG 0／未確認 0。** 鳴き候補の内部スクロールは候補が表示領域を超える場合だけ必要となる。今回の通常実機確認では全候補の表示・選択可能性を受け入れ、条件付き内部スクロール動作はChromium／WebKit自動テストの根拠として別扱いにする。

#### PCブラウザー追加確認：4項目

確認対象は開発版。本人報告にある「PCブラウザー」以上の環境情報は補わない。

| # | 本人報告 | 判定 |
| --- | --- | --- |
| 1 | ルール確認・局結果詳細・最終順位の3ダイアログで金色の共通スクロールバーが適切に表示され、白い標準スクロールバーが重複しない | OK |
| 2 | マウスホイール、スクロールバートラッククリック、つまみドラッグで本文をスクロールできる | OK |
| 3 | 本文にフォーカスした状態でPageDown／PageUpによるスクロールができる | OK |
| 4 | スクロール中のヘッダー・フッター固定、各ボタン、高さの低いウィンドウでの操作に問題がない | OK |

**集計：OK 4／NG 0／未確認 0。** 2026-11-14のPC本人実機確認11/11 OKは別の既存検証結果として維持し、この追加4件へ統合・置換しない。2026-11-11の修正前NG、2026-11-13のPC報告、iPhone Safariの暗カン・加カン過去結果も当時の記録を保持する。

### Issue #32受け入れ条件の再評価

現行Issue本文を2026-11-21に読み取り、基本条件7件と追加条件10件（ルール確認5件、局結果・最終順位5件）の全17件を条件ごとに評価した。詳しい根拠は[一覧と自動検証記録](issue32-responsive-layout-2026-11-03.md#2026-11-21-本人実機確認と受け入れ条件の再評価)に記載する。基本7件と追加10件はすべて**達成**。Android・タブレットの実機は未確認と明記し、Issue本文でも必須条件ではない。本人報告は申告された画面・操作の範囲に限って適用し、別環境へ拡張しない。

| 検証・公開レイヤー | 2026-11-21時点の状態 | 根拠・制約 |
| --- | --- | --- |
| Issue #32の実装 | 達成 | developに共通スクロール、候補位置・リサイズ対応と関連テストがある。該当コミット一覧は下記。 |
| Chromium／WebKit自動検証 | 達成 | SHA `60e7511da3a6eaa4df6c47c3d0e5df496a5402a6`のBrowser UI run [#43586831933](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43586831933)／Environments run [#43586831954](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43586831954)、および後続SHA `7ee1e643d60cfeaaeccaacfd0509a3f77289f418`のEnvironments run [#44890605757](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44890605757)。両engine、unit/type/build、Browser UI、環境分離、local-online、auditが成功。 |
| iPhone Safari本人実機 | 達成 | 今節の開発版URLでの本人報告8/8 OK。確認対象SHAは本人報告に含まれないため、特定SHAでの検証とは断定しない。 |
| PCブラウザー本人実機 | 達成 | 2026-11-14の別チェックリスト11/11 OKと、今回の追加4/4 OKを独立して記録。 |
| 開発版への反映・公開 | 一部達成 | 本人が開発版URLを確認。今回報告に配信SHAがなく、運用記録で最後に確認できる開発版公開はSHA `c3a6b6c4eeb72c82b8152ea299511df26e49c435`、publish run [#44625491003](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44625491003)。このSHAは後続の候補viewport調整を含まない。報告されたURLの具体的配信物とdevelop先端の一致は未確認。 |
| mainへの本番反映・公開 | 未達 | mainはdevelopの祖先ではなく、必要なIssue #32差分と安全な統合経路を確定できない。今回mainへの統合・公開はしていない。 |

### main／developの分岐とIssue #32差分

作業開始時に取得した最新のリモートは`origin/main`=`0e1185df53cc17ae08cb4be3a105f3b61b9c8528`、`origin/develop`=`a528103ceb15d7baeef93f922c118d8a43992c0d`。merge-baseは`c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`。`origin/main...origin/develop`はmain側9コミット、develop側67コミットで、developはmainより67 ahead／9 behind。mainへfast-forwardできない。

mainに未反映のIssue #32関連変更は次のとおり。

| 変更 | developコミット | mainとの差 |
| --- | --- | --- |
| ルール確認・局結果・最終順位の共通スクロール構造、インジケーター更新 | `e3f1f59678925d21464c25328570b9534a9f89c6`、`6427ecc834936cd5760a3b9839586cd7ce218357` | mainに未反映 |
| ルール本文の高さ制約、標準overflow回帰検査、PageUp／PageDown対応 | `2ed1fe6543a1f01b64e87c19fab3629e872347bf`、`76172899d50e9109de607ae63e0a82e90e2a1d32`、`24cfdb80668bd1b921d3f297ae4b068dd5307950` | mainに未反映 |
| mobile WebKit入力制約、複数チー候補シナリオ | `14b353d72fa1cd99cba2c1f2e1414240e9334bde`、`60e7511da3a6eaa4df6c47c3d0e5df496a5402a6` | mainに未反映 |
| トラッククリック・結果ダイアログ再表示の診断検査 | `6cb0e7dfb9550d3b4d265d138e7250c031600428`、`13c9360f50ed0eb4b5a719cfaee280ea596447bf` | mainに未反映 |
| 候補位置をviewport resize後も保つ変更と短い可視領域の補正 | `5bc86318c5a5ade930c49cc864218e9ef84ee9c3`、`0a889f38b05a0f60c31be61a6a5be04033e5ddbb` | mainに未反映 |
| WebKitのviewport resize診断・イベント転送テスト | `0a3d3d2d737c03a040fdf3e814f05fe4f8c7428e`、`f204841faa3e82f1bfa4f8e9756b8790e09ef9b5` | mainに未反映 |
| 操作領域リサイズ時の候補再計測 | develop `df748beb8816c695a0e1b7009c980ccada9c6ab2` | 実装の同じResizeObserver追加はmain `3d076f8bf02cbd48a0534372bad816859c808042`にもあるが、対応するgeometryテスト差分は同一ではない。 |
| CPU直後の打牌geometryテスト | develop `dbb1bf9a14b533149a580d928d4aa013ddb36a14` | main `c4baa3be9994fcc6d50d57ed3a7bf3ae998aa2ea`とpatch-equivalent。機能差分は解消済みだがコミット履歴は別。 |

developから見たmain独自9コミットは、`0e1185d` Pages公開順序修正、`c4baa3b` PC打牌検査、`3d076f8` 操作領域resize対応、`c3aa4e9` Worker secret受け渡し、`1ae2243` Issue #47公開ゲート統合、`0b49691` Issue #47監査workflow、`cbf406b`・`412210b`・`00c4342` Issue #32の11/14 PC記録とdocs CI記録。うち`c4baa3b`と`3d076f8`の一部実装はdevelopにも相当変更がある。Issue #47のworkflow・secret・Pages順序変更は相互依存する本番公開基盤であり、Issue #32だけを昇格する際に落とせない。

read-onlyの`git merge-tree origin/main origin/develop`は15ファイルで競合を報告した。workflow 3件、運用・Issue47文書3件、Issue32記録2件、audit script追加、geometry／CI／環境検証テスト6件が含まれ、その他の変更にも自動merge箇所がある。統合や競合解消は行っていない。developの67コミットにはIssue #32以外のIssue47・58などの実装、テスト、公開関連変更があり、Issue #32だけの内容ではない。

### 安全な昇格案と残るゲート

現行の[環境運用規則](../operations/environments.md#通常開発と昇格)は、確認済みdevelopの内容だけをmainへfast-forward昇格する方針。現状は分岐し、15ファイルの競合もあるため、その通常手順で安全に昇格できる状態ではない。develop全体をmainへ統合するとIssue #32以外の67コミットを巻き込む。未検証変更を含むため本タスクでは採用しない。

候補案は、まずmain独自の公開基盤9コミットとdevelop側Issue #32修正をファイル・依存コミット単位で照合し、mainの公開ゲートを維持した専用統合候補を作ること。その候補でIssue #32に必要な変更だけを選別できるか、依存関係・テスト差分・15競合を人がレビューし、全CIと本番事前ゲートを通す。これは現行文書の「developからfast-forward」手順を外れる可能性があるため、具体的なbranch/commit操作の前に統合方針の判断が必要。現時点では安全な最終統合方式を確定できず、merge／rebase／cherry-pickは実施しない。

本番昇格時は次の品質ゲート・手動手順が必要。

1. 候補SHAを固定し、main先端・選別した変更・公開台帳のhashを照合。Issue #47由来のworkflow／Environment分離を維持し、main/developの成果物やWorker URLを混ぜない。
2. 本番・dev・itchのbuild、unit/typecheck、Chromium／WebKit Browser UI、環境分離Browser UI、local-online、matrix/audit等を候補SHAで成功させる。最新developのコードCIとしてrun [#44890605757](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44890605757)は再利用根拠だが、未統合のmainとの差分を検証するものではない。
3. `DUAL_PAGES_ENABLED=true`、`workflow_dispatch`、`publish=true`、`main` refを確認し、`worker-production`の必要secretと`github-pages` Environmentのbranch/Pages設定、実Worker URL、`pages-verified`の`pending=null`と保存hashを公開直前に確認する。
4. main候補SHAの全ゲート完了後に本番公開workflowを手動実行する。予約済みsnapshot確認、production Worker、オンラインproduction test、Pages deploy、finalizeの各結果と同一SHAを照合する。develop pushは検証のみで、自動本番公開はしない。
5. 本番公開・配信SHAの照合後にのみ、別途Issue #32の最終判定とCloseを行う。今回の作業では公開もIssue操作も行わない。

最新の外部Environment許可設定・required reviewer状態は今回独立に取得していないため、実行直前にGitHub Environmentと手動承認条件を確認する。現状は実機確認・自動検証まで達成、develop URLでの本人確認済み、正確な公開SHAは不明、本番反映未達、IssueはOpenである。
