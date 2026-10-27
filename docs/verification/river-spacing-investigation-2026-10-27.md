# Browser UI河間隔測定の調査（2026-10-27）

## 現時点の結論

初回失敗では、Chromiumが390×844pxのオンライン対局画面で、6枚目をリーチ宣言牌にした河の牌面間隔を0.53125pxと測定しました。期待値1pxとの差0.46875pxが既存許容差0.35pxを超えています。中心間隔も実測21.5px、牌面寸法からの期待値21.96875pxでした。

0.53125pxの差は、河のlayout cell間隔ではなく、宣言牌と隣牌のSVG面rectが各cell中心から逆方向にずれて発生したことをWebKitの安定測定で確認しました。layout cell自体は1px離れていましたが、宣言牌のface rectはcell中心より右に0.234375px、隣牌のface rectは左に0.234375px寄り、実測face gapは0.53125pxでした。`transform-box:border-box`と`transform-origin:center`指定だけでは直らず、明示的な`left/top:calc(...)`配置もWebKitでface rectをcell中央にできませんでした。現在の修正は中央配置だけを担当する`.river-tile-face` wrapperと、回転だけを担当するSVGに分けました。Chromiumではfocused spacingとcapacity検証に成功し、WebKitのActions再検証待ちです。

**元のChromium runがこのSVGずれを測った直接の画面記録はありません。** 元の失敗は同じcommitの再実行でも同値でしたが、後続のWebKit安定測定で同じ0.53125pxを再現しました。初回の失敗画像を取得できず、Chromiumで同じDOM状態だったかの直接照合はできません。元の測定原因は特定でき、初回Chromiumでの発生契機には不確実性が残ります。

河layoutの計算式と1px±0.35pxの許容値は変更していません。SVG面の中央配置CSSのみを修正し、gap、center step、重なり、卓内配置のアサーションを維持しています。

関連する既存記録：[オンライン退出通知の配置検証](online-exit-notice-layout-2026-10-27.md)。

## 調査対象とGit基準

- 初回失敗： [GitHub Actions run `40519653129`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40519653129)、commit `20169c95a00fee957eb11d04a2f97167b8795771`。
- 成功した後続run： [GitHub Actions run `40522323858`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40522323858)、commit `2e9b4d24143af0527a2186066ce50742ef3cee68`。
- 作業開始時のHEAD：`3eba6ca1d063d610a71c27224448401daaacac51`、branch `work`、作業ツリーはclean。
- `git fetch origin`後の`origin/main`：`5337ede744320131267eea68e0021d7a412b8389`。開始時HEADとの差はbehind 2 / ahead 0で、`git merge --ff-only origin/main`でfast-forwardしました。
- 修正作業はこの最新mainを基準にしています。push前後のSHAは最終更新します。

## 初回失敗の詳細

