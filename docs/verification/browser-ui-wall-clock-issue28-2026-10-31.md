# Browser UI回帰テスト壁時計時間短縮 — Issue #28 Phase 1（2026-10-31）

## 目的と調査基準

Issue [#28](https://github.com/ak-sekine/heibon-mahjong/issues/28)のPhase 1として、既存の計測結果と現行mainの静的構成から、Chromium／WebKitの全検証を維持した短縮設計をまとめました。今回は文書のみを変更し、テスト、workflow、ゲームコード、依存関係を変更していません。Browser UI追加実行およびCodex Cloudでのブラウザー起動もしていません。

- 調査日時: 2026-10-31 UTC
- 調査対象main: `2d58c115a43cdbd0acc126b1d9726b2256a5e625`（作業開始時にfetchした最新main。実装コードは後述のbaseline SHAから検証記録のみ進んでいます）
- ローカル計測・実験は行わず、現行テストコードを実行していません。
- 測定値はActionsログに記録された既存値、コード上の事実はmainのsource、説明上の見通しは推測と分けています。

## 既存成果と関連Issue

- **Issue #15（Closed）** — [CI・Browser UI重複解消記録](ci-performance-2026-10-28.md)。mainでのBrowser UI二重実行、Markdown-only分類、高速な`--script`実行、スクリプト別CSV出力は完了済みです。CI変更前後でrunner時間は約52%減りましたが、当時の全検証壁時計時間は約18:44から約18:45で短縮を確認していません。実装済みの機能は再調査・再実装しません。
- **Issue #23（Closed、原因未特定）** — [Browser UI CI時間調査](browser-ui-ci-duration-issue23-2026-10-30.md)。同一SHAの52シナリオを含む既存runでBrowser jobは12:47〜18:10、計測対象シナリオ合計は684.423〜990.246秒でした。runner・環境変動の候補はありますが、原因・計測オーバーヘッドとの因果は未特定です。本設計では同条件の反復runを追加していません。
- **Issue #22（Open）** — 2026-10-31の記録では単体テストの30秒timeoutは未再現・原因未特定です。Browser UI遅延との因果は確認されておらず、別課題として扱います。
- Issue #28本文・コメントをGitHubから再取得しました。#28はOpenで、コメントはまだありません。

参照した主な記録・設定: `tests/run-browser-regressions.py`、`.github/workflows/browser-ui.yml`、`.github/workflows/deploy.yml`、`docs/verification/ci-performance-2026-10-28.md`、`docs/verification/browser-ui-ci-duration-issue23-2026-10-30.md`、`docs/verification/open-issue-investigation-2026-10-31.md`、Issue #15・#22・#23の最新本文／コメント。

## 現行構成と独立性の確認

### 実行単位・順序

最新mainの`SUITE`を数え、最新成功runのログで実際に実行された単位と照合しました。確定したのは **56 invocation：Chromium 35、WebKit 21** です（以前の報告値を引き継いだのではありません）。1単位はmanifestの1要素で、同じPythonスクリプトがengineや`HEIBON_ONLINE_*`フラグを変えて複数回現れる場合も別単位です。

runnerは各要素を別Python subprocessとしてmanifest順に実行し、失敗で後続を停止します。一般的なスクリプトはそのプロセス内でPlaywrightとブラウザーを起動し、context/pageを作り、終了時にブラウザーを閉じます。例外として`browser-online-waiting-room.py`は複数のフロー・モードを同一起動内で実行します。既存の`--script`は対象スクリプトを選択できますが、全suiteをブラウザー別に選ぶ引数はありません。

### 共有資源・状態

- workflowは1回だけVite開発サーバー（4173）とbuild済みpreviewサーバー（4174）を起動し、回帰stepの終了時に終了します。両方ともrunner上の静的アプリ提供用で、各scenarioのために起動し直すコードはありません。
- 現行manifestスクリプトは各々別プロセス・別browser launchで走ります。通常、browser context/page内のlocalStorage、route mock、ゲームfixtureはinvocationをまたいで共有されません。オンラインmockはscenario内のPlaywright route等で作られ、workflowのVite接続先も`online-mock.invalid`です。
- workflow内で指定するのは4173/4174とスクリーンショットroot `/tmp/heibon-table-ui`、timing CSV `/tmp/heibon-browser-ui-timings.csv`です。複数ジョブに分ける場合、runnerごとにfilesystemとport namespaceが分かれるのでport衝突はありません。一方、artifact名・CSV名・同一artifact内のスクリーンショットをエンジン別に衝突しないよう分ける必要があります。
- 現行suite内の外部共有DB、共通一時ファイル、テストサーバーportはコード上見つかりませんでした。全モジュールのあらゆる間接的副作用まで証明したものではなく、未確認の実行時副作用はPhase 2で通常CIの結果とartifactから確認します。

### 初期化、待機、逐次実行

- 56 invocationに対してPlaywright/browserの起動・終了が繰り返されます。各起動／終了の時間は現在のmainの全scenarioで別々に記録していません。
- Issue #23計測ブランチの代表3スクリプトでbrowser launchは平均約85〜125msでしたが、全56件・全engineの値ではありません。測定された範囲から起動だけが18分超の支配要因とはいえません。close・Python/Playwright初期化の合計は未計測です。
- 回帰は完全に逐次です。複数engineを同じworkflow job内で同時に動かす処理はありません。
- 固定waitは一部にあります。`browser-declaration-bubbles.py`の1.05〜1.1秒待機は表示タイマーの経過を確認し、call-viewport等の短いwaitはUI遷移の後に使われます。これらが不要とは確認できず、短縮対象にしません。多くのPlaywright待機はselector/function等の状態条件です。最大timeout値が短くなるまで常に消費されるわけではありません。
- Python runnerはtimeout付き`communicate()`ではなく子プロセスの終了まで待ちます。失敗時にretryはせず停止します。timeoutや期待値を変更する根拠はありません。

## 改善前ベースライン

設計の基準には、Phase 1の最新mainと完全に同じ56 invocationを持つ直近の既存成功runを固定します。

| 項目 | 固定値 |
| --- | --- |
| Actions run | [41196608100](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41196608100) |
| commit SHA | `4172c2444a65b3bcf8e2138e6c49d0715a2609fd` |
| workflow/event | Deploy to GitHub Pages and Cloudflare Workers / main push。Browser UIはreusable workflowとして1回実行、`reuse_build=true` |
| 実行条件 | `ubuntu-latest`。runner log: Ubuntu 24.04.5、image `20261025.353.1`、Node 24.22.1／npm 11.19.1、Python 3.12.15、Playwright 1.64.1。Chromium/WebKitはPlaywright install対象。個別browser build番号はこの記録からは未確認 |
| Browser regression区間 | 最初のscenario開始 2026-10-31 11:25:06.460Z 〜 最後のscenario終了 11:43:18.769Z。wall clock **18分12.3秒**。各scenarioの記録時間合計 **1,092.265秒（18分12.3秒）** |
| Browser UI job全体 | runner log開始 11:24:04.950Z 〜 job cleanup完了 11:43:23.181Z。**1,158.2秒（19分18.2秒）** |
| runner時間合計 | 同runで実行された9 jobのrunner log区間の合計 **1,320.8秒（22分00.8秒）**。これはDeploy run全体のrunner実行時間合計で、GitHub billing画面の請求分数とは区別。並列jobがあるため、最初のjob開始〜最後のjob終了の壁時計は22分52.9秒 |
| invocation内訳 | 56成功、失敗0、timeout 0、skip 0。Chromium 35件 **637.677秒（10分37.7秒）**、WebKit 21件 **454.588秒（7分34.6秒）** |
| artifact | `browser-ui-4172c2444a65b3bcf8e2138e6c49d0715a2609fd-1`、artifact ID `13041860393`、40,310,467 bytes、timing CSV・スクリーンショット・Vite/previewログを含む |

回帰stepの区間はscenarioの開始／終了notice、job全体とrunner合計は既存job logの最初／最後のtimestampから固定しました。個別時間は同じrunのCSV出力と一致するrunner notice値を集計しています。artifact CSVファイル自体を展開して別途読み直したわけではありません。runner使用量はjobログ区間の近似合計です。

baseline SHA `4172c24`以降、調査対象main `2d58c11`までの差分はIssue #11の実機確認記録、ROADMAP、検証READMEだけです。`tests/`、workflow、package/lockfile、アプリ実装に差分がないため、run #41196608100は現行mainと同じBrowser UI実行条件・56単位の比較baselineとして使えます。最新mainのcommitそのものを再実行した値とは記載しません。

### 時間の長いscenarioとbrowser配分

最新runの56記録をbrowser/script別に集計した測定値です。

| script（同一script内のengine/flag variant合計） | 合計 |
| --- | ---: |
| `browser-round-end-ui.py` | 280.318s（4:40.3） |
| `browser-online-waiting-room.py` | 129.493s（2:09.5） |
| `browser-river-capacity.py` | 113.124s（1:53.1） |
| `browser-riichi-discard-layout.py` | 108.429s（1:48.4） |
| `browser-river-test-mode.py` | 84.830s（1:24.8） |
| `browser-call-viewport.py` | 66.938s（1:06.9） |

単一invocationの最長はWebKit `browser-round-end-ui.py` 184.635s、次にChromium `browser-riichi-discard-layout.py` 108.429s、Chromium `browser-round-end-ui.py` 95.683s、Chromiumのwaiting-room full-flow 66.961s、WebKit `browser-river-capacity.py` 65.441sでした。round-end-ui、waiting-room、river-capacity、riichi-discard-layoutのscript合計は全回帰時間の約57.8%です。

ChromiumとWebKitの実測時間差は183.089秒（3分03.1秒）で、別runnerにengine別分割した場合の単純な並列化可能性を示します。setup・runner queue・資源変動を含む実測効果ではありません。理想化した上限として、setup追加・競合・queueなしに両engineを完全に同時実行できれば、test部分が短い方の7分34.6秒分を隠せます。実際の短縮時間とは扱いません。

## 確認できたボトルネック／不明点

**測定で確認**: Browser regression単独で18分12秒、Browser UI job全体で19分18秒かかっています。テスト本体はBrowser UI jobの主要な所要時間です。長いscenarioは一つのscriptだけではなく複数scriptに分布し、Chromium／WebKit双方にあります。逐次実行により各engineの時間が加算されています。

**コードで確認**: 既存test runnerは逐次・別プロセス実行です。Viteとpreviewは1回ずつjob内で起動します。スクリプトごとにbrowser launchするため起動処理は繰り返されます。一方、engine別実行を分けると各jobにcheckout、npm ci、Python/Playwright/browser setup、Vite/preview起動とartifact uploadが複製されます。

**推測／未計測**: browser間分割でjob wall-clockは短くなる可能性が高いものの、queue・runner host差・並列実行によるCPU/メモリ競合で期待値は変わります。必要なrunner数・追加コスト、Actionsのjob queue時間、全scenarioのbrowser launch/close時間は未計測です。Issue #23の同一SHAでの揺れもあり、一回のrun差だけでは恒常的な改善幅を断定できません。

## 候補比較

| 案 | 変更対象・時間短縮の根拠 | 競合・再現性 | runner/artifact/deploy gate | 難易度・戻し方 |
| --- | --- | --- | --- | --- |
| **A. Browser UI job分割** | `.github/workflows/browser-ui.yml`のmatrixでChromium／WebKitを別runnerにし、`tests/run-browser-regressions.py`に全manifestをengineで選ぶ引数を追加。現在は10:37.7対7:34.6の逐次計測値があるため並列化対象が明確。独立test group分割はscenario分配の検証が別途必要。 | 同一runner内のCPU・memory圧迫を避けられる。各engine job内は現状の逐次順序維持。別hostの自然変動・queueは増える。jobごとにVite/preview、filesystemが独立し、port衝突を避けられる。 | 2 runnerを同時使用、setupとartifact uploadが二重になりrunner時間・artifact容量が少し増える可能性。timing/screenshots/artifact名はengine suffixで分離。Reusable workflow全体のsuccessをdeploy gateに保てば、一方でもfailure/cancel/skipなら既存`needs.browser-ui.result == 'success'`を満たさない。 | 中。matrix/selector/artifact namingを戻せば現行の一job逐次suiteに戻せる。 |
| **B. runner内部でscenario並列化** | `tests/run-browser-regressions.py`とworkflowを変更。独立unitをworker poolで動かし、理論上Chromium内の逐次時間も重ねられる。Aより大きな短縮余地はあるが、今回測定は独立性や同時実行速度を実証していない。 | 同一runnerでChromium/WebKit/processが重なりCPU・memory・描画・Vite接続を競合。screenshot命名やCSV更新、キャンセル伝播、失敗時に残る子process、共有サーバーへの負荷が増え、flaky化・再現性低下のリスクが最も大きい。 | runner数は増えないが負荷増・遅延で時間が延びる可能性。artifactとdeploy gateは直列時の単一jobで維持可能だが、失敗収集・完了判定の実装変更が必要。 | 高。worker poolを廃止し逐次ループへ戻す。 |
| **C. 初期化効率化** | `.github/workflows/browser-ui.yml`、将来は複数の`tests/browser-*.py`。browser/server startupの共有・再利用、意味を保った条件待ち等が候補。serverはすでに1回起動。起動時間の全suite計測はなく、#23の代表launch 85〜125msだけでは大きな短縮根拠にならない。 | browser/context再利用はlocalStorage・page/mock・game stateの持ち越しを生み、シナリオの独立性・再現性に影響。固定waitには表示タイマーやイベント後の目的があり、削除根拠なし。状態待機やtimeoutは緩めない。 | runner数・artifact・gateは維持しやすい。browser再利用で不具合診断・cleanupが複雑になる可能性。 | 中〜高。個別最適化を戻し、各scriptで新規browser起動に復帰。現状では優先しない。 |
| **D. A〜Cの安全な組み合わせ** | Aのengine別runnerを先行し、効果確認後に実測で重複setupなど明白な無駄のみをCから追加。未測定のstartup最適化をAに同時投入しない。 | 最初はA同様。段階を分けるため原因切り分け可能。Cを追加する時はシナリオstate分離を改めて検証。 | Aと同じrunner/artifact/gate設計。二段階でrunner時間・artifact増分を確認。 | 中〜高。追加したCのみ先に戻し、必要ならmatrixを戻す。 |

この比較ではテストskip、アサーション／viewport／online/offline範囲縮小、期待値緩和、根拠のないtimeout変更を候補に含めません。

## 推奨案：A（Chromium/WebKitの2 job分割）

実測で一方ずつ実行しているsuiteの時間が分かれており、処理独立性も高いengine単位を別runnerに割り当てるAを推奨します。Bのように同一hostのブラウザー負荷を上げず、テスト本体やscenarioの状態管理に触れずに壁時計短縮を狙えるためです。理想化条件でtest部分の最大短縮余地は7分34.6秒ですが、setup重複・queue・自然変動があり、実際の短縮量は未確認です。

**今回採用しない案**: BはCPU/memory競合・cleanup失敗・artifact衝突等を避ける独立性の根拠が足りず、安全性を優先して保留します。Cは1ジョブ内のVite/previewがすでに一回起動され、代表browser launch計測も短く、残るbrowser close/全caseの初期化時間が不明なため第一案にしません。Dは段階的な候補ですが、初回実装はAだけに絞り、効果が確認できた後に初期化の計測根拠が生じた時だけ別変更として検討します。

### Phase 2の実装対象・段階

1. **engine filter追加**: `tests/run-browser-regressions.py`に全suiteをChromiumまたはWebKitだけに絞る明示optionを追加します。現在のmanifest順、既存`--script`経路、1 scenario 1 process、失敗時停止、CSV列とstatus、各assertionは保ちます。manifestがengine別に35/21へ網羅・排他分割されることを静的テストで確認します。
2. **Reusable workflow matrix**: `.github/workflows/browser-ui.yml`のBrowser UI jobをChromium／WebKitのmatrixにし、各jobは自身のbrowserだけinstall・実行します。Browser test setup、Vite/preview serverはjobごとに一度起動。artifact名、timing CSVパス、engine固有screenshotsをengine suffix付きにします。2 jobの成功がworkflow全体の成功条件であることを確認し、`.github/workflows/deploy.yml`のverify・Browser UI・release freshness gateはそのまま維持します。
3. **静的・対象検証**: manifest全件の分割、engine引数、artifact名、並列runner別port/path隔離、キャンセル時の終了、workflow条件を確認します。Chromium/WebKit双方の選択実行では既存`--script`を使い分け、無選択・誤engine・未収録scenarioが成功扱いにならないことを検査します。skipやtimeout値変更は行いません。
4. **通常のActionsで全検証**: CI設定・テストrunner変更を含む全suiteのsuccessを1回確認し、2 artifactに全56 invocation（35/21）・CSV・必要なスクリーンショットが揃うことを照合します。verify / Browser UIの一方でもfailure、cancel、未実施、artifact upload failureならdeploymentが発生しない条件をworkflow静的確認とrun結果で確かめます。validation-only分類ならWorker/Pages deployがskipする既存動作を保ちます。
5. **効果判定**: 上記baseline（same 56-unit SHA）とpost-change runについて、scenario-start〜last-end、各engine/job wall clock、Browser UI job全体、全job runner時間、追加artifact bytes、success/failure/timeout/skipを記録します。Issue #23のrun間変動を考慮し、一回の差を一般化した短縮率として断定しません。追加の同一SHA反復runは起動せず、以後の通常runがあれば補足根拠として扱います。

### 撤退条件と安全要件

- いずれか一方のengine jobがfailure/cancel/skip/timeout、scenarioの欠落、必要artifactの欠落・upload failure、deploy gateの誤通過があればmatrix変更を直ちに戻します。
- 完全な56 invocation成功を満たさないrunは改善として数えません。全assertion・viewport・online/offline・Chromium/WebKitは維持します。
- 1回のpost runだけで持続的改善幅は断定しません。ベースラインより壁時計が短くならない、またはqueue/setup/artifact追加後のBrowser job wall clockに明確な効果が見られない場合は、効果ありとして残さず単一runner逐次構成に戻します。全suite成功時にもrunner使用量・artifact量が大きく増え、実際の待ち時間に見合わない場合は同様に撤退します。
- 撤退時はworkflow matrix、engine filter、artifact namingを一括で戻し、現行の単一Browser UI job・reusable workflow success gate・deploy前提を復元します。

## 未確認事項

- 現行mainの全56 invocationのbrowser launch/close・Python startup・各Playwright waitの個別時間。
- browser install/download、Vite/preview setup、queue時間の正確な分解。今回のrunのChromium/WebKit完全なbuild番号。
- matrix化後のGitHub-hosted runner割当、追加runner-minute、job queue差、同時runの資源影響と実際の壁時計短縮。
- 既存ローカルmock等の実行時副作用に関する全スクリプト横断の動的検証。今回は追加CIを行わず、Phase 2の通常runで確認します。
- GitHub repository外側の組織ポリシーがある場合のbranch protection設定。deploy gateのソースと対象runの動作は確認済み。

## Phase 1時点の結果（2026-10-31）

推奨設計をA（Chromium/WebKit別job）に固定しました。この時点ではPhase 2のrunner・workflow実装とCI実行は未実施でした。

## Phase 2実装・検証（2026-10-31）

### 作業開始点と既存成果

- 最新mainをfetchして開始SHA `ebc684bccecfb96415e1cdb979342c61a3d133c0` を確認しました。Phase 1記録commitが開始時点のmainでした。作業ツリーはcleanでした。
- Issue #28本文と最新コメント、Issue #15の[CI重複解消記録](ci-performance-2026-10-28.md)、Issue #23の[調査記録](browser-ui-ci-duration-issue23-2026-10-30.md)、Browser UI・Deploy workflow、`tests/run-browser-regressions.py`を再利用し、先行調査を繰り返していません。
- 比較baselineはPhase 1のActions run [41196608100](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41196608100)、SHA `4172c2444a65b3bcf8e2138e6c49d0715a2609fd` です。Chromium 35件／10:37.7、WebKit 21件／7:34.6、全56件／18:12.3、Browser UI job全体19:18.2、run内runner時間合計22:00.8を固定値として引き継ぎます。run内runner時間はDeploy run全体のrunner log時間合計で、Browser UI専用runner時間ではありません。

### 実装

- `tests/run-browser-regressions.py`の既存`--browser`引数を全suiteにも適用し、`--browser chromium`、`--browser webkit`、全engine互換の`--browser both`を使えるようにしました。`--script`選択との併用と、manifestにないengine／scriptのエラーを維持します。engine単独のCSVはそのengineの実行単位のみを含み、既存`--script`選択時は他のmanifest行を`skipped`で記録する従来の形式を保ちます。
- `.github/workflows/browser-ui.yml`を2要素のChromium／WebKit matrixにし、`fail-fast: false`と`max-parallel: 2`を設定しました。各runnerは担当engineだけPlaywrightをinstall・起動し、runner内のmanifest順序は従来どおり逐次です。
- 呼び出し側からbuildを再利用しないPR／workflow実行では、`verify-build`で`npm test`とbuildを1回だけ実施・artifact保存し、matrixの各runnerはそのdistを取得します。main Deployからの呼び出しでは既存`verify` jobのartifactを使うため、同じSHAでunit test/buildを重ねません。engine runnerに必要な`npm ci`とVite／previewはそれぞれのrunnerに残します。
- timing CSV、回帰ログ、Vite／previewログと既存screenshotsをartifactへ保存します。Browser UI artifact、center-round-display、river-spacing diagnosticsの名前にengineを含め、SHA／run attemptも保持します。主artifactはartifact upload失敗をjob失敗として扱い、Deploy gateを閉じます。
- `.github/workflows/deploy.yml`のgateは変更していません。`browser-ui` reusable workflow全体がsuccessの場合だけ後続のrelease-freshness、Worker／Pages処理へ進みます。matrixの一部失敗・cancelをsuccessに変換する`continue-on-error`は設定していません。`workflow_dispatch`の安全条件、docs-only/validation-only分類も維持します。
- エンジン選択を検証するPython標準ライブラリ単体テストを追加し、Chromium 35件・WebKit 21件の網羅・排他、`both`と従来の`--script`、不正engine拒否を確認します。

### 変更ファイル

`tests/run-browser-regressions.py`、`tests/test_browser_regressions_selection.py`、`.github/workflows/browser-ui.yml`、`docs/verification/ci-performance-2026-10-28.md`、本記録、`docs/verification/README.md`、`docs/ROADMAP.md`。

### ローカル検証

- `python -m py_compile tests/run-browser-regressions.py tests/test_browser_regressions_selection.py`成功。
- `python tests/test_browser_regressions_selection.py`: 5 tests成功。Chromium 35件、WebKit 21件の網羅・排他、default／`both`での全56件互換、`--script`併用、engine別CSV行数・engine値、不明scriptと不正engineのエラーを確認。
- `npm test`: 71 tests成功、失敗0、skip 0。関連する`node --test tests/ci-change-classifier.test.mjs`も成功。静的テストにmatrix並列性、テスト/build重複防止、engine別artifact名、failure/cancel/skip時にsuccess条件を満たさないことを追加。
- PyYAML 6.0.3でBrowser UI／Deploy workflowをparseし、matrix要素・`fail-fast: false`・2並列上限、担当engineのinstall/run、strict main artifact、Deploy reusable workflow依存と後続gateをassertionで確認。`git diff --check`成功。
- Codex CloudではBrowser UIを起動していません。Chromium／WebKitを含む実行はGitHub-hosted runnerで検証します。

GitHub Actions CI、engine別の完了時刻・実行重複・queue時間、artifact一覧・CSV内容、workflow全体時間、run内runner時間、deploy関連jobの実行／skip結果は通常CI後に記録します。失敗・cancelを故意に発生させるworkflow検証は行いません。失敗／cancel時のdeploy拒否は、Actions実行の観察結果と静的gate確認を区別します。iPhone Safari実機確認は今回のCI内部変更に含めず、新たな必須条件にしません。

Browser UIをCodex Cloudで起動する環境構築は行いません。
