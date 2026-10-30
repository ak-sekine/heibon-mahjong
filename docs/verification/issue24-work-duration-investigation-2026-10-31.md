# Issue #24 作業時間調査

調査対象: 2026-10-30のボタン配色単色化と、前回の役割別配色導入にかかったと報告された204分。

今回の開始・終了、コマンド、テスト、待機の一次記録は[作業計測ログ](issue24-work-timing-2026-10-31.md)にあります。開始時の環境時計は依頼のファイル日付より1日早い `2026-10-30 UTC` を示しました。記録名は指定を維持し、本文時刻は環境時計の値です。

## 前回204分について確認できた事実

| 項目 | 確認結果 |
|---|---|
| 利用者から報告された総時間 | 204分。報告値であり、GitHub履歴から再計算した作業時間ではない |
| 正確な開始・終了 | Codex開始・終了ログは取得できず、確認不能 |
| Issue | #24作成 2026-10-30 14:07:39 UTC。作成時刻は作業開始時刻を示さない |
| 初回実装 | `77e741266547f098ad5df357415b10de4c776259`、14:42:31 UTC |
| 初回Actions | run [41074039994](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41074039994)、14:42:43 UTC開始 |
| 最終main | `96855ad9858256a6a79cc642652562b647596c7f`、17:44:10 UTC |
| 最終文書確認 | Deploy run [41101164551](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41101164551)、17:44:19–17:57:23 UTC、success。Browser UI jobはdocs-only判定でskip |
| Issueコメント | [コメント](https://github.com/ak-sekine/heibon-mahjong/issues/24#issuecomment-6529517614)、17:45:51 UTC |
| 履歴上の区間 | 初回Actions開始から最終文書run完了までは194分40秒。Issue作成から同run完了までは229分44秒。どちらも204分と同じ開始・終了定義とは確認できない |
| 変更規模 | 作業前基準 `93d56998d72cdd2594403fead0e11199fb7d5020` からmainまで11 commits、23 files、+596/−141。初回実装commit単体は20 files、+462/−139 |
| Codexの作業ログ | アクセスできず。考慮時間、編集・調査・応答待ちの正確な内訳は未確認 |

### 関連Actionsの記録

全runは `Deploy to GitHub Pages and Cloudflare Workers`。workflow作成時刻と実行開始時刻はAPIの秒精度で同時刻に見え、queueは0秒表示です。秒未満のworkflow queueとBrowser jobの個別queue時刻は取得できません。表の「回帰step」はBrowser UI回帰stepの時間です。

| Run ID | SHA短縮 | UTC開始–完了 | 全体 | Browser job | 回帰step | 結果 |
|---|---|---|---:|---:|---:|---|
| [41074039994](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41074039994) | `77e7412` | 14:42:43–14:45:40 | 2:57 | 1:36 | 0:34 | failure |
| [41074869643](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41074869643) | `499ebc8` | 14:48:13–14:53:35 | 5:22 | 4:07 | 3:08 | failure |
| [41075893276](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41075893276) | `2a44e96` | 14:55:03–15:15:14 | 20:11 | 18:55 | 17:54 | failure |
| [41079224444](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41079224444) | `94b4182` | 15:16:48–15:25:35 | 8:47 | 7:15 | 6:02 | cancelled |
| [41080251951](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41080251951) | `e665fb1` | 15:23:22–15:47:37 | 24:15 | 20:50 | 19:13 | failure |
| [41084368009](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41084368009) | `88739a5` | 15:50:15–16:08:00 | 17:45 | 16:35 | 15:04 | failure |
| [41087399963](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41087399963) | `94b6939` | 16:10:09–16:28:17 | 18:08 | 16:47 | 15:46 | failure |
| [41090836337](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41090836337) | `c969...` | 16:32:34–16:52:27 | 19:53 | 18:53 | 17:40 | failure |
| [41094140527](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41094140527) | `32cb00f` | 16:54:48–17:12:40 | 17:52 | 16:39 | 15:25 | failure |
| [41097137206](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41097137206) | `658b2d7` | 17:14:56–17:42:24 | 27:28 | 21:37 | 19:04 | success; Chromium 35 + WebKit 21 |
| [41101164551](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41101164551) | `96855ad` | 17:44:19–17:57:23 | 13:04 | skip | skip | success; docs-only |

Browser UI runは合計10回（failure 8、cancelled 1、success 1）。10回のworkflow区間の合計は175分42秒、開始済みBrowser jobは合計143分14秒、回帰stepは合計129分50秒です。各runの区間は合計と作業者の待ち時間が同じとは限らず、41079224444と41080251951は2分13秒重なっています。CI時間を204分の全体作業時間に置き換えることはできません。

8つの失敗はすべてBrowser UI assertionでした。記録で追跡できた修正は、(1)メニュー通常色、(2)disabled文字色、(3)busy適用前のdisabled計測順、(4)spinner表示assertion、(5)320px診断close高さの既存baseline、(6)dialog close後のfocus復帰待機、(7)375px/1280pxの64×60px既存寸法、(8)検証画面の小型ボタンに対する誤った44px前提、です。キャンセルrunの取消理由は取得できず、重複runとの因果関係は断定しません。

この履歴は**多数のBrowser UI再実行とそのassertion修正にかなりのCI時間が使われた**ことを示します。一方、204分の正確な内訳、各修正の人手時間、他の待機・作業時間は不明なため、これを204分全体の根本原因とは断定できません。

## 今回の計測方法と制約

- 開始: 2026-10-30 22:14:48.186224640 UTC。計測準備を最初のリポジトリ調査より前に開始。
- 時計: UTC壁時計 (`date --iso-8601=ns`) と単調増加時計 (`time.monotonic_ns`)。コマンドラッパーは開始・終了の両方を記録。
- フェーズ: P01–P13で管理。フェーズ時間とコマンド時間は重複計上しない。
- ローカルテストとGitHub Actionsは区別。外部待ち、再実行、失敗調査の実時間は取れた場合のみ記録。
- Codex内部処理時間、未記録の編集間隔、発行前のCI時間は取得不可。計測ログに推測値を補わない。
- この計測のために使ったPythonラッパー自体の実行時間はコマンド時間に含む。計測オーバーヘッドの別個の較正は未実施。

## 今回の実測結果

実装・検証、設計文書のpush、および関連するActions runを確認済み。計測・分析文書の最終pushとIssueコメントはこの調査の終盤に実施する。時刻別の一次記録は[作業計測ログ](issue24-work-timing-2026-10-31.md)を正とする。

| 指標 | 実測・状態 |
|---|---|
| 全体の開始–終了・壁時計経過 | 開始は2026-10-30 22:14:48.186224640 UTC。終了点は関連Actions確認後に作成するIssue #24最終コメントの`created_at`。正確なUTC時刻・壁時計総時間はそのコメントと最終報告で示す |
| フェーズ別時間 | P00–P13を計測ログに記録。P01–P03・P07・P10の連続作業時間は未計測。計測可能なコマンド・外部runは別表 |
| `npm test` | 3回、各69/69 pass。計100.711秒 |
| `npm run build` | 3回成功。計10.569秒 |
| ローカルBrowser UI | Chromiumのカスタム実行。WebKit browser取得はHTTP 403でローカル未実行。CI run 41142201343でChromium35/WebKit21の全56 variants success |
| 失敗・再試行 | `npm test`/buildは各3回success。Actionsはrole testの旧色期待で1 run failure後、テスト期待値を修正したSHAで全56 variantsを再実行しsuccess。ローカルBrowser UIの失敗も計測ログに記録 |
| CI | Deploy workflow run [41139721748](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41139721748) failure、[41142201343](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41142201343) success、設計文書run [41145000714](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41145000714) docs-check success・deploy skip。Worker diagnostics [41141767181](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41141767181) skipped、[41144329035](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41144329035) success、[41145054960](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41145054960) success |
| 未計測時間・処理時間 | Codex内部時間、連続した文書編集時間、未記録の切替・思考間隔は取得不可。計測ラッパーのwall timeは記録するが計測器自体の総負荷は別に較正していない |

### ローカルBrowser UIの確認範囲

- Chromium 154: 共通色、状態、focus、dialog、手牌選択、8px移動などを5 viewportで通過。診断closeボタンの既存テスト上限60pxに対し実測66pxだったため、残りの一時確認ではテストコピーの上限だけ66pxとした。アプリCSSとリポジトリ上の60px基準は変更していない。
- `browser-action-panel.py`: 4 viewportで静的・動的鳴き/カン候補の共通色を通過。
- `browser-online-waiting-room.py`: 初期ローカル試行では`VITE_ONLINE_API_URL`未設定のため作成buttonがdisabledでした。ViteをCIと同じmock URLで起動し直し、`NEXT_ROUND_ONLY` focused online flowが3.108秒で成功しました。待機室buttonのcomputed styleを確認し、次局scenarioまで実行しました。
- `npm run test:browser`: Playwright WebKit browserがなく開始不可。取得先はHTTP 403 `Domain forbidden`。
- 実機のiPhone Safari/Android Chromeは未確認。

| 実行ID | コマンド | 時間 | 結果・件数 | 再実行・理由 |
|---|---|---:|---|---|
| T01 / C37 | `npm test` | 36.236秒 | 69/69 pass | 初回実行 |
| T02 / C84 | `npm test` | 32.483秒 | 69/69 pass | CSS優先順位修正後に全unit/integrationを確認 |
| T03 / C85 | `npm test` | 31.992秒 | 69/69 pass | 最終CSS/assertion状態を確認 |
| T04 / C38 | `npm run build` | 3.650秒 | success | 初回build |
| T05 / C53 | `npm run build` | 3.200秒 | success | 手牌disabled CSS修正後 |
| T06 / C86 | `npm run build` | 3.719秒 | success | 最終build |
| T07 / C39 | `npm run test:browser` | 0.783秒 | WebKit browser executable不足で開始不可。assertion 0件 | browser取得の前提確認 |
| T08 / C49 | Chromium `browser-button-roles.py` | 2.847秒 | 320×568の診断close高さ66pxが既存60px上限を超えて失敗 | Issue #10の既存baselineと環境差を分離 |
| T09 / C52 | Chromium用一時copy | 3.436秒 | 手牌disabled背景が透明にならず失敗 | CSS selectorの詳細度を調査し修正 |
| T10 / C54 | Chromium用一時copy | 3.726秒 | 5 viewport pass | T08の上限のみ一時copyで66pxにして後続確認 |
| T11 / C58 | Chromium `browser-action-panel.py` | 1.397秒 | previewからのdynamic import失敗 | Vite dev serverで再実行 |
| T12 / C61 | Chromium `browser-action-panel.py` | 5.775秒 | 4 viewport pass、動的鳴き/カン候補を含む | Vite dev serverへ切替えて再実行 |
| T13 / C63 | Chromium `browser-online-waiting-room.py` | 2.109秒 | menuの旧role-color期待値で失敗 | 単色期待値へ更新して再実行 |
| T14 / C64 | 同上 | 3.474秒 | `#online-create`がdisabledのまま、待機室に未到達 | 作成フロー前提を調査 |
| T15 / C82 | `NEXT_ROUND_ONLY` online test | 32.749秒 | click待ち30秒でtimeout、待機室未到達 | local Vite起動設定を確認 |
| T16 / C101 | `NEXT_ROUND_ONLY` online test | 0.782秒 | Chromium起動時にsandboxの`SIGTRAP`となり開始不可 | 実行環境にsandbox追加権限を付けて再実行 |
| T17 / C102 | `NEXT_ROUND_ONLY` online test | 3.108秒 | success。オンライン待機室button色、対局・結果・次局scenarioを通過 | ViteにCI同等の`VITE_ONLINE_API_URL=https://online-mock.invalid`を設定して再実行 |
| T18 / C113 | 更新した`browser-button-roles.py`のtemporary copy | 4.648秒 | 5 viewport success。全通常/無効button色、role代表値、focus/busy/dialog、手牌透明背景・選択8px、verification pagesを確認 | system Chromium 154の診断close 66pxに合わせ、一時copyの既存上限60pxのみ66pxに変更。repoの上限は維持 |

unit testは計3回、全て69件成功、合計100.711秒。buildは計3回成功、合計10.569秒。Browser UIは計12回、合計64.834秒のコマンド実行。Chromiumカスタム確認11回は4回成功・7回失敗、Playwright標準suiteはbrowser executable不足で開始できませんでした。オンライン作成buttonがdisabledだった2回はローカルmock URL未設定が原因と分かり、設定後のfocused online scenarioは成功しました。ローカルChromiumで失敗したassertionの件数を独立集計できるログはなく、件数は「未計測」です。

## GitHub Actions: run 41139721748

Workflow: `Deploy to GitHub Pages and Cloudflare Workers`、対象SHA `b9b4d7f51982bbe83d2b32f965b01cf29457bf79`。

| 指標 | UTC | 時間 / 結果 |
|---|---|---|
| run queue | created 22:40:57 / started 22:40:57 | 0秒表示（API秒精度。秒未満は取得不可） |
| run execution | 22:40:57–23:00:29 | 19分32秒、failure |
| docs-check job | start 22:41:00 / end 22:41:08 | queue 3秒、8秒、success |
| detect-changes job | start 22:41:00 / end 22:41:12 | queue 3秒、12秒、success |
| verify job | start 22:41:15 / end 22:42:02 | queue 2秒、47秒、success。regression 23秒、Worker typecheck/buildもsuccess |
| browser-ui job | created 22:42:02 / start 22:42:05 / end 23:00:29 | queue 3秒、18分24秒、failure |

同じSHAの補助workflow [41141767181](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41141767181) `Production Worker diagnostics` は23:00:32 UTCに作成・開始し、23:00:33までに`skipped`でした（job skip）。

Browser UI jobのstep時間は次の通りです。unit/integration testとbrowser site build stepはverified build再利用によりskipされ、別jobの`verify`がそれらを含む検証を行いました。

| Step | UTC | 経過 | 結果 |
|---|---|---:|---|
| Checkout | 22:42:07–22:42:13 | 6秒 | success |
| setup-node / setup-python | 22:42:13–22:42:14 | 1秒未満 | success |
| npm ci | 22:42:14–22:42:20 | 6秒 | success |
| verified build artifact download | 22:42:20 | 0秒表示 | success |
| pip install playwright | 22:42:20–22:42:23 | 3秒 | success |
| Playwright Chromium/WebKit install | 22:42:23–22:42:57 | 34秒 | success |
| Vite + Browser regression | 22:42:57–23:00:23 | 17分26秒 | failure |
| Browser results/screenshots upload | 23:00:23–23:00:27 | 4秒 | success |

Regression scriptは56 variantsを順番に実行します。run 41139721748では54件成功、1件失敗、残る1件は未開始。job logにある55実行のduration合計は1,044.474秒（17分24.474秒）でした。Chromium 35実行中34件成功・1件失敗、WebKit 20実行はすべてsuccess。失敗は最後の`tests/browser-button-roles.py` Chromium variantで、320px時の`#online-close`が旧B色`rgb(248, 247, 242)`を期待していたものです。computed styleは共通通常色`rgb(248, 220, 145)`、文字`rgb(21, 78, 60)`でした。次のWebKit variantは同じscriptのChromium失敗によって開始されませんでした。

run 41139721748の最長variantは次の3件で、合わせて6分30.343秒でした。

| Browser UI variant | elapsed | result |
|---|---:|---|
| `browser-round-end-ui.py` WebKit | 172.583秒 | success |
| `browser-riichi-discard-layout.py` Chromium | 128.005秒 | success |
| `browser-round-end-ui.py` Chromium | 89.755秒 | success |

このCI jobの長さは単一assertionの失敗処理が遅いことを示しません。失敗したassertion自体は0.802秒で終了し、それ以前に54 variantが17分以上順次実行されていました。全体時間に対する改善余地は、不整合をpush前に検出しfailed runを避けることと、Browser UI suiteの長いvariantを別途計測・検討することにあります。並列化の効果と品質リスクは今回測定していません。

修正はテスト期待値のみです。role代表値に危険操作、見送り、キャンセル、閉じる、全通常/無効ボタンの共通色を明示し、手牌選択・無効背景は透明の期待へ更新しました。ローカルChromium 5 viewportの更新テストは、既知の診断close高さ差を一時copyで分離した上でsuccessです。follow-up commit `268a7d1d0bb9724d06170f5cdd6e20bebaa092a1` のrun [41142201343](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41142201343) は以下の通りsuccess。

### GitHub Actions: run 41142201343

Workflowは同じ`Deploy to GitHub Pages and Cloudflare Workers`、対象SHA `268a7d1d0bb9724d06170f5cdd6e20bebaa092a1`。

| 指標 | UTC | 時間 / 結果 |
|---|---|---|
| run queue | created/start 23:04:31 | 0秒表示（秒未満は取得不可） |
| run execution | 23:04:31–23:24:52 | 20分21秒、success |
| docs-check | start 23:04:34 / end 23:04:46 | queue2秒、12秒、success |
| detect-changes | start 23:04:39 / end 23:04:49 | queue7秒、10秒、success |
| verify | start 23:04:52 / end 23:05:51 | queue3秒、59秒、success。npm regression33秒、Worker typecheck2秒、Pages build4秒 |
| browser-ui | created23:05:52 / start23:05:54 / end23:24:51 | queue2秒、18分57秒、success |
| Browser regression step | 23:06:46–23:24:45 | 17分59秒、success |
| Browser test commands | 56 variants | 合計1,076.903秒（17分56.903秒）、56/56 success |

Browser test variantsはChromium35件、WebKit21件です。全variantの実開始・終了・経過・結果は[計測ログのB01–B56表](issue24-work-timing-2026-10-31.md)にあります。最長variantは`browser-round-end-ui.py` WebKit 183.032秒、次いで`browser-riichi-discard-layout.py` Chromium128.034秒、`browser-round-end-ui.py` Chromium94.312秒でした。

verify stepでPages production buildは成功しましたが、follow-up commitはtest-onlyだったためdeploy-worker、production-test、pages-deploy、pages-build jobsはskipされました。公開Pages/Workerへの反映は未確認です。同SHAのProduction Worker diagnostics run [41141767181](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41141767181)もskipされました。

同SHAのProduction Worker diagnostics run [41144329035](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41144329035)は23:24:54–23:25:33 UTC、job queue4秒・job34秒でsuccessでした。最終文書SHA `767261be565844ecf409b2304b2a9a05b4120193`に対するdiagnostics run [41145054960](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41145054960)も23:32:15–23:32:54 UTC、job queue3秒・job35秒でsuccessでした。両runのproduction Worker state diagnostics stepはsuccessです。これらは本番状態を診断したもので、Pages/Workerをdeployした結果ではありません。run 41142201343のdeploy系jobはskipのままで、公開への反映は引き続き未確認です。

## 204分との比較

| 指標 | 前回（role colors） | 今回（単色統一） | 比較上の制限 |
|---|---|---|---|
| 総時間 | 利用者報告204分。開始/終了時刻不明 | 2026-10-30 22:14:48.186224640 UTC開始。終点はIssue #24最終コメントのcreated_at。正確な総時間は最終報告に記録 | 前回の境界がないため、総時間の短縮率は算出不可 |
| 変更ファイル・行数 | 11 commits、23 files、+596/−141 | `10 files、+1059/−33 lines`（前回main `96855ad`から、コード・テスト・記録を含む） | 変更規模・テスト修正を含め一対一比較できない |
| `npm test` | 69件successの記録あり。回数・コマンド時間は記録なし | 3回、各69/69、合計100.711秒 | 前回回数・時間は比較不能 |
| build | 成功記録あり。回数・時間は記録なし | 3回success、合計10.569秒 | 前回回数・時間は比較不能 |
| Browser UI | 10 Deploy run（8 failure、1 cancelled、1 success）、Browser job合計143:14、回帰step129:50 | 2 Deploy run: 1 failure (19:32)、1 success (20:21); Browser regression 17:26・17:59 | 追加の修正commitが必要となったfirst runを含む。CI条件とローカル条件が異なる |
| shell command時間 | 前回は個別コマンド記録なし | `172件記録、163件時間計測。command process elapsed合計 341.023秒。開始–終了intervalのunion 326.408秒、重複 14.615秒。nonzero exit 23件（非テストの探索・環境診断も含み、test失敗数ではない）。` | 前回は比較不能 |
| 修正やり直し | Browser assertionを8回直し、8 failure runの後にsuccess | `#online-close`の旧色期待を修正。1 full run failureの後にfollow-up full run success。failure診断40秒、test編集時間は未計測 | 前回204分全体の因果を断定しない |
| 文書更新時間 | 未記録 | 一部patch callのwall timeのみ記録。全編集時間は未計測 | 直接比較不能 |

今回も204分と同じ時間になるとは限りません。今回の局所測定から前回のCodex作業時間を逆算しません。

## #23との比較

[Issue #23調査](browser-ui-ci-duration-issue23-2026-10-30.md)は同一SHA・同一52シナリオでBrowser UI jobが15:23、18:10、13:11と変動し、scenario合計も821.509秒、989.765秒、712.515秒と変わったことを記録しました（run [40965496194](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40965496194)、[40967544168](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40967544168)、[40969954422](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40969954422)）。OS image、Node、Python、Playwright、browser versionは一致していました。runner region・負荷等の差を観測したものの、因果関係を分離できず根本原因は未特定です。

前回Issue #24の成功Browser jobは21:37で、#23の計測値より長い一回でした。今回の追従SHA run 41142201343のBrowser regression stepは17:59、56 variants successでした。#23の13:11–18:10と数値上は範囲内ですが、#23は52 scenariosでBrowser suite条件が同一ではなく、runner処理時間の因果比較には使えません。#23の履歴はCI環境の実行時間変動を示しますが、今回の作業時間やIssue #24の全204分を説明するものではありません。

## 今回の長時間工程と確認できた要因

| 項目 | 実測結果 | 読み取り |
|---|---|---|
| 全体経過 | 開始は22:14:48.186224640 UTC。最終時刻・壁時計経過はこの作業のIssue #24最終報告に記録 | 前回204分とは開始・終了定義が異なるため短縮率を出さない |
| 単体テスト | `npm test` 3回、各69/69成功、合計100.711秒 | 3回とも成功。後続実行はCSS/テスト期待値の更新後確認 |
| build | 3回success、合計10.569秒 | build自体は短く、今回の長い工程ではない |
| ローカルBrowser UI | 12 command、合計64.834秒。4 success、7 failure、Playwright標準suite 1回はbrowser不足で開始不可 | 一部の失敗はローカル環境・test expectationが原因。連続した人手診断時間は大半未計測 |
| Browser UI Actions | 2回の全suite: 最初は19:32 workflow / 17:26 regressionで1 assertion failure、追従runは20:21 workflow / 17:59 regressionで56/56 success | 最長の測定済み工程は追従runの17:59 regression（Browser job18:57）。逐次実行が長いが、その分全56 variantを実行して品質を確認した |
| CI queue | workflow queueは0秒表示、各job queueは2–7秒。APIの秒精度より細かいqueueは取得不可 | 今回の長いCI時間をqueueが占めた証拠はない |
| CI再実行 | `#online-close`の旧B色期待値が1件失敗。test-only commit後に全suiteを再実行しsuccess | failure調査の時刻は40秒で確認。テスト編集に要した時間は未計測。Browser suite再実行はCI実行時間として追加だが文書編集を並行し、同じ分数を作業停止時間には数えない |
| その他の長時間処理 | ローカルVite preview commandは151.507秒起動、online click timeoutは32.749秒。Playwright CDN取得失敗は2.423秒 | Browser操作用serverを使った時間と、接続先未設定の調査に伴う再実行が計測された。activeな編集時間は分離できない |
| 作業が進まなかった時間・中断 | 明示的な作業中断・ユーザー応答待ちはなし。個々のツール間隔のうち、作業/待機を区別できない部分はある | idle時間がなかったと断定はできない。分単位の空白は未計測 |
| 計測の限界・オーバーヘッド | P00準備18.210秒。wrapper process durationはコマンド行に記録。計測器そのものの負荷、文書編集時間、Codex内部処理時間は未較正/未取得 | 未計測区間から開始・終了・人手時間を推測しない |

Actions intervalとBrowser variantの時間は親workflow/stepに含まれ、同じ時間を加算していません。文書作業もCI待ちと並行しているため、フェーズ別実測値の合計は全体時間に一致しません。P01–P03、P07の全体、P10の連続時間を特定できないことがその差の主因です。

## 改善候補

改善効果は今回の作業から実証されていない限り「未測定」です。CI・テスト基盤の変更は今回行いません。

| 改善対象 | 実測根拠 | 具体案 | 期待効果 | 難易度 | 品質リスク | 優先度 |
|---|---|---|---|---|---|---|
| コード調査・対象確定 | 今回は56種類の既存分類、CSS、静的/動的生成箇所を確認。調査フェーズの一部は未計測 | Issue #9の分類を更新対象一覧として使い、最初に静的HTML・動的renderer・test pages・状態規則を全列挙 | 漏れや往復調査の減少。時間効果は未測定 | 低 | 低 | 高 |
| 軽量テスト先行 | `npm test` 69件約32秒。`button-roles.test.ts`ファイルは約108ms | CSS token・role class・無効/busy規則の軽量テストを変更直後に実行し、広い回帰を後段に置く | 誤ったCSSの検出待ち短縮が見込まれる。計測効果は未測定 | 低 | 低 | 高 |
| Browser assertionの共有 | 前回8失敗は全てBrowser UI前提/期待値。今回のfirst runは54/55実行まで進み、`#online-close`旧色期待1件でfull run 19:32がfailure | 変更した配色token・role代表値・disabled/busy/focusの期待値を共通fixtureに寄せ、役割配色との二重期待を防ぐ | 期待値不一致によるCI再実行回避を期待。今回同じrunの回避効果は未測定 | 中 | 低 | 高 |
| 変更対象のfocused Browser UI | first Actions regression17:26、最後に`browser-button-roles.py` Chromiumが0.802秒で失敗。更新テストのローカル5 viewport実行は4.648秒 | UI変更をpush前に該当Browser scriptで確認し、その後に全Chromium/WebKit suiteを一度実行 | first failed Actions run19:32が回避できた可能性。期待効果は未測定（ローカルとCI環境差あり） | 低 | 低 | 高 |
| 再実行 | 前回10 run中8 failure・回帰step129:50。今回first run54 variant pass、1旧期待failure | 失敗時はlogとartifactで該当scriptを特定し、focused diagnostic rerunで原因確認。その後の最終commitでは全suiteを必ず通す | 原因診断の待機を減らす可能性。数値効果は未測定 | 中 | 低 | 高 |
| 最終回帰の構成 | 今回`npm test` 3回100.711秒、build3回10.569秒。full Browser suite first run17:26、run2 regression17:59 | 軽量unit testとbuildを先に実行し、テスト・実装を同じSHAにまとめてから全Browser regressionを実行 | 安全性を維持しつつfailed runを防ぐ可能性。効果は未測定 | 低 | 低 | 高 |
| Browser UI環境 | WebKit取得HTTP 403。ローカルonline作成disabledは`VITE_ONLINE_API_URL`未設定と判明し、CI mock URLでのfocused retryは成功 | ローカル起動手順にもworkflowと同じ`VITE_ONLINE_API_URL=https://online-mock.invalid`を指定し、CIと同じ版のChromium/WebKitを事前導入する | 設定不足によるfalse failure回避。時間効果未測定 | 低 | 低 | 高 |
| Chromium/WebKit並列化 | first run regression17:26（commands17:24.474）。run2 regression17:59、top3 variants計6:45.378 | Browser別jobを並列化する案を計測比較。CPU/memory競合、artifact順序、失敗診断も測る | 理論上wall time短縮の可能性。今回実装・測定なし | 高 | 中 | 中 |
| CI cache | first Browser jobで`npm ci`6秒、Playwright Chromium/WebKit install34秒。Node cache hit。Regression17:26 | npm/Playwright cache hit率とbrowser download timeを測定し、結果に応じてcache見直し | 対象install stepの改善可能性はあるが、suite全体への効果は未測定 | 中 | 低 | 低 |
| workflow重複・queue | first run queue0秒表示、job queue2–3秒。旧run410792は410802と2:13重複しcancelled | concurrency group/cancel-in-progress設定とdispatch/commit対応を監査し、重複runを防ぐ | 今回のqueueは遅延要因ではない。過去重複runの効果は未測定 | 中 | 中 | 低 |
| 文書のみ変更 | run41101164551と今回のrun41145000714はBrowser UIをskipし、docs-checkにsuccess | 既存change classifierがdocs-onlyを正しく分類することを保ち、文書更新ではfull browser suiteを起動しない | Browser jobを省略。両runで観測済み。ページ公開は実施していない | 低 | 低 | 中 |
| Actions待機中の作業 | 文書とActionsの並行時間は旧作業ログなし | CI実行中にレビュー文書と分析表を完成し、同一時間帯を待ちとして重複計上しない | 人の作業空白を減らせる。今回効果は未測定 | 低 | 低 | 中 |
| 計測ログ | 今回のwrapperはコマンド単位で単調時計を記録。wrapper/formattingの一部は未計測 | phase start/end・subprocess結果・test countをJSONLで自動保存し、最後に表へ変換 | 欠落・整形時間減少。効果は未測定 | 中 | 低 | 高 |

## 今後のIssue候補

1. **Browser UI共通assertionとローカル実行条件を整備** — 既存baselineと色・状態の共通検証をまとめ、Chromium/WebKitを再現できる開発環境を記録する。
2. **CI Browser UI runtimeの計測と実行方式の比較** — #23の原因未特定を継続し、同一SHA複数run、job/step/scenario、runner region、cache、browser別並列化を比較する。CI高速化の変更は独立した実測根拠を得てから検討する。
