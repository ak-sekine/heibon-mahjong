# Issue #12 対局結果画面の検証

更新日: 2026-10-31
実装基準: `origin/main` `da15b3dade362f63774eacf8957fdd48d9c95cdc`
最終検証・公開対象SHA: `844913b1c6961c768fbfa30b5aa54ebefaf24481`
GitHub Actions: [Verify and deploy main @ 844913b](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41215069863)

## 実装前に確認した処理

- `settleRound()` が親連荘・流局・東風戦／半荘戦の終了条件を処理し、終了状態を `status: 'match-ended'` と `lastSettlement.matchEnded` で確定します。最終局の連荘中は `round-ended` のままです。
- `rankPlayers()` は持ち点降順、同点時は小さいPlayer ID順です。SPECにも同じ規則が記載されています。
- オフラインは `MatchState` と `controller.playerNames`、オンラインはサーバーが作る `PlayerGameView` の `status`・`result`・`seats`（名前・持ち点）を使えます。オンラインの再接続・CPU交代後もこのビュー復元経路を再利用し、新しい通信メッセージは追加していません。
- 通常の局結果は既存の `ResultDialog` と「局の結果」から開きます。次局操作は既存の `next-round` 経路のままです。
- 関連Issue #13はオンライン対局後に同じルームで再戦する別仕様です。本変更ではオンラインの既存「ローカル卓へ戻る」導線を維持し、再戦状態や通信を変更していません。

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| 関連単体テスト（操作状態、順位進行、対局結果ダイアログ、テンプレート、ボタン役割） | 5ファイル成功 |
| `npm test` | ローカル実装時73ファイル成功。最終SHAのActionsでは1,310件成功、失敗0、skip 0 |
| `npm run build`（TypeScript型検査を含む） | 成功 |
| `npm run typecheck:worker` | 成功 |
| Browser UI Python構文検査 | 成功 |
| `git diff --check` | 成功 |
| Codex CloudでのChromium／WebKit起動 | 未実施。既知の実行環境制限に従い、Chromiumを起動せずActionsで確認する |

初回の単体テストでは、静的ボタン数を固定した既存 `button-roles.test.ts` が失敗しました。役割クラスと `kan-test.html` のボタン数を実装に合わせて更新し、最終SHAでは全1,310件が成功しています。テストのskip、アサーション削除、タイムアウト延長はありません。

## GitHub Actionsと公開

| 対象SHA | Actions run | 結果 |
| --- | --- | --- |
| `a2505944637100a84e05c4a07548f389995ba50c` | [41212306279](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41212306279) | verify成功。docs-checkは検証記録の末尾空白で失敗。Chromium／WebKitは対局未開始時に `controller.match` を読む初期化不具合で失敗。公開はゲートによりスキップ。 |
| `30058c9ea673d2df1e4084a54dc2f803f7c01bf9` | [41212680020](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41212680020) | docs-check／verify成功。Chromium／WebKitは `browser-river-capacity.py` のオンラインコントローラーfixtureが新しい依存を渡さず失敗。公開はスキップ。 |
| `a5df29eb75b224ba398316b154b30f8f060be95c` | [41213151678](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41213151678) | docs-check／verify成功。Chromium／WebKitは共通 `main.ts` を使う `kan-test.html` にダイアログDOMがなく失敗。公開はスキップ。 |
| `4a157577dd5dc7dfd5022e789acf0827dac6f3d4` | [41213751792](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41213751792) | docs-check成功。verifyは `kan-test.html` の静的ボタン数期待値で失敗し、Browser UIは実行されず、公開はスキップ。 |
| `0e321428a57348bf4a5bccdf1615ec9ac8340620` | [41214005069](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41214005069) | docs-check／verify成功。WebKit成功。Chromiumは320pxの最終オンライン操作列で横はみ出しを検出。公開はスキップ。 |
| `844913b1c6961c768fbfa30b5aa54ebefaf24481` | [41215069863](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41215069863) | detect-changes／docs-check／verify成功。Browser UI Chromium／WebKitとマトリクス監査成功。Worker公開、Production test、Pages build、Pages deploy成功。 |

