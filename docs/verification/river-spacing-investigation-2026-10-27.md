# Browser UI河間隔測定の調査（2026-10-27、2026-10-28更新）

## 結論

初回失敗では、Chromiumが390×844pxのオンライン対局画面で、6枚目をリーチ宣言牌にした河の牌面間隔を0.53125pxと測定しました。期待値1pxとの差0.46875pxが既存許容差0.35pxを超えています。中心間隔も実測21.5px、牌面寸法からの期待値21.96875pxでした。

後続のWebKit失敗を安定測定したところ、layout cell／wrapperは意図した位置にある一方、180度回転した通常牌SVGの`getBoundingClientRect()`だけが左へ0.46875pxずれていました。run `40605706247`ではこの状態でgap `0.546875px`となり、DPR1、visual viewport scale1、pageerror／console errorなしでした。run `40603340862`でも宣言牌と隣牌のoffsetが逆方向に各0.234375pxでした。これらは、SVG rootを中心原点で回転した後の矩形がcell位置からずれ、測定対象の牌面gapを1px未満に見せるCSS幾何の問題を示します。

commit `505357bb7d1f997b9643c7b8e6c62005631afc26`で中心原点の回転をやめ、`transform-origin: top left`と角度別の明示translationに変更しました。GitHub Actions run `40607347640`ではChromium／WebKitともfocused測定3反復が成功し、各ブラウザーで48 scenario cases／960隣接牌面ペアを測定しました。すべての対象幅でエラーなしです。Codex CloudのローカルBrowser UI出力は`--no-sandbox`起動のため検証結果から除外します。

**元のChromium runがこのSVGずれを測った直接の画面記録はありません。** 元の失敗は同じcommitの再実行でも同値でしたが、後続のWebKit安定測定で同じ0.53125pxを再現しました。初回の失敗画像を取得できず、Chromiumで同じDOM状態だったかの直接照合はできません。回転SVGのrectずれと修正は後続WebKitで確認しましたが、初回Chromium失敗のすべての詳細や発生契機が解明されたわけではありません。

河layoutの計算式と1px±0.35pxの許容値は変更していません。SVG面の位置計算CSSのみを修正し、gap、center step、重なり、卓内配置のアサーションを維持しています。

関連する既存記録：[オンライン退出通知の配置検証](online-exit-notice-layout-2026-10-27.md)。

## 調査対象とGit基準

- 初回失敗： [GitHub Actions run `40519653129`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40519653129)、commit `20169c95a00fee957eb11d04a2f97167b8795771`。
- 成功した後続run： [GitHub Actions run `40522323858`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40522323858)、commit `2e9b4d24143af0527a2186066ce50742ef3cee68`。
- 修正commit：`505357bb7d1f997b9643c7b8e6c62005631afc26`。Browser UI run `40607347640`は成功しました。pushで起動したdeploy run `40607347889`もverify、Browser UI、Worker deploy、production test、Pages build、Pages deployの全jobが成功しました。
- 検証済みmain：commit `2ceec6ea5518d94fa1dc17d251b854025ab780b6`。この文書は同commit上で更新しています。
- 作業開始時のHEAD：`3eba6ca1d063d610a71c27224448401daaacac51`、branch `work`、作業ツリーはclean。
- `git fetch origin`後の`origin/main`：`5337ede744320131267eea68e0021d7a412b8389`。開始時HEADとの差はbehind 2 / ahead 0で、`git merge --ff-only origin/main`でfast-forwardしました。
- 修正作業はこの最新mainを基準とし、コード修正commit `505357bb7d1f997b9643c7b8e6c62005631afc26`を`main`へpush済みです。本記録は同commitに対するBrowser UI／deploy workflow結果を反映しています。

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

後続run `40522323858`では実装・測定条件・許容差が同じまま成功しましたが、failed jobの再実行`40519653129`では同じ値で再失敗しました。後続のWebKit診断でDOM安定後にも回転SVG面のrect offsetが繰り返し観測されたことから、今回の失敗値は一時的な描画揺れだけでなく、実測可能なCSS幾何のずれに由来すると判断しました。修正後のChromium／WebKit両方のfocused測定で3反復ずつ同じアサーションが成功しています。