- 失敗したjobは`browser-ui`。`npm test`、`npm run build`、Playwright導入、Chromium/WebKit導入は成功し、`Run Vite and browser regressions`内で失敗しました。
- 失敗したテストは[`tests/browser-online-waiting-room.py`](../../tests/browser-online-waiting-room.py)のオンライン河レイアウト測定です。Actionsログのstack traceはcommit `20169c9`上の1331行目を指し、アサーションは「online main-axis edge gap is not 1px」です。
- 条件：Chromium（スクリプトの既定ブラウザー）、390×844 CSS px、viewer seat 0、6枚、宣言牌index 5。実測gap `0.53125px`、期待`1px`、許容差`<0.35px`。実測center step `21.5px`、期待`21.96875px`。
- Playwright `1.64.1`、Chrome for Testing / Chromium `156.0.8078.4`、WebKit `27.2`。runnerはUbuntu 24.04.5、Node `24.21.0`、Python `3.12.15`でした。
- テストは`page.set_viewport_size()`後に`resize`イベントを待ち、その直後にテスト用WebSocket mockで河を更新し、`getBoundingClientRect()`でSVG牌面を測定します。初回の失敗経路ではDOM矩形の連続安定性を待っていませんでした。
- `devicePixelRatio`、ブラウザーzoom、失敗時の全DOM状態・console出力は初回ログに保存されていません。テストは`pageerror`を配列に記録しますが、失敗時には最終報告まで到達せず、その配列の値もログにありません。console errorの有無は未確認です。
- workflowは単一job内の逐次実行です。失敗前に`browser-riichi-discard-layout.py`、`browser-river-capacity.py`（Chromium/WebKit）などの河・配置検証は成功しています。その後、`browser-online-waiting-room.py`の全フローで失敗しました。後続のWebKit online waiting-room全検証やriver test mode等はこの失敗で未実行です。
- 初回runのworkflow上の実行順は次のとおりです（記載のないブラウザー指定はChromium）。`browser-online-dialog-layout.py`、`browser-app-idle.py`（Chromium、WebKit）、`browser-riichi-discard-layout.py`、`browser-action-controls.py`、`browser-action-panel.py`、`browser-table-ui.py`、`browser-riichi-claimed-discard.py`（Chromium、WebKit）、`browser-river-capacity.py`（Chromium、WebKit）、`browser-declaration-bubbles.py`、`browser-declaration-gameplay.py`（Chromium、WebKit）、`browser-round-end-ui.py`（Chromium、WebKit）、`browser-result-hand-layout.py`（Chromium、WebKit）、`browser-dora-rows.py`、`browser-mobile-table-layout.py`、`browser-seat-kan-overlap.py`、`browser-step13-5-5.py`、`browser-step13-5-5-kan.py`、`browser-step13-6.py`、`browser-step13-7.py`、`browser-step13-8.py`、`browser-step13-9.py`、`browser-step13-10.py`（Chromium、WebKit）、`browser-step13-11.py`、`browser-online-waiting-room.py`（Chromium、ここで失敗）。後続のWebKit online waiting-room、test-page、river-test-mode、diagnostics検証は実行されていません。
- runのartifact `browser-ui-20169c95a00fee957eb11d04a2f97167b8795771`（ID `12742830202`）はアップロード成功、ZIPサイズ`35,268,777` bytesでした。GitHub connectorからZIP取得はできましたが、この実行環境のファイル転送上限32MiBを超えたため展開できませんでした。したがって、失敗時スクリーンショットは実際には確認できていません。
- 調査中にこのrunのfailed jobを同じcommitで再実行しました（job ID `122482490677`）。同じテスト順で`browser-online-waiting-room.py`まで進み、同じ390px／viewer 0／6枚／宣言index 5で再度失敗し、gap `0.53125px`、center step `21.5px`、期待center step `21.96875px`を記録しました。これは同じレイアウト違反が再現した証拠ですが、gapを生じさせる原因（配置CSSか期待値／測定の解釈か）はまだ絞れていません。再実行jobのartifact（ID `12771883944`、`35,229,006` bytes）も32MiBを超え、初回失敗時の画像はどちらのrunでも保存・確認できていません。

## 再実行との差

run `40522323858`は後続commitの別runで、Browser UI job全体が成功しています。河レイアウト実装、失敗したChromium測定経路、viewport、アサーション、許容差は初回runから変更されていません。差分commitは退出通知の検証追加とworkflow上の追加呼び出しを含みます。したがって、実行全体は異なりますが、失敗したfull Chromium河測定経路は同じでした。

この後続runだけを見れば失敗は再現していませんが、failed jobを同じcommitで明示的に再実行したrun `40519653129`では同じ値で再失敗しました。したがって、単発の一時的な描画揺れだけを原因とは扱えません。実表示の配置違反か、期待するgapと測定対象の幾何の不一致がある可能性を調べますが、原因の断定は修正後の診断値とレイアウト計算の照合後に行います。

## 河レイアウト実装の確認