最終SHAのBrowser UIでは、Chromium 34実行、WebKit 22実行がすべて成功し、失敗・timeoutは0件でした。`browser-round-end-ui.py` も両方で成功し、4人の結果表示、開閉・再表示、名前・点数表示、スクロール、閉じるボタンの1行表示を確認しました。Pages公開先は https://ak-sekine.github.io/heibon-mahjong/ 、Workerは https://heibon-mahjong-online.ak-sekine.workers.dev です。

## iPhone Safari実機確認

未実施です。ユーザー確認後、縦画面での表示、4人の順位と最終点、長い名前、小画面スクロール、「閉じる」の1行表示、閉じる後の再表示、局結果画面の継続利用をこの記録へ追記します。自動ブラウザー検証は実機確認の代替にしません。

## 2026-10-31 追補：結果ボタン表記

Issue #12 の追加要件に合わせ、ボタンの表示文言を更新しました。画面タイトル「対局結果」と操作ID、配置、結果表示処理は変更していません。

- 通常局終了時はオフライン／オンラインとも「局の結果」「次の局へ」を表示します。
- 対局確定終了時はオフライン／オンラインとも「局の結果」「順位確認」を表示します。
- `index.html` と検証用 `test.html`／`kan-test.html` の初期文言、操作状態テスト、Browser UI期待値も揃えます。
- Issue #13 の次対局開始・再戦導線には変更を加えていません。

#### 自動検証と公開結果

- コード変更commit／公開対象SHA: `fef309d9898ec2e62ac01a4a9769fcbbe9fe3f42`。push後の[GitHub Actions run 41252395828](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41252395828) はsuccessです。
- 関連単体テスト: `tests/action-panel-state.test.ts`、`tests/action-panel.test.ts` の2ファイル成功。全体 `npm test`: 1,310成功、失敗0、skip 0。
- `npm run build`（アプリTypeScript型検査を含む）、`npm run typecheck:worker`、docs-check／`git diff --check` は成功。
- Browser UI: Chromium 34実行、WebKit 22実行がすべて成功。失敗・timeout 0。`browser-round-end-ui.py` と `browser-online-waiting-room.py` も両エンジンで成功し、320px相当の最終操作ボタン表示・横並びを確認しました。
- Deploy gate の `browser-ui-matrix-audit` と `release-freshness` はsuccess。Worker deploy、Production test、Pages build、Pages deployもsuccessです。
- Worker: https://heibon-mahjong-online.ak-sekine.workers.dev 。Pages: https://ak-sekine.github.io/heibon-mahjong/ 。
- iPhone Safari実機確認は未実施です。実機確認と最終判定までIssue #12はOpenのままです。

## 2026-11-01 追補：結果操作ボタンのフォント統一

### 報告とコード調査

- ユーザーのiPhone Safari実機スクリーンショットで、通常局終了時の「局の結果」が「次の局へ」より太く見えるとの報告を受けました。これは修正前の不具合報告であり、修正後の成功確認ではありません。
- `index.html` の共通操作テンプレートにある3ボタン（`data-panel-part="show-result"`、`next-round`、`show-match-result`）は、オフラインとオンラインで `src/ui/action-panel.ts` の `mountActionPanel()` が同じ `control-action-button` クラスのまま複製し、それぞれ `#show-result`／`#next-round`／`#show-match-result` と `#online-show-result`／`#online-next-round`／`#online-show-match-result` のIDを割り当てます。
- 原因はローカルの `#show-result` にだけ適用されていた `#result-dialog button,#show-result` ルールです。`#show-result` の高詳細度セレクターにある `font:inherit` が、共通 `.control-action-button` の `font-size:14px` を上書きし、親から16pxを継承していました。「次の局へ」と「順位確認」は14pxです。3ボタンはいずれもweight `600` でした。CSS上のフォントファミリーはrootの `system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`、line-heightとletter-spacingは共通の継承値（`normal`）です。
- ネイティブ `button` のブラウザー既定フォントは `.control-action-button { font:inherit; ... }` で上書きされます。`disabled` ルールはcursor、`:active` ルールは背景色だけを変更し、フォント関連の指定差はありません。結果ダイアログの `#result-dialog button` と `#match-result-dialog button` は別UIのままです。オンライン操作ボタンには `#show-result` セレクターが当たらず、修正前から3対象ボタンは共通の14pxでした。
- 共通CSSの `.control-action-button` がすでに対象全ボタンの基準です。専用指定を足さず、`#result-dialog button,#show-result` から `#show-result` だけを除き、結果ダイアログ内のボタン指定を維持しました。通常操作ボタン全体や色・押下・無効状態のルールには変更を加えていません。