## 河レイアウト実装の確認

- [`src/rendering/river-layout.ts`](../../src/rendering/river-layout.ts)がオンライン・オフライン共通の配置計算です。自分と対面は6列、左右CPUは8列で、最低3段です。通常18枚までは3段、19枚目以降は必要に応じて行を拡張し、左右席は24枚まで8列×3段、その後は牌・間隔を縮小します。
- 両レンダーは`calculateRiverLayout`で同じ配置を作り、`applyRiverLayout`と`applyRiverTilePlacement`でCSS変数・座標を適用しています。オンライン側のDOM置換は`online/game-controller.ts`の`renderRivers`で同期的に行います。
- CSSは卓サイズ由来の牌幅・高さを使い、河gapの基準を1pxとしています。宣言牌は横向きになり、配置計算はその表示寸法を考慮します。ブラウザー測定はSVG牌面の`getBoundingClientRect()`を使っています。
- オンラインfixtureはWebSocket mockの`MessageEvent`から`render()`を呼び、`renderRivers()`が河を同期的に`replaceChildren()`します。scenarioのDOM更新がPromiseやtimer後に行われる実装ではありません。河牌や牌面にtransition／animation指定はなく、牌は外部画像でなくinline SVGです。CSSに外部Webフォント定義もなく、SVG寸法は明示したCSSサイズです。フォント／画像ロード待ち不足が元の値を生んだという証拠はありません。
- `getBoundingClientRect()`はCSS pxの小数値を返します。devicePixelRatioは物理ピクセルへの描画には関係しますが、この測定値自体はCSS pxで、初回runのDPRは記録されていません。ブラウザーzoomも初回runでは未記録です。viewportはCSS pxで固定されています。
- Browser UI workflow内の各Pythonスクリプトは逐次起動され、河測定スクリプトも新しいPlaywright browser/pageを作成します。スクリプト内のシナリオ間では同じpageを使いますが、mockが毎回4席の河・viewer・宣言indexを上書きし、rendererが河classと子DOM、layout由来inline styleを更新します。並列実行による干渉はありません。初回artifactが取得できず、失敗時のclass／DOM残留やCSS実測値は確認できていません。
- `river-layout.test.ts`、`river-capacity-flow.test.ts`、`browser-riichi-discard-layout.py`、`browser-river-capacity.py`を確認しました。今回の失敗測定は、失敗時点で現実の表示不具合である可能性を排除できません。
- 容量テストを修正する過程のCodex Cloudローカル出力では、offlineケースの牌面rectが全て`[0,0,0,0]`なのに384 checksがpassしました。この実行もChromiumを`--no-sandbox`で起動したため検証結果から除外します。コード確認ではidle画面で`#local-table`がhiddenになっており、従来テストがオフライン河のDOM位置を検査できない状態と判明しました。容量テスト開始時に新規offline対局をUIから開始し、卓サイズ、牌面数、各牌面の非ゼロ寸法も検査するよう修正し、その後のGitHub Actions run `40598287787`でChromium／WebKit各384 checksの成功を確認しました。これは別の容量テスト検出漏れ修正で、元の0.53125pxを説明するものではありません。
- 初回のCSS修正ではSVG牌面の`transform-box:border-box`と`transform-origin:center`を明示しましたが、run `40598287787`で不十分と確認しました。SVG自体への`left/top:calc(...)`配置もrun `40600778575`で失敗しました。wrapperと子SVGを分離したrun `40603340862`でもWebKitの同一ケースが失敗し、gap `0.53125px`、center step `21.5px`（期待`21.96875px`）でした。artifact `12780895827`のJSON・スクリーンショットではDPR1、visual viewport scale1、pageerror／console errorなし、wrapperと面rectの差を確認しました。commit `f35ea4c`ではwrapperを直接計算位置へ移しましたが、run `40605706247`でもgap `0.546875px`、center step `21.515625px`（期待`21.96875px`）で失敗しました。artifact `12781276082`でwrapper rectとSVG face rectを比較すると、通常牌wrapperはcellと一致する一方、180度回転した通常牌SVG rectはcellより左へ`0.46875px`ずれていました。DPR1、visual viewport scale1、pageerror／console errorなしです。これを根拠にcommit `505357b`で`transform-origin:top left`と角度別の明示translationを実装しました。河layout計算、河gap、6×4／8×3、19枚目／24枚目の配置仕様は変更していません。

