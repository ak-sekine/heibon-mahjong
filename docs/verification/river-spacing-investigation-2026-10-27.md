# Browser UI河間隔測定の調査（2026-10-27）

## 現時点の結論

初回失敗では、Chromiumが390×844pxのオンライン対局画面で、6枚目をリーチ宣言牌にした河の牌面間隔を0.53125pxと測定しました。期待値1pxとの差0.46875pxが既存許容差0.35pxを超えています。中心間隔も実測21.5px、牌面寸法からの期待値21.96875pxでした。

**原因未特定です。** 調査中に、viewport変更後は`resize`イベントだけを待って測定しており、河DOMと各牌矩形の安定を確認していないテスト上の同期不足を確認しました。これは今回の0.53125pxを説明する可能性がありますが、因果関係はまだ確認できていません。安定待ち導入後に失敗が起きなくても、単独では原因解決の証明としません。

描画コードと間隔許容値は変更していません。1px±0.35pxの測定、中心間隔、重なり、卓内配置のアサーションを維持しています。

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
- `river-layout.test.ts`、`river-capacity-flow.test.ts`、`browser-riichi-discard-layout.py`、`browser-river-capacity.py`を確認しました。今回の失敗測定は、失敗時点で現実の表示不具合である可能性を排除できません。
- この変更では本番CSS／描画コードを変えていません。19枚目／24枚目の配置仕様も変更していません。

## 対策と再現検証

- オンライン河測定前に、viewport寸法、4河の枚数・宣言牌数、卓・河・牌面の矩形が2フレーム連続で一致することを最大3秒で確認するよう変更しました。待機は有限で、未安定なら失敗し診断を保存します。固定sleep、失敗時の再試行、アサーション緩和は使いません。
- gap／中心間隔の失敗では、対象河、牌index、セル座標、各牌面rect、viewport、DPR、visual viewport、卓・河CSS変数、pageerror／console errorをJSONに保存し、同じ条件のスクリーンショットを撮ります。通常の大容量artifactと別artifactにも診断ファイルをアップロードします。
- `HEIBON_ONLINE_RIVER_SPACING_ONLY=1`は対象6枚・6枚目宣言牌を320/375/390/414px、4席回転で3周し、失敗を隠さず即時失敗します（48 scenario cases、合計960隣接牌面ペアの測定予定）。
- 河間隔の回帰、18→19枚目、23→24枚目、左右CPUの確認幅に414pxを加え、Chromium／WebKitの既存Browser UI workflowで実行します。
- 初回の修正commit `8315d004` のBrowser UI run `40588289896` は、対象間隔測定に入る前、320×568pxへのresize直後に3秒のレイアウト安定待ちがtimeoutして失敗しました。診断artifact `river-spacing-diagnostics-8315d004607b951dca4ff42d682a0843e017c216`（ID `12773760863`）の画像・JSONでは、まだ固定テストシナリオを設定する前の実対局DOM（上1枚、右2枚、下1枚、左0枚）が記録され、pageerror/console errorは空、DPRは1でした。元の対局DOMを固定シナリオへ置き換える前に牌矩形全体の安定を要求した待機順が不適切でした。この待機を外し、各幅で固定シナリオを反映した後に、期待枚数と牌rectが連続2フレーム安定したことを確認してから測定するよう修正しています。このrunではspacing scenarioは0件で、通過扱いにしません。

## 検証結果

作業中です。次の実行結果を取得後に追記します。

- 同じ初回Actions runのfailed job再実行：実行中。
- 対象Browser UI testの新規単独・反復実行：commit後のActionsで確認予定。
- Chromium／WebKit、320/375/390/414px、18→19・23→24、通常河・左右CPU河：commit後のActionsで確認予定。
- `npm test`：63件成功。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `python -m py_compile tests/browser-online-waiting-room.py`：成功。
- `git diff --check`：成功。
- iPhone Safari実機：この調査では未実施。退出通知についての既存実機確認は[既存記録](online-exit-notice-layout-2026-10-27.md)を参照。

## 未解決・未確認事項

- 0.53125px測定が一時的な描画状態だったのか、安定したCSSレイアウトの実表示異常だったのかは未確定です。失敗画像を取得できず、初回のDPR・console errorも未記録です。
- 安定待ちを入れた後の反復結果だけで、初回の原因が解決したとは結論しません。新しい失敗の診断値と画像を使い、必要なら描画処理を再調査します。
- Actions結果、成功回数・失敗回数、commit/push後のmain SHAは最終更新します。