- [`src/rendering/river-layout.ts`](../../src/rendering/river-layout.ts)がオンライン・オフライン共通の配置計算です。自分と対面は6列、左右CPUは8列で、最低3段です。通常18枚までは3段、19枚目以降は必要に応じて行を拡張し、左右席は24枚まで8列×3段、その後は牌・間隔を縮小します。
- 両レンダーは`calculateRiverLayout`で同じ配置を作り、`applyRiverLayout`と`applyRiverTilePlacement`でCSS変数・座標を適用しています。オンライン側のDOM置換は`online/game-controller.ts`の`renderRivers`で同期的に行います。
- CSSは卓サイズ由来の牌幅・高さを使い、河gapの基準を1pxとしています。宣言牌は横向きになり、配置計算はその表示寸法を考慮します。ブラウザー測定はSVG牌面の`getBoundingClientRect()`を使っています。
- オンラインfixtureはWebSocket mockの`MessageEvent`から`render()`を呼び、`renderRivers()`が河を同期的に`replaceChildren()`します。scenarioのDOM更新がPromiseやtimer後に行われる実装ではありません。河牌や牌面にtransition／animation指定はなく、牌は外部画像でなくinline SVGです。CSSに外部Webフォント定義もなく、SVG寸法は明示したCSSサイズです。フォント／画像ロード待ち不足が元の値を生んだという証拠はありません。
- `getBoundingClientRect()`はCSS pxの小数値を返します。devicePixelRatioは物理ピクセルへの描画には関係しますが、この測定値自体はCSS pxで、初回runのDPRは記録されていません。ブラウザーzoomも初回runでは未記録です。viewportはCSS pxで固定されています。
- Browser UI workflow内の各Pythonスクリプトは逐次起動され、河測定スクリプトも新しいPlaywright browser/pageを作成します。スクリプト内のシナリオ間では同じpageを使いますが、mockが毎回4席の河・viewer・宣言indexを上書きし、rendererが河classと子DOM、layout由来inline styleを更新します。並列実行による干渉はありません。初回artifactが取得できず、失敗時のclass／DOM残留やCSS実測値は確認できていません。
- `river-layout.test.ts`、`river-capacity-flow.test.ts`、`browser-riichi-discard-layout.py`、`browser-river-capacity.py`を確認しました。今回の失敗測定は、失敗時点で現実の表示不具合である可能性を排除できません。
- ローカルで容量Browser UI回帰を初めて実測した際、offlineケースの牌面rectが全て`[0,0,0,0]`なのに384 checksが成功しました。idle画面では`#local-table`がhiddenで、従来テストはオフライン河のDOM位置を検査できていませんでした。容量テストの開始時に実際の新規offline対局をUIから開始し、卓サイズ、牌面数、各牌面の非ゼロ寸法も検査するよう修正しました。修正後の384 checksはChromiumで成功し、19枚目／24枚目の左右CPU牌面rectも320px・390px幅で非ゼロ値を確認しています。これはテストの検出漏れ修正で、元の0.53125pxを説明するものではありません。
- 初回のCSS修正ではSVG牌面の`transform-box:border-box`と`transform-origin:center`を明示しましたが、run `40598287787`で不十分と確認しました。次の`left/top:calc(...)`配置もrun `40600778575`でWebKit測定が失敗しました。現在のCSSは、cell中央に配置する`.river-tile-face` wrapperとその内側で回転するSVGを分離しています。`calculateRiverLayout`の配置計算、河gap、6×4／8×3の列構成、19枚目／24枚目の配置仕様は変更していません。

## 対策と再現検証

- オンライン河測定前に、viewport寸法、4河の枚数・宣言牌数、卓サイズ、河内の牌面相対rectが50ms間隔のpollingで連続3回一致することを最大3秒で確認するよう変更しました。未安定なら失敗し診断を保存します。固定sleep、失敗時の再試行、アサーション緩和は使いません。
- gap／中心間隔の失敗では、対象河、牌index、セル座標、各牌面rect、viewport、DPR、visual viewport、卓・河CSS変数、pageerror／console errorをJSONに保存し、同じ条件のスクリーンショットを撮ります。通常の大容量artifactと別artifactにも診断ファイルをアップロードします。
- `HEIBON_ONLINE_RIVER_SPACING_ONLY=1`は対象6枚・6枚目宣言牌を320/375/390/414px、4席回転で3周します（48 scenario cases、960隣接牌面ペア／browser）。
- 河間隔の回帰、18→19枚目、23→24枚目、左右CPUの確認幅に414pxを加え、Chromium／WebKitの既存Browser UI workflowで実行します。
- Browser UI run `40588289896`（commit `8315d004`）は間隔測定前に止まりました。timeout時のartifact画像・JSON（ID `12773760863`）には固定fixture設定前の実対局DOM（上1枚、右2枚、下1枚、左0枚）、320×568px、DPR 1、pageerror/console errorなしが記録されています。ただし、後続runで同じ待機呼び出しのTypeErrorが判明したため、これは「3秒間レイアウトが不安定だった」証拠ではありません。
- Browser UI run `40590397325`（commit `36863eda`）の診断artifact（ID `12773429233`）では、fixture反映後の4河各6枚・宣言牌各1枚が保存され、最終DOMRectから再計算したgapは1.0–1.015625pxでした。しかし、後続runで待機呼び出しがTypeErrorで止まっていたことが判明したため、これも反復assertionの結果ではありません。run `40591929025`（commit `5b037727`）も同じ誤った呼び出し方をしており、以上3 runのspacing assertionはすべて0件です。
- Browser UIを含むrun `40594213336`（commit `63c266fa`）のログで、wait helperが`TypeError: Page.wait_for_function() takes 2 positional arguments but 3 positional arguments ...`を出していたことが判明しました。インストール済みPlaywright Pythonでは`arg`がkeyword-onlyですが、コードは第2引数として位置渡ししていました。さらに広い`except Exception`がTypeErrorをlayout timeoutとして包み、原因を隠していました。同じ呼び出し方が前の修正commitにも入っていたため、run `40588289896`、`40590397325`、`40591929025`はいずれもspacing assertionを実行していません。run `40594213091`の初回attemptでは、これに先立ち`npm test`内の既存online CPU turn testも失敗し、Browser UIまで到達しませんでした。ローカルの同じ`npm test`は63/63 test filesで成功しています。
- `arg=`で渡し、timeout catchをPlaywrightの`TimeoutError`だけに限定しています。一般wait helperもtimeoutだけを捕捉し、それ以外のAPI／プログラムエラーはそのまま露出するようにしました。最新コードでのActions結果は後続更新に追記します。
- 安定待ちAPI修正後のActions run `40595972735`（commit `0fa9333`）では、Chromium focused runは48 scenarios／960 pairs成功、WebKitは390×844px・viewer0・6枚・宣言index5の上河で失敗し、gap `0.53125px`を再現しました。WebKitのpageerror／console errorは空、DPR1、visual viewport scale1で、安定待ちは通過済みでした。診断artifact `river-spacing-diagnostics-0fa93334245d37ac411208834254e929d675ab07`（ID `12776068020`）のJSONとスクリーンショットを確認し、cell間隔とSVG面rectの逆方向0.234375pxずれを記録しました。
- run `40597389839`（commit `bf83c16`、transform-box/origin指定前）でもWebKitの同じ390×844px条件でgap `0.53125px`を再現しました。run `40598287787`（commit `3373ccc`、transform-box/origin指定後）でも、WebKitはstable wait通過後、初回ケースで同値失敗しました。2回目の診断JSONにはcomputed `transformOrigin: 8.734375px 12.234375px`、`transformBox: border-box`があり、normal face rectはcellから左上に0.234375px、宣言faceは右上に0.234375pxずれていました。DPR1、visual viewport scale1、pageerror／console errorなしです。安定待ちのAPI修正ではこの幾何差は変わらず、許容差も変更していません。
- run `40600778575`（commit `c8e4bf8`、`left/top:calc(...)`配置）では、npm test/build、Chromium/WebKit capacity各384 checks、focused Chromium 48 cases／960 pairsは成功し、WebKit focused spacingは同じ390×844pxの初回caseでgap `0.546875px`、center step `21.515625px`（期待`21.96875px`）で失敗しました。diagnostic artifact `12778144543`ではnormal face rectがcellの左上から`0.46875px`ずれ、宣言faceは左へ`0.015625px`ずれていました。DPR1、visual viewport scale1、pageerror／console errorなしです。WebKitでCSS computed left/topを次のdiagnosticsで取れるよう追加し、現行wrapper修正を検証中です。