## 対策と再現検証

- オンライン河測定前に、viewport寸法、4河の枚数・宣言牌数、卓サイズ、河内の牌面相対rectが50ms間隔のpollingで連続3回一致することを最大3秒で確認するよう変更しました。未安定なら失敗し診断を保存します。固定sleep、失敗時の再試行、アサーション緩和は使いません。
- gap／中心間隔の失敗では、対象河、牌index、セル座標、各牌面rect、viewport、DPR、visual viewport、卓・河CSS変数、pageerror／console errorをJSONに保存し、同じ条件のスクリーンショットを撮ります。通常の大容量artifactと別artifactにも診断ファイルをアップロードします。
- `HEIBON_ONLINE_RIVER_SPACING_ONLY=1`は対象6枚・6枚目宣言牌を320/375/390/414px、4席回転で3周します（48 scenario cases、960隣接牌面ペア／browser）。
- 河間隔の回帰、18→19枚目、23→24枚目、左右CPUの確認幅に414pxを加え、Chromium／WebKitの既存Browser UI workflowで実行します。
- Browser UI run `40588289896`（commit `8315d004`）は間隔測定前に止まりました。timeout時のartifact画像・JSON（ID `12773760863`）には固定fixture設定前の実対局DOM（上1枚、右2枚、下1枚、左0枚）、320×568px、DPR 1、pageerror/console errorなしが記録されています。ただし、後続runで同じ待機呼び出しのTypeErrorが判明したため、これは「3秒間レイアウトが不安定だった」証拠ではありません。
- Browser UI run `40590397325`（commit `36863eda`）の診断artifact（ID `12773429233`）では、fixture反映後の4河各6枚・宣言牌各1枚が保存され、最終DOMRectから再計算したgapは1.0–1.015625pxでした。しかし、後続runで待機呼び出しがTypeErrorで止まっていたことが判明したため、これも反復assertionの結果ではありません。run `40591929025`（commit `5b037727`）も同じ誤った呼び出し方をしており、以上3 runのspacing assertionはすべて0件です。
- Browser UIを含むrun `40594213336`（commit `63c266fa`）のログで、wait helperが`TypeError: Page.wait_for_function() takes 2 positional arguments but 3 positional arguments ...`を出していたことが判明しました。インストール済みPlaywright Pythonでは`arg`がkeyword-onlyですが、コードは第2引数として位置渡ししていました。さらに広い`except Exception`がTypeErrorをlayout timeoutとして包み、原因を隠していました。同じ呼び出し方が前の修正commitにも入っていたため、run `40588289896`、`40590397325`、`40591929025`はいずれもspacing assertionを実行していません。run `40594213091`の初回attemptでは、これに先立ち`npm test`内の既存online CPU turn testも失敗し、Browser UIまで到達しませんでした。ローカルの同じ`npm test`は63/63 test filesで成功しています。
- `arg=`で渡し、timeout catchをPlaywrightの`TimeoutError`だけに限定しています。一般wait helperもtimeoutだけを捕捉し、それ以外のAPI／プログラムエラーはそのまま露出するようにしました。
- 安定待ちAPI修正後のActions run `40595972735`（commit `0fa9333`）では、Chromium focused runは48 scenarios／960 pairs成功、WebKitは390×844px・viewer0・6枚・宣言index5の上河で失敗し、gap `0.53125px`を再現しました。WebKitのpageerror／console errorは空、DPR1、visual viewport scale1で、安定待ちは通過済みでした。診断artifact `river-spacing-diagnostics-0fa93334245d37ac411208834254e929d675ab07`（ID `12776068020`）のJSONとスクリーンショットを確認し、cell間隔とSVG面rectの逆方向0.234375pxずれを記録しました。
- run `40597389839`（commit `bf83c16`、transform-box/origin指定前）でもWebKitの同じ390×844px条件でgap `0.53125px`を再現しました。run `40598287787`（commit `3373ccc`、transform-box/origin指定後）でも、WebKitはstable wait通過後、初回ケースで同値失敗しました。2回目の診断JSONにはcomputed `transformOrigin: 8.734375px 12.234375px`、`transformBox: border-box`があり、normal face rectはcellから左上に0.234375px、宣言faceは右上に0.234375pxずれていました。DPR1、visual viewport scale1、pageerror／console errorなしです。安定待ちのAPI修正ではこの幾何差は変わらず、許容差も変更していません。
- run `40600778575`（commit `c8e4bf8`、`left/top:calc(...)`配置）では、npm test/build、Chromium/WebKit capacity各384 checks、focused Chromium 48 cases／960 pairsは成功し、WebKit focused spacingは同じ390×844pxの初回caseでgap `0.546875px`、center step `21.515625px`（期待`21.96875px`）で失敗しました。diagnostic artifact `12778144543`ではnormal face rectがcellの左上から`0.46875px`ずれ、宣言faceは左へ`0.015625px`ずれていました。DPR1、visual viewport scale1、pageerror／console errorなしです。後続のWebKit diagnosticsにCSS computed left/topも記録しました。
- run `40603340862`（commit `d96762a`、中央配置と回転を別要素に分離）では、先行するChromium/WebKit capacity各384 checksおよびfocused Chromium 48 cases／960 pairsが成功し、WebKit focused spacingが同じ390×844pxの初回caseでgap `0.53125px`、center step `21.5px`（期待`21.96875px`）で失敗しました。diagnostic artifact `12780895827`のスクリーンショットとJSONを確認しました。viewportは390×844、DPR1、scale1、pageerror／console errorなしです。正常牌のSVG rectは親cellから左上へ0.234375px、宣言牌は右へ0.234375pxずれ、wrapper rectも中央位置から0.234375pxずれていました。
- commit `505357b`で回転後rectをtop-left原点から位置決めするCSSを適用しました。run `40607347640`のChromium／WebKit focused spacing測定はそれぞれ3反復・48 cases・960隣接牌面ペアで成功しました。診断用失敗artifactは生成されませんでした。