### 修正・自動検証

- 修正後は対象の3ボタンすべてでroot system UIフォント、14px、weight `600`、継承line-height、継承letter-spacingを共通操作ボタンから使用します。CSS変更前のローカル「局の結果」は16pxで、それ以外の対象は14pxでした。
- `tests/browser-round-end-ui.py` にオフライン通常局／対局確定終了時のcomputed style比較を追加しました。既存の320、375、390、430px幅を含みます。
- `tests/browser-online-waiting-room.py` にオンライン用の専用Browser UI検証を追加し、320、375、390、430pxの通常局／対局確定終了時に同一ブラウザー内のcomputed `font-family`、`font-size`、`font-weight`、`line-height`、`letter-spacing` と横並び・画面内配置を比較します。CI matrixではChromiumとWebKitの両方で実行します。

### 自動検証と公開結果

- コードcommit: `567a348eb76e59f4f68d923069b71678db7bc897`。Browser UI matrix件数の期待値を修正したfollow-up commit: `47f91b3414eb108f7137aaab598b6b1eb71beb62`（2026-11-01の検証対象SHA）。
- `npm test`: 73/73テストファイル成功、失敗0、skip 0。`npm run build`、`npm run typecheck:worker`、Browser UI Python構文検査も成功。
- Browser UI matrixの実行選択テストは初回にChromium 35件／WebKit 23件に対して旧件数34／22を期待して失敗しました。この時点ではChromiumブラウザーの起動前でした。manifest期待値を58合計、35 Chromium、23 WebKitに更新し、`python tests/test_browser_regressions_selection.py` は5件成功しました。
- [最終検証・公開対象のGitHub Actions run 41256973128](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41256973128) はsuccess。`detect-changes`、`docs-check`、`verify`、Browser UI、matrix audit、release-freshness、Worker deploy、Production test、Pages build、Pages deployがすべてsuccessです。Chromiumは35/35件、WebKitは23/23件成功し、失敗・timeoutはありません。
- computed style回帰は、オフライン通常局「局の結果」対「次の局へ」、対局確定終了時「局の結果」対「順位確認」を検証します。オンラインも同じ2状態を検証します。Chromium／WebKitの両方でオンライン字体シナリオは320、375、390、430pxすべてpassし、横並び・画面内表示もpassしました。`browser-round-end-ui.py` はオフラインの幅320、375、390、430pxを含む各viewportでsuccessしました。
- 操作ラベルとクリック動作について、従来の操作状態・Browser UIの対局終了シナリオがsuccessしました。結果ダイアログ専用ボタンCSSは今回変更せず、結果操作共通ボタンの既存デザイン・有効状態を維持しています。
- Worker: https://heibon-mahjong-online.ak-sekine.workers.dev （deploy success、Production test success）。Pages: https://ak-sekine.github.io/heibon-mahjong/ （build／deploy success）。

初回Actions run [41256771438](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41256771438) では、Chromium選択件数の旧期待値が原因でBrowser UI前段が失敗し、matrix auditはfailure、公開工程は実行されませんでした。WebKit 23件はこのrunでもsuccessでした。件数テストを修正したfollow-up SHA `47f91b3` のrun 41256973128でChromium／WebKit両方とmatrix auditを再実行し、公開までsuccessを確認しています。

`git diff --check` はcommit前に成功しました。Codex CloudではChromium／WebKitを起動していません。既知の実行環境制限に従い、Browser UIはGitHub Actions上で実行しました。

### iPhone Safari実機確認

修正後のiPhone Safari実機表示は未確認です。ユーザーの修正前画像を成功確認として扱いません。公開後、通常局終了時に「局の結果」「次の局へ」、対局確定終了時に「局の結果」「順位確認」の文字の見た目が揃い、320px相当でも横並び・非折返し・画面内表示が保たれることをユーザーに確認いただきます。Issue #12はその報告までOpenのままです。