## 検証結果

- run `40598287787`（commit `3373ccc`）の`npm test`と`npm run build`は成功。capacity regressionはChromium 384 checks、WebKit 384 checks成功（320/355/375/390/414/430px、18/19/20/23/24/25/32/33枚、online/offline）。focused spacingはChromium 48 scenarios／960 pairs成功、WebKitは初回ケースでgap `0.53125px`により失敗。Actions artifact `12778420786`には失敗条件のJSONとスクリーンショットを保存しました。
- `c8e4bf8`でもWebKit failureが続いたため、SVG faceを`translate`で回転と同時に移動する方式や、SVG自体を`left/top`で中央配置する方式をやめ、HTML wrapperで中央配置して子SVGだけを回転する方式に変更しました。このwrapper CSSでローカルChromium focused testは48 scenarios／960 pairs成功（320/375/390/414px、4席×3周、console errors 0）。
- 同じwrapper CSSでローカルChromium capacity testは384 checks成功（8河枚数、4宣言席、online/offline、320/355/375/390/414/430px）。offline 19枚目／24枚目の左右CPU牌面rectは非ゼロでした。
- wrapper導入に伴い`riichi-river.test.ts`は牌面SVGをwrapper内から取得するように更新し、宣言牌ID・accessible label・他牌・resetのassertionは維持しました。
- wrapper導入後、`npm test`：63件成功、`npm run build`：成功、`npm run typecheck:worker`：成功。
- `python -m py_compile tests/browser-online-waiting-room.py tests/browser-river-capacity.py`と`git diff --check`：成功。
- 現行wrapper CSSのWebKit focused spacingとBrowser UI full Actions run：修正commit後に実施予定。
- iPhone Safari実機：この調査では未実施。退出通知についての既存実機確認は[既存記録](online-exit-notice-layout-2026-10-27.md)を参照。

## 未解決・未確認事項

- 初回Chromium failureのスクリーンショットはartifactが32MiBを超えて取得できず、初回のDOM、DPR、zoom、console errorは未記録です。後続WebKitで初回と同値が安定再現したため、同じCSS幾何不具合が有力な根本原因ですが、初回runの具体的なface offsetは直接照合できません。
- 現行wrapper CSSのWebKit focused spacingとBrowser UI full runは未確認です。Actions結果、成功回数・失敗回数、commit/push後のmain SHAは最終更新します。