## 検証結果

- run `40598287787`（commit `3373ccc`）の`npm test`と`npm run build`は成功。capacity regressionはChromium 384 checks、WebKit 384 checks成功（320/355/375/390/414/430px、18/19/20/23/24/25/32/33枚、online/offline）。focused spacingはChromium 48 scenarios／960 pairs成功、WebKitは初回ケースでgap `0.53125px`により失敗。Actions artifact `12778420786`には失敗条件のJSONとスクリーンショットを保存しました。
- `d96762a`ではHTML wrapperで中央配置し子SVGだけを回転する方式もWebKitで失敗しました（run `40603340862`）。`f35ea4c`でwrapperのtranslateを除き、`left/top:calc(...)`で配置する方式に変えました。
- Codex Cloud上で修正後のローカルChromium focused testを2回実行し、各回48 scenarios／960 pairs、合計96 scenarios／1,920 pairs、gap `0.984375–1.0234375px`、期待中心間隔との差`-0.015625–0.0234375px`というpass出力を得ました。ローカルcapacity testも384 checksのpass出力でした。ただし、対象PythonスクリプトがChromiumを`--no-sandbox`で起動し、AGENTS.mdがCodex Cloud内で禁止している手順でした。これらは参考値としてのみ記録し、検証成功数には含めません。これ以降、Codex CloudでBrowser UIを起動していません。
- wrapper導入に伴い`riichi-river.test.ts`は牌面SVGをwrapper内から取得するように更新し、宣言牌ID・accessible label・他牌・resetのassertionは維持しました。
- `python -m py_compile tests/browser-online-waiting-room.py tests/browser-river-capacity.py`と`git diff --check`：成功。
- commit `f35ea4c`で`npm test` 63/63、`npm run build`、`npm run typecheck:worker`が成功。
- 修正commit `505357bb7d1f997b9643c7b8e6c62005631afc26`のBrowser UI run [`40607347640`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40607347640)は成功しました。`npm test`は1,233件成功／失敗0件、`npm run build`、Browser regressions全体が通過しました。focused spacing測定はChromium／WebKitそれぞれ3反復で合計48 scenario cases／960 adjacent pairs（320/375/390/414px）成功、console errors 0件です。河容量／19枚目・24枚目／左右CPU回帰はChromium／WebKit各384 checks成功（320/355/375/390/414/430px、18/19/20/23/24/25/32/33枚、online／offline）しました。失敗診断artifactは不要となり未生成で、通常Browser UI artifactはID `12782218477`です。
- 同じpushで起動したdeploy workflow run [`40607347889`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40607347889)はverify、deploy workflow内Browser UI、Worker deploy、production test、Pages build、Pages deployの全jobが成功しました。verifyではnpm regression tests、Cloudflare Worker typecheck、Pages buildが通過しています。
- 2026-10-27時点では、この調査のiPhone Safari実機確認は未実施でした。翌28日のユーザーによる目視確認は次節に追記しています。退出通知についての実機確認は[既存記録](online-exit-notice-layout-2026-10-27.md)を参照。

