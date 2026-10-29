# Browser UI CI実行時間増加の原因調査 — Issue #23

**Phase 1 判定：B（原因候補まで。具体的な根本原因は未確定）。Phase 2：計測機能を実装し、ローカル確認済み。計測有効のCI比較は未実施。**

## 1. 調査目的と開始状態

Issue [#23](https://github.com/ak-sekine/heibon-mahjong/issues/23)について、Browser UIの実行増加がコード回帰か、個別待機か、実行環境変動かを既存CI履歴から調べた。ゲーム仕様・テスト条件・CI成功条件は変更していない。

- 調査開始時：ローカルHEAD `3ed08d175b1a3e90738c6ac7581cfeb5dbeff462`、ブランチ `work`、作業ツリーclean。
- GitHub APIで確認したmainは `e01c96e3ee8e5fe32916b19bd0cb8ec320e8b8f3`（Issue #21最終コミット）。通常の `git fetch origin` はproxy接続で失敗したが、許可されたネットワーク実行でfetchに成功し、同じSHAを `origin/main` として確認した。調査用ブランチはそのSHAから開始。
- Issue状態確認時：#21 Closed、#22 Open、#23 Open。調査中に状態を変更していない。
- [Issue #21記録](browser-ui-regression-issue21-2026-10-29.md)はmain統合後のrun 40907137770を18分43秒とし、Issue #23へ時間差調査を引き継いでいる。

## 2. 比較対象run

| | Run A（比較） | Run B（main統合後） |
|---|---|---|
| Actions | [40900910487](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40900910487) | [40907137770](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40907137770) |
| 対象SHA | `7926d869fd91285ae7dbf77b93d8063b17d9b6b3` | `3ed08d175b1a3e90738c6ac7581cfeb5dbeff462` |
| workflow / event | Browser UI verification / workflow_dispatch | Deploy to GitHub Pages and Cloudflare Workers / push |
| branch | `test/issue-21-browser-regression` | `main` |
| 実行時刻 (UTC) | 2026-10-29 15:22:35–15:35:45 | 2026-10-29 15:59:47–16:19:38 |
| Browser UI job | 15:22:53–15:35:44（12:51） | 16:00:54–16:19:37（18:43） |
| runner | `ubuntu-latest`, ID 1000001763, Azure Central US | `ubuntu-latest`, ID 1000001767, Azure West US 3 |
| 結果 | 52件成功、失敗・timeoutなし | 52件成功、失敗・timeoutなし |

run Aとrun Bのworkflow呼び出し方は異なる。Aは単独dispatchでbrowser job内のunit testとbuildを実行。BはDeploy workflowから呼ばれ、先行するverify jobで成功したbuild artifactを再利用したため、browser job内のunit test/buildがskipされ、artifactをdownloadした。Browser UI本体は両方で52件を同じ順に実行した。

### 前後の成功run

| run | 結果・時間 | 補足 |
|---|---|---|
| [40897247248](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40897247248)（Run Aの前） | Browser job 18:13、テストstep 16:39、scenario計時16:37.150。52件成功。 | SHA 05848b334ac5eb73cb0f105337823a8d617cdcd8、runner ID 1000001757、Azure East US。Run Aより前の成功runでも長い時間が出ており、round-end-ui (WebKit 184.975s、Chromium 99.280s) と riichi-discard-layout (Chromium 107.187s) が遅かった。 |
| [40909995139](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40909995139)（Run Bの後） | workflow成功だがBrowser UI jobはskip。 | 文書のみの変更を検出。比較できるBrowser UI計時ではない。 |

Run 40897247248はRun Aの約22分前に始まり、Browser job時間は18:13でした。したがって18分台はmain統合後に初めて現れた値ではなく、12:51のRun Aが単発の短い値だった可能性を上げます。Run 408972とRun Aは異なるSHAのため完全な同一コミット比較ではありませんが、遅かった3つのscriptはいずれもIssue #21追加テストではなく、当時の同一suiteにも存在しています。

## 3. 環境情報

| 項目 | Run A | Run B |
|---|---|---|
| Runner version | 2.338.0 | 2.338.0 |
| Image provisioner | 20261021.618 | 20261021.618 |
| Ubuntu / image | Ubuntu 24.04.5 / ubuntu-24.04 20261025.353.1 | Ubuntu 24.04.5 / ubuntu-24.04 20261025.353.1 |
| Node / npm | 24.22.1 / 11.19.1 | 24.22.1 / 11.19.1 |
| Python | 3.12.15 | 3.12.15 |
| Playwright | 1.64.1 | 1.64.1 |
| Chromium | 156.0.8078.4 | 156.0.8078.4 |
| WebKit | 27.2 | 27.2 |

Run A/Bは別runner ID・別Azure regionに割り当てられた。Runner label、Ubuntu image release、Node/Python/Playwright/browserの版はログ上同じ。run AのSHAからrun BのSHAまでのGitHub compareは検証記録の文書2行追加だけで、アプリ・テスト・workflow・依存lockfileの変更はない。

同一SHAの追加3runもrunner version、Ubuntu image release、Node/Python/Playwright/browserの版がすべて一致した。追加runのrunner ID・regionは§7に記載した。run 2とrun 3は同じSouth Central US regionだが、実行時間は大きく異なる。

## 4. ジョブ時間の分解

| 区間 | Run A | Run B | B−A |
|---|---:|---:|---:|
| Browser job全体 | 12:51 (771s) | 18:43 (1123s) | +5:52 (+352s) |
| job開始→テストstep開始（checkout、setup、依存、build/install等） | 75s | 69s | −6s |
| 「Run Vite and browser regressions」step | 11:29 (689s) | 17:25 (1045s) | +5:56 (+356s) |
| scenario timingの合計（52 invocation） | 11:27.600 (687.600s) | 17:23.511 (1043.511s) | +5:55.911 (+355.911s) |
| Playwright install --with-deps | 36s | 44s | +8s |
| browser結果・スクリーンショットartifact upload | 約4s | 約5s | 約+1s |

setupの内訳はjob stepログから算出。Run Aは `npm test` 約19秒、build約2秒をbrowser job内で実行。Run Bは両stepがskipされ、verify jobのdist artifactを約1秒でdownloadした。Playwright installはRun Bが8秒長いが、テストstepの約356秒差を説明しない。Artifactは約39.89MB→39.92MBで差約0.08%、upload時間も両runとも数秒。したがって、観測された増加はsetupやartifact uploadではなくscenario実行step内にある。

scenarioごとの計測は各Pythonプロセス全体の経過時間で、Playwright起動・ページ操作・ブラウザー終了を含む。現行ログはブラウザー起動/終了を個別には計測していないため、この3要素をさらに数値分解することはできない。

Chromium 33件の合計は420.207秒→624.912秒（+204.705秒）、WebKit 19件は267.393秒→418.599秒（+151.206秒）。各scenarioの差分は52件すべてプラス。内訳は+10秒以上が10件、+5〜10秒が4件、+1〜5秒が22件、+1秒未満が16件。上位3件が合計差分の48.0%を占める一方、増加は少数テストだけではなく全体にも及んでいる。

## 5. シナリオ別時間（差分の大きい順）

時間は `run-browser-regressions.py` がActionsログに出力した各invocationのduration_seconds。重複するwaiting-roomスクリプトはmanifest上の環境フラグで区別した。

|Suite順|シナリオ|Browser|Run A (s)|Run B (s)|差 (s)|
|---:|---|---|---:|---:|---:|
|25|round-end-ui|webkit|114.951|194.928|+79.977|
|24|round-end-ui|chromium|66.725|114.799|+48.074|
|11|riichi-discard-layout|chromium|61.559|104.500|+42.941|
|20|river-capacity|webkit|38.021|67.725|+29.704|
|19|river-capacity|chromium|30.883|49.296|+18.413|
|14|table-ui|chromium|25.740|39.659|+13.919|
|31|dora-rows|webkit|19.999|32.821|+12.822|
|1|online-dialog-layout|chromium|3.347|14.104|+10.757|
|45|waiting-room: full-flow|chromium|58.625|69.019|+10.394|
|33|seat-kan-overlap|chromium|16.894|27.246|+10.352|
|12|action-controls|chromium|17.994|26.892|+8.898|
|50|river-test-mode|webkit|37.776|46.082|+8.306|
|28|dora-rows|chromium|13.685|21.538|+7.853|
|49|river-test-mode|chromium|35.099|40.296|+5.197|
|34|step13-5-5|chromium|8.751|13.494|+4.743|
|44|waiting-room: river-spacing|webkit|11.788|14.932|+3.144|
|36|step13-6|chromium|9.932|12.754|+2.822|
|5|offline-rules|webkit|4.877|7.437|+2.560|
|43|waiting-room: river-spacing|chromium|11.123|13.349|+2.226|
|46|waiting-room: public-hand|webkit|4.833|6.867|+2.034|
|32|mobile-table-layout|chromium|2.850|4.587|+1.737|
|41|step13-10|webkit|2.916|4.624|+1.708|
|35|step13-5-5-kan|chromium|5.986|7.582|+1.596|
|30|center-round-display|webkit|2.687|4.198|+1.511|
|9|waiting-room: exit-notice|webkit|8.197|9.640|+1.443|
|48|test-page|webkit|3.365|4.784|+1.419|
|40|step13-10|chromium|2.563|3.913|+1.350|
|10|waiting-room: rules-only|webkit|3.047|4.378|+1.331|
|13|action-panel|chromium|2.238|3.516|+1.278|
|4|offline-rules|chromium|4.134|5.351|+1.217|
|3|app-idle|webkit|3.130|4.288|+1.158|
|21|declaration-bubbles|chromium|8.030|9.129|+1.099|
|42|step13-11|chromium|1.772|2.870|+1.098|
|26|result-hand-layout|chromium|2.077|3.123|+1.046|
|39|step13-9|chromium|2.421|3.459|+1.038|
|27|result-hand-layout|webkit|1.765|2.794|+1.029|
|29|center-round-display|chromium|1.806|2.797|+0.991|
|7|waiting-room: next-round|webkit|1.566|2.456|+0.890|
|8|waiting-room: exit-notice|chromium|8.246|9.130|+0.884|
|47|test-page|chromium|2.830|3.687|+0.857|
|23|declaration-gameplay|webkit|5.416|6.058|+0.642|
|22|declaration-gameplay|chromium|5.375|5.992|+0.617|
|52|diagnostics|webkit|1.125|1.740|+0.615|
|38|step13-8|chromium|1.378|1.977|+0.599|
|2|app-idle|chromium|2.483|3.019|+0.536|
|15|random-seating|chromium|0.979|1.506|+0.527|
|16|random-seating|webkit|1.036|1.549|+0.513|
|51|diagnostics|chromium|0.810|1.254|+0.444|
|17|riichi-claimed-discard|chromium|0.908|1.320|+0.412|
|18|riichi-claimed-discard|webkit|0.898|1.298|+0.400|
|6|waiting-room: next-round|chromium|1.624|2.022|+0.398|
|37|step13-7|chromium|1.340|1.732|+0.392|

特に大きい3件（秒、A→B）は WebKit round-end-ui 114.951→194.928（+79.977）、Chromium round-end-ui 66.725→114.799（+48.074）、Chromium riichi-discard-layout 61.559→104.500（+42.941）。続いてWebKit river-capacity +29.704、Chromium river-capacity +18.413、Chromium table-ui +13.919、WebKit dora-rows +12.822。代表的に時間が増えたscenarioはChromiumとWebKitの双方にある。

## 6. 原因候補と仮説の検証

| 仮説 | 支持する証拠 | 反証・未確認 |
|---|---|---|
| A. runner負荷・host差 | 52/52 scenarioでBが遅く、変更なしのコードを別runner IDで実行。Azure regionもCentral USからWest US 3に変わった。run-wideなthroughput差と整合する。 | CPU競合、メモリ不足、swap、I/O待ち、CPU pressure、同一host上のプロセス数は記録されていない。region差だけで負荷や遅延を説明できない。 |
| B. テスト待機・retry | Playwrightのselector/function待ちは存在し、scenario計時に含まれる。 | 上位3スクリプトに固定sleepや明示的retryは見当たらず、状態待ちはPlaywrightの条件待ち。suite runner自体は各manifest entryを一度実行し、失敗時に停止する。成功ログにtimeoutや遅延エラーはない。ただしpollingが条件成立まで長く待ったか、browser.closeに時間を要したかの内訳は未計測。 |
| C. browser/描画/JS/DOM/CPU | Chromium・WebKit両方で増加し、とくに複数viewportやtable/result表示を扱うscenarioが大きい。ページ側の処理または描画が影響する可能性はある。 | JS時間、描画時間、DOM更新時間、CPU対局進行、browser process別CPU・メモリは記録されていない。browser別の総計だけでは処理内容を特定できない。 |
| D. test data・実行条件 | 比較したGit差分にテスト変更はなく、順序・件数・manifestは同じ。round-end-uiとriichi-discard-layoutは固定乱数関数を設定。各scenarioは別プロセスで独立起動し、オンライン動作はmock/local serverを使う。 | random-seatingなど意図的に乱数を使うテストはある。すべてのmock状態・seed・各viewport状態をログで横断比較していない。 |
| E. CI環境・依存・cache・同時実行 | Ubuntu image、Node/Python、Playwright、Chromium/WebKit、npm cache keyとmanifest順は一致。Run BはBrowser job直前にverify jobが終わり、browser jobは別runnerで実行。 | runner regionが違う。Playwright browser/dependency installのdownload時間は異なる。ホスト内の他job/workload、network/CDNの実効速度、cache内容の全バイト同一性は確認できない。 |

### 待機コードの確認範囲

`tests/browser-round-end-ui.py` は起動後にselectorとtest fixture objectを待ち、`tests/browser-riichi-discard-layout.py` はplayer hand selectorを待つ。これらの対象ファイルに固定sleepや独自retry loopはなく、最後に `browser.close()` を呼ぶ。Python runnerは `Popen.communicate()` でscenario終了を待ち、timeout値は設定していない。Browser UIのsuiteは最初の失敗で止まるが、両runは最後の52件まで成功した。成功は不要な待ちが絶対にないことを示すものではなく、既存ログだけではwait durationの内訳を測れない。

suite全体の検索では固定waitは一部に限られる。manifest内のdeclaration-bubblesは宣言bubbleのtimer reset/expiry検証で1.05〜1.1秒を3回待ち、step13-5-5-kanは操作後200ms待つ。これらの待ちは両runでコード・回数が同じ。round-end-uiとriichi-discard-layoutには固定waitがなく、増加した時間は条件待ち・ページ処理・browser起動/終了のどこに使われたか未分解である。

CIログに出た警告はNode.jsの非推奨警告（punycode/url.parse/Buffer）、npm install-script案内、npm auditの3件（2 moderate、1 high）、GitHub ActionsのNode.js 20移行およびubuntu-latestイメージ移行の告知。テスト失敗やBrowser UIのtimeoutを示すエラーではなく、これらが5分超の差の原因という証拠もない。

## 7. 追加測定

### 手動実行の安全性

`.github/workflows/browser-ui.yml` の `workflow_dispatch` は `contents: read` で、unit test/build、Playwright install、ローカルVite/preview、browser tests、artifact保存だけを行う。Worker/Pages deploy jobやsecrets参照はない。Deploy workflow側のdispatchは別であり、今回選択していない。このためBrowser UI workflow単独の手動実行は本番deployを発生させないことを確認した。

3回とも同じ `e01c96e3ee8e5fe32916b19bd0cb8ec320e8b8f3`、`main`、同じworkflow_dispatchで実行した。各runでChromium 33件・WebKit 19件の52件が成功し、timeout・scenario失敗はなかった。run中に作業コードは変更していない。

| 測定 | Actions run | Browser job (UTC) | runner / region | job時間 | regression step | 52 scenario合計 | regression前setup | artifact保存step / browser-ui artifact |
|---|---|---|---|---:|---:|---:|---:|---|
| 1 | [40965496194](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40965496194) | 22:23:46–22:39:09 | 1000001781 / West US 3 | 15:23 (923s) | 13:43 (823s) | 821.509s | 92s | 約5s / 39,939,724 bytes |
| 2 | [40967544168](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40967544168) | 22:39:55–22:58:05 | 1000001786 / South Central US | 18:10 (1090s) | 16:31 (991s) | 989.765s | 91s | 約5s / 39,910,330 bytes |
| 3 | [40969954422](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40969954422) | 22:59:56–23:13:07 | 1000001790 / South Central US | 13:11 (791s) | 11:54 (714s) | 712.515s | 70s | 約4s / 39,910,284 bytes |

artifact列の保存step時間はbrowser UI artifactとcenter-round-display artifact等の保存stepを合計した。別artifactのサイズは順に1,484,064、1,485,300、1,482,247 bytes。Playwright installはそれぞれ48、39、34秒。3runともrunner version 2.338.0、Ubuntu 24.04.5 / image `ubuntu-24.04 20261025.353.1` を使用し、Node.js 24.22.1/npm 11.19.1、Python 3.12.15、Playwright 1.64.1、Chromium 156.0.8078.4、WebKit 27.2も一致していた。

| 指標 | 3run平均 | 最小 | 最大 |
|---|---:|---:|---:|
| Browser job全体 | 934.667s (15:34.7) | 791s (13:11) | 1090s (18:10) |
| regression step | 842.667s (14:02.7) | 714s (11:54) | 991s (16:31) |
| 52 scenario合計 | 841.263s (14:01.3) | 712.515s (11:52.515) | 989.765s (16:29.765) |
| regression前setup | 84.333s | 70s | 92s |
| artifact保存step | 4.667s | 4s | 5s |

| browser | 件数 | 3run平均 | 最小 | 最大 |
|---|---:|---:|---:|---:|
| Chromium | 33 | 507.579s | 432.706s | 587.861s |
| WebKit | 19 | 333.684s | 279.809s | 401.904s |

|順|シナリオ|Browser|Run 1 (s)|Run 2 (s)|Run 3 (s)|平均 (s)|最小 (s)|最大 (s)|
|---:|---|---|---:|---:|---:|---:|---:|---:|
|1|online-dialog-layout (heibon_production_url=http://127.0.0.1:4174/heibon-mahjong/)|chromium|4.873|4.666|5.717|5.085|4.666|5.717|
|2|app-idle|chromium|2.693|2.874|2.533|2.700|2.533|2.874|
|3|app-idle|webkit|3.585|4.240|3.286|3.704|3.286|4.240|
|4|offline-rules|chromium|4.445|4.753|4.188|4.462|4.188|4.753|
|5|offline-rules|webkit|5.760|7.101|5.108|5.990|5.108|7.101|
|6|online-waiting-room (next_round=1)|chromium|1.622|2.087|1.400|1.703|1.400|2.087|
|7|online-waiting-room (next_round=1)|webkit|1.900|2.312|1.576|1.929|1.576|2.312|
|8|online-waiting-room (exit_notice=1)|chromium|8.247|8.808|8.242|8.432|8.242|8.808|
|9|online-waiting-room (exit_notice=1)|webkit|8.673|9.383|8.192|8.749|8.192|9.383|
|10|online-waiting-room (rules=1)|webkit|3.584|4.155|3.021|3.587|3.021|4.155|
|11|riichi-discard-layout|chromium|86.537|108.006|62.080|85.541|62.080|108.006|
|12|action-controls|chromium|20.686|25.001|18.740|21.476|18.740|25.001|
|13|action-panel|chromium|2.789|3.358|2.357|2.835|2.357|3.358|
|14|table-ui|chromium|33.959|43.479|26.644|34.694|26.644|43.479|
|15|random-seating|chromium|1.260|1.522|1.100|1.294|1.100|1.522|
|16|random-seating|webkit|1.331|1.618|1.116|1.355|1.116|1.618|
|17|riichi-claimed-discard|chromium|1.049|1.317|0.933|1.100|0.933|1.317|
|18|riichi-claimed-discard|webkit|1.090|1.374|0.922|1.129|0.922|1.374|
|19|river-capacity|chromium|38.463|47.709|31.731|39.301|31.731|47.709|
|20|river-capacity|webkit|48.385|64.870|38.259|50.505|38.259|64.870|
|21|declaration-bubbles|chromium|8.293|8.706|8.047|8.349|8.047|8.706|
|22|declaration-gameplay|chromium|5.503|5.767|5.310|5.527|5.310|5.767|
|23|declaration-gameplay|webkit|5.569|5.880|5.360|5.603|5.360|5.880|
|24|round-end-ui|chromium|84.027|92.355|65.935|80.772|65.935|92.355|
|25|round-end-ui|webkit|140.452|182.126|121.934|148.171|121.934|182.126|
|26|result-hand-layout|chromium|2.411|2.978|2.376|2.588|2.376|2.978|
|27|result-hand-layout|webkit|2.139|2.822|1.972|2.311|1.972|2.822|
|28|dora-rows|chromium|16.266|20.435|14.778|17.160|14.778|20.435|
|29|center-round-display|chromium|2.106|2.588|1.878|2.191|1.878|2.588|
|30|center-round-display|webkit|3.338|4.108|2.915|3.454|2.915|4.108|
|31|dora-rows|webkit|25.327|33.325|22.644|27.099|22.644|33.325|
|32|mobile-table-layout|chromium|3.495|4.366|3.246|3.702|3.246|4.366|
|33|seat-kan-overlap|chromium|21.311|25.905|18.986|22.067|18.986|25.905|
|34|step13-5-5|chromium|10.418|12.623|9.915|10.985|9.915|12.623|
|35|step13-5-5-kan|chromium|6.430|7.124|6.400|6.651|6.400|7.124|
|36|step13-6|chromium|9.615|11.866|9.434|10.305|9.434|11.866|
|37|step13-7|chromium|1.360|1.658|1.310|1.443|1.310|1.658|
|38|step13-8|chromium|1.487|1.847|1.487|1.607|1.487|1.847|
|39|step13-9|chromium|2.839|3.448|2.533|2.940|2.533|3.448|
|40|step13-10|chromium|3.022|3.679|2.699|3.133|2.699|3.679|
|41|step13-10|webkit|3.432|4.288|3.140|3.620|3.140|4.288|
|42|step13-11|chromium|2.172|2.775|1.955|2.301|1.955|2.775|
|43|online-waiting-room (river_spacing=1)|chromium|11.450|12.761|11.218|11.810|11.218|12.761|
|44|online-waiting-room (river_spacing=1)|webkit|12.527|14.620|12.104|13.084|12.104|14.620|
|45|online-waiting-room|chromium|62.184|68.297|59.978|63.486|59.978|68.297|
|46|online-waiting-room (public_hand=1)|webkit|5.853|6.784|5.091|5.909|5.091|6.784|
|47|test-page|chromium|3.183|3.711|2.983|3.292|2.983|3.711|
|48|test-page|webkit|3.922|4.886|3.652|4.153|3.652|4.886|
|49|river-test-mode|chromium|37.037|40.134|35.738|37.636|35.738|40.134|
|50|river-test-mode|webkit|41.083|46.146|38.354|41.861|38.354|46.146|
|51|diagnostics|chromium|0.939|1.258|0.835|1.011|0.835|1.258|
|52|diagnostics|webkit|1.388|1.866|1.163|1.472|1.163|1.866|

run 2の値はrun 1より52件中51件で長く、run 3はrun 1より50件で短く、1件で長く、1件は同じだった。3回の差はシナリオ列全体に広がる。同じSouth Central US regionのrun 2とrun 3もjob全体で18:10対13:11となったので、region単独では時間差を説明できない。

起動スクリプトのrun list反映が遅れ、2回目のdispatchから4秒後に追加のrun [40967552347](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40967552347) が開始された。browser step開始後にcancel要求を受け、最終的にforce-cancelしたため、このrunは測定から除外する。2回目の最初の数分はこの重複runと重なった可能性があり、run 2を独立した負荷条件とはみなさない。測定3回目のrun [40969954422](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40969954422) はrun 2完了後にdispatchしており、重複runはない。

## 8. 原因判定・確度

**B：原因候補まで特定。** 原因候補はrunごとの実効throughput差（runner/host/browser実行の時間変動）。これが主因である確度は中程度で、具体的にCPU競合・メモリ圧迫・I/O待ち・ブラウザー内部処理のどれかは特定できていない。

根拠は、run Aからrun Bへのコード差分にアプリ・テスト・workflow変更がないのに52件すべて遅くなり、setupが6秒短くartifact差が数秒にとどまったこと、同じSHAで行った3回のscenario合計が712.515〜989.765秒に広がり、その差が特定のscenario一つに限られないこと。run 2とrun 3は同じAzure regionでも約5分のjob時間差がある。run Aの12:51が継続的な短い基準であるとはいえず、main統合後に恒常的な遅延が始まった証拠はない。

run Aより約22分前の成功run 40897247248も18:13で、遅いround-end-uiとriichi-discard-layoutを含んでいた。これもmain統合より前に長いrunがあったことを示す。いっぽう、同じrunner/hostの資源値はどのrunにもなく、観測した変動を生む正確な要因は未確認である。Issue #23の問いに対して、速度変動という候補は支持されるが、根本原因は未特定と判断する。

## 9. 未確認事項と次に必要な計測

- CPU使用率、CPU pressure、memory、swap、I/O pressure、process数および同一host上の負荷。既存run logにはrunner資源計測がない。
- Browser起動・終了時間と、Playwrightのselector/function wait時間。現行scenarioログは各Python scriptの全経過時間のみで、これらを分離しない。
- 同じrunner実装・regionでの追加計測でも同じ変動が出るか。今回run 2・3は同一regionだが別runner IDで、hostが同一かは不明。
- 3回のrunはいずれも成功し、比較対象の遅いscenarioにはtimeoutやretry失敗の記録はない。成功ログだけでは条件waitが長くなった理由は分からない。

root causeをさらに特定する場合、まず `.github/workflows/browser-ui.yml` のregression step中だけ、5秒間隔の軽量な `/proc` samplerを動かし、CPU、load average、memory/swap、pressure、process数を一時ログへ保存して既存artifactに追加する。低頻度採取と小さいローカル書込みで負荷を抑えるが、採取そのものの影響をゼロとはみなさない。次に `tests/browser-round-end-ui.py` と `tests/browser-riichi-discard-layout.py` にlaunch、主要condition wait、closeの経過時間を記録すると、script内の待ちとbrowser起動・終了のどこで時間が使われたかを切り分けられる。`tests/run-browser-regressions.py` は現状でも各script全体の時間を出力する。今回は計測コードを実装していない。

## 10. Issue #21・#22との関係

- **#21 Closed：** regression testsの追加・main統合・Chromium/WebKit 52件成功は完了済み。実行時間の差だけではテスト失敗や回帰無効の証拠にならない。
- **#22 Open：** `tests/step14-0-1.test.ts` のonline lifecycle親テスト30秒timeout調査。別のunit/integration test上の事象であり、今回のBrowser UI遅延と結び付ける証拠は見つかっていない。状態・内容を変更しない。
- **#23 Open：** 比較履歴・同一SHAの3run・判定Bを記録した。具体的なroot causeとrunner資源計測は未確認のためOpenを維持する。

## 11. Phase 1での変更

Phase 1ではゲーム本体、Browser UIテスト、workflow、timeout、成功条件は変更していない。変更対象はこの調査記録と `docs/verification/README.md` の目次だけだった。

## 12. Phase 2：Browser UI計測

### 実装

Browser UI CI専用の任意計測を追加した。ゲーム本体、アサーション、skip、timeout、52項目のmanifestと順序は変更していない。計測対象は長時間だった `browser-round-end-ui`（Chromium／WebKit）、`browser-riichi-discard-layout`（Chromium）、`browser-river-capacity`（Chromium／WebKit）。この5 invocation以外の47 invocationでは既存のCSVによるシナリオ全体時間のみを使う。

`tests/run-browser-regressions.py` のsuite処理内でPython thread samplerを開始し、5秒間隔で `runner-resources.jsonl` にUTC、共通のmonotonic経過秒、CPU、memory、pressure、process数を保存する。host CPU使用率は `/proc/stat` の差分、実行プロセスが属するcgroupのCPU使用率は `cpu.stat` の `usage_usec` 差分から別々に算出する。cgroup利用率は `cpu.max` quotaで正規化し、quotaと論理CPU数も併記する。cgroupの範囲がrunner job全体と一致するかは実CI artifactで確認する必要がある。quotaなしは `cpu_quota_status=unlimited` とし、取得不能は `unavailable`／`null` に分ける。memoryはhostの使用／availableに加えてcgroupのcurrent／limit、swap使用量を記録する。CPU、memory、I/O pressureは `/proc/pressure` の取得値、process数は `/proc` から記録する。

3つのPlaywrightスクリプトに、browser launch、context作成、page作成・遷移・終了、context/browser終了、存在するselector/function/locator待ちを記録する `browser-events.jsonl` を追加した。scenario全体時間は `scenario_total` として開始・終了UTC、所要秒、成功／失敗を記録する。イベントにはシナリオとbrowserを含み、resource JSONLとUTC・run共通のmonotonic秒で対応づけられる。対象スクリプトに `expect` 待ちはなく、テスト内に存在する条件待ちだけを計測する。URL、環境変数値、secret、DOM本文は出力しない。

計測コードのI/O等で例外が起きた場合は警告を出して記録を欠測とし、元のPlaywright操作やその例外を変えない。samplerは別プロセスを作らず、suite終了時にstop/joinする。runner異常終了時にもthreadはdaemonであり親プロセス終了とともに終了する。

### 有効・無効とartifact

- Browser UI workflow_dispatchの `browser_ui_metrics` をtrueにすると `BROWSER_UI_METRICS=1` で計測を有効にする。既定値false。ローカルでは環境変数を設定する。
- 無効時はsamplerを起動せず、metric wrapperは関数をそのまま実行する。通常テストとデプロイworkflowには環境変数を渡さない。
- 有効時の出力は `artifacts/browser-ui-metrics/runner-resources.jsonl` と `browser-events.jsonl`。Actionsでは既存の `browser-ui-*` artifactとは別の `browser-ui-metrics-<sha>-<attempt>` artifactとして保存し、テスト失敗後も `always()` で保存を試みる。
- 追加したのは `.github/workflows/browser-ui.yml` の入力・stepのみ。Deploy workflowは変更せず、Browser UI workflowにデプロイjobや本番secret参照はない。

### Phase 2ローカル確認

- `python -m py_compile` を計測helper、runner、3対象scriptに実施：成功。
- metrics無効のsmoke：出力ファイルを生成しないことを確認。
- metrics有効のsmoke：event 2件とresource 1件をJSONとして読み込み、必須キー、UTC／monotonic秒、成功／例外区別、例外の再送出、sampler thread停止を確認。
- `npm test`：67 passed、0 failed。
- `npm run build`：成功。
- `git diff --check`：成功。
- secretは出力対象フィールドに含めず、operation名・ブラウザー・シナリオ・資源数値だけを記録する実装を確認。
- この作業環境のChromium起動は [`AGENTS.md`](../../AGENTS.md) と [`codex-cloud-chromium.md`](codex-cloud-chromium.md) に記録済みのseccomp/Crashpad制限があるため、ローカルBrowser UI一式は起動していない。

### CI比較・結果

**Phase 2のActions runはまだない。** workflow_dispatchは本番deployを起動しない構成と確認したが、利用可能なGitHub connectorにはworkflow_dispatch開始APIがなく、通常の `git fetch` もproxy接続失敗となった。CIの無効1回＋有効3回を実行できる経路がこの実行環境では確認できなかったため、Actions run URL、runner資源値、browser/wait時間、計測artifactは未取得である。run自体の実行・成否を推測で補っていない。

従って計測オーバーヘッドはCIで評価できていない。コード上の無効時はsamplerを作らず、JSONL処理・時計取得を行わない。有効時は5秒ごとに1行を追加し、対象呼出し前後にmonotonic/UTC取得とJSONL appendを行うため、その負荷は存在する。CI比較なしにオーバーヘッド量を数値化しない。

| 比較条件 | Run | Browser job / regression / scenario合計 | CPU・memory・I/O | browser/wait | 状態 |
|---|---|---|---|---|---|
| metrics無効 | 未実施 | 未取得 | 未取得 | 未取得 | workflow_dispatchが未実行 |
| metrics有効 1 | 未実施 | 未取得 | 未取得 | 未取得 | workflow_dispatchが未実行 |
| metrics有効 2 | 未実施 | 未取得 | 未取得 | 未取得 | workflow_dispatchが未実行 |
| metrics有効 3 | 未実施 | 未取得 | 未取得 | 未取得 | workflow_dispatchが未実行 |

既存の比較・Phase 1測定runの数値は§2〜§8に保持しているが、計測コード未導入時の値なのでPhase 2の有効／無効比較とは扱わない。52 scenario、Chromium 33件、WebKit 19件のCI比較も未実施。

### 原因評価と次の作業

原因判定はPhase 1の **B（候補まで）** のまま。run間の実効throughput差は候補だが、runner CPU競合、memory pressure/swap、I/O pressure、ブラウザー起動、Playwright待ちのどれが時間差を説明するかは、Phase 2 runがないため新しい証拠を得ていない。既存runでは全シナリオに広がる差を確認したが、因果関係は特定していない。

次はこの専用ブランチの同一SHAでBrowser UI workflow_dispatchを、同時実行させずにmetrics無効1回、その後metrics有効を逐次3回行う。4回すべてで52件の件数・順序・browser versionを確認し、job全体、regression step、Chromium/WebKit合計、上位scenario、JSONLのresource/eventを比較する。自然変動幅が大きいため4回だけでは厳密な計測負荷の分離はできない。runを取得できた場合に本節とIssue #23コメントを追記し、原因候補を再評価する。

Issue状態は #21 Closed、#22 Open、#23 Openを維持する。Phase 2のCI結果が未取得のためIssue #23はOpenのままとする。