## 2026-10-28のiPhone Safari実機確認とIssue完了

- 2026-10-28、ユーザーがiPhone Safariで河のレイアウトを目視し、「問題なさそうです。」と報告しました。これはユーザーによる実機確認であり、Codexが実機確認したものではありません。目視した範囲では河レイアウトに問題が認められなかったものとして記録します。
- この実機確認は目視確認です。牌面間隔1pxを実機で数値測定していません。すべての河配置・画面サイズを確認したものではなく、19枚目・24枚目や左右CPUの局面を個別に実機確認したものでもありません。
- 上記の配置・枚数・幅の回帰範囲は自動検証結果です。GitHub Actions [Browser UI run `40609943470`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40609943470)ではChromium／WebKit、合計48ケース・隣接牌面960ペアを320／375／390／414pxで検証し、失敗0件でした。19枚目・24枚目および左右CPUの回帰検証も成功しています。これらの自動検証範囲を実機確認範囲に含めません。
- GitHub Actions [Deploy run `40609943503`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40609943503)ではverify、Browser UI、Worker deploy、production test、Pages build／deployがすべて成功しました。
- GitHub Issue [#14](https://github.com/ak-sekine/heibon-mahjong/issues/14)はGitHub上でclosed（completed）と確認しました。すでにクローズ済みのため、再度のクローズ操作やIssueへの追記はしていません。
- 最終状態：**実機目視確認済み・完了**。この状態は今回の調査に対するもので、下記の初回失敗に関する未確認事項を解消したという意味ではありません。

## 未解決・未確認事項

- 初回Chromium failureのartifactが32MiBを超えたため、失敗時のスクリーンショット、DOM、DPR、zoom、console errorを確認できませんでした。後続WebKitで同値の測定不具合とCSS rect offsetを直接確認しましたが、初回Chromiumと後続WebKitのface rectを同一条件で比較できていません。
- 初回Chromium失敗と後続WebKit失敗が完全に同一条件だったかは未確認です。特定の後続Chromium runが成功した理由も特定できていません。初回失敗のすべての詳細が解明されたわけではありません。
- iPhone Safariではユーザーの目視確認を記録しましたが、全河配置・全画面サイズ・19枚目／24枚目・左右CPUの個別実機確認、および1px間隔の実機数値測定は未確認です。Codex Cloud内で行った`--no-sandbox`起動のローカルChromium試験出力は検証数に含めていません。
