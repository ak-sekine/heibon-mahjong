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
- エンジン選択を検証するPython標準ライブラリ単体テストを追加し、56件の網羅・排他、`both`と従来の`--script`、不正engine拒否を確認します。

### Phase 1基準とのsuite差分

Phase 1ではrunner manifestの`browser`列に基づきChromium 35件・WebKit 21件と報告しました。engine別installを実装して実行コードを突合したところ、manifest先頭の`browser-online-dialog-layout.py`は`run()`既定値によってChromiumとラベルされていた一方、シナリオ本体が常に`playwright.webkit.launch()`を呼ぶことが分かりました。この1 invocationをWebKitへ再分類し、Phase 2実行時の実engine配分は**Chromium 34件・WebKit 22件**です。全scenario数56件、シナリオ本体・viewport・assertion・online/offline検証数は変更していません。Phase 1の固定baseline 10:37.7／7:34.6はrunner manifest labelによるengine別集計なので、この1件は実ブラウザー別の内訳と異なります。Phase 1 runのGitHub Actions logで当該WebKit invocationは9.110秒でした。これを再分類したbaselineはChromium 628.567秒（10:28.6）、WebKit 463.698秒（7:43.7）で、全56件の合計18:12.3秒は不変です。元のPhase 1値と補正後の実engine集計を区別して比較します。

### 変更ファイル

`tests/run-browser-regressions.py`、`tests/test_browser_regressions_selection.py`、`.github/workflows/browser-ui.yml`、`docs/verification/ci-performance-2026-10-28.md`、本記録、`docs/verification/README.md`、`docs/ROADMAP.md`。

### ローカル検証

- `python -m py_compile tests/run-browser-regressions.py tests/test_browser_regressions_selection.py`成功。
- `python tests/test_browser_regressions_selection.py`: 5 tests成功。Chromium 34件、WebKit 22件の網羅・排他、default／`both`での全56件互換、`--script`併用、engine別CSV行数・engine値、不明scriptと不正engineのエラーを確認。
- `npm test`: 71 tests成功、失敗0、skip 0。関連する`node --test tests/ci-change-classifier.test.mjs`も成功。静的テストにmatrix並列性、テスト/build重複防止、engine別artifact名、failure/cancel/skip時にsuccess条件を満たさないことを追加。
- PyYAML 6.0.3でBrowser UI／Deploy workflowをparseし、matrix要素・`fail-fast: false`・2並列上限、担当engineのinstall/run、strict main artifact、Deploy reusable workflow依存と後続gateをassertionで確認。`git diff --check`成功。
- Codex CloudではBrowser UIを起動していません。Chromium／WebKitを含む実行はGitHub-hosted runnerで検証します。

### 最初のActions runと修正

- run [41205805669](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41205805669)、SHA `4142dff5acabaa7ba332b19292b6d8ccb71c0352`はworkflow failureでした。Chromium runnerは最初の`browser-online-dialog-layout.py`だけを開始し、0.289秒で「WebKit executableが存在しない」と失敗しました。これは上記のmanifest engine誤分類が原因で、skipやassertionの失敗ではありません。
- `fail-fast: false`によりもう一方は継続し、当時のWebKit manifest分21件は21 success、failure 0、timeout 0で完了しました。Chromium失敗artifact（`browser-ui-chromium-4142dff...-1`、ID `13044378390`）とWebKit success artifact（`browser-ui-webkit-4142dff...-1`、ID `13044760578`）を確認しました。どちらにもengine別timing CSVとログが含まれ、WebKitの`center-round-display` artifact（ID `13044935043`）も保存されました。
- このrunは56件の全回帰が成功していないため時間短縮比較から除外します。run全体failureで本番Deploy jobは成功扱いにならず、分類もvalidation-onlyだったためproduction deployは実行されていません。manifestを修正したcommit `791439185535f0a96bd5de66fa401f5c683b07c2` をpushし、通常Deploy run `41206140603` で再検証中です。

### 修正後のGitHub Actions検証

- 実装commit `4142dff5acabaa7ba332b19292b6d8ccb71c0352` に続き、manifestの実engine割当を直した `791439185535f0a96bd5de66fa401f5c683b07c2` をpushしました。対象の通常Deploy workflow runは [41206140603](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41206140603)、結果はsuccessです。
- `detect-changes` と `docs-check` がsuccessし、分類は `validation-only`、`run_full_suite=true`、`deploy_required=false` でした。`verify` はsuccessし、npm suiteの1,304 test caseすべて成功、失敗・skip 0でした。Worker typecheck、build、pages-dist artifactもsuccessです。
- Chromium job（job ID `124552634937`、runner ID `1000002126`）は13:39:17–13:47:45 UTC、WebKit job（job ID `124552634932`、runner ID `1000002125`）は13:39:18–13:48:52 UTCに別runnerで実行されました。双方のengine専用回帰stepがsuccessし、実scenario区間は約6分50秒重なりました。

| 実行単位 | runner待ち | Browser UI job全体 | 回帰step | 最初のscenario〜最後のscenario | 結果 |
| --- | ---: | --- | --- | --- | --- |
| Chromium | 2秒 | 8分28秒 | 7分47秒 | 13:39:54.108–13:47:39.408 UTC、7分45.3秒 | 34 success、failure 0、timeout 0、skip 0 |
| WebKit | 3秒 | 9分34秒 | 7分56秒 | 13:40:49.362–13:48:44.505 UTC、7分55.1秒 | 22 success、failure 0、timeout 0、skip 0 |

両engineの最初のscenario開始から最後のscenario終了までは8分50.4秒です。baseline runの全56 invocation区間18分12.3秒と比較すると、今回のrunでは9分21.9秒（51.4%）短くなりました。測定は各Actions logのscenario開始／終了UTCを使い、基準と比較区間を揃えています。各runner上のscenario所要時間合計は940.406秒（15分40.4秒）でした。

| 指標 | 改善前 baseline | 修正後 run 41206140603 | 差分・注意 |
| --- | ---: | ---: | --- |
| Browser UI回帰scenario区間 | 18分12.3秒 | 8分50.4秒 | 9分21.9秒短縮（51.4%） |
| Browser UI job全体のwall clock | 19分18.2秒 | 9分35秒 | 9分43.2秒短縮。修正後は2 jobの最早開始〜最遅完了で計算 |
| Browser UI runner時間の合計 | 19分18.2秒 | 18分02秒（508秒 + 574秒） | 1分16.2秒減。Browser UIのjob log時間の合計 |
| run全体のrunner時間 | 約22分00.8秒 | 19分22秒 | 2分38.8秒減だが、baselineにはWorker/Pages deploy等があり、修正後はvalidation-onlyでdeploy jobがskipのため同条件比較ではない |

改善前の固定engine別内訳はChromium 10分38秒／WebKit 7分35秒（Phase 1のmanifest label集計）です。manifestの実engineとscenarioコードを揃えてbaseline logを再集計した値はChromium 628.567秒（10分28.6秒）／WebKit 463.698秒（7分43.7秒）です。Phase 1記録の値は固定baselineとして保持し、今回の実engine別比較には補正値を使います。suite合計の18分12.3秒は変わりません。

runは13:33:58 UTC作成、13:48:53 UTC完了で、作成から完了まで14分55秒です。最初のjob開始13:38:04 UTCから完了までは10分49秒でした。workflow-level concurrencyで前のrunを待った時間は約4分06秒です。Browser matrix job自体のqueueは2秒／3秒でした。単一runのため、これを恒常的な改善率や失敗率の変化とはみなしません。理論上の最大7分35秒というPhase 1の見込みも実測値には使っていません。

### Artifactとdeploy gate

- Browser UIのChromium artifact `browser-ui-chromium-791439185535f0a96bd5de66fa401f5c683b07c2-1`（ID `13045050963`、34,789,006 bytes）とWebKit artifact `browser-ui-webkit-791439185535f0a96bd5de66fa401f5c683b07c2-1`（ID `13044801727`、7,996,053 bytes）はどちらもupload successでした。各upload logはtiming CSV（`/tmp/heibon-browser-ui-timings.csv`）、engine log、診断用ファイルを含む98ファイルの保存を報告しています。engineを含むartifact名の衝突はありません。
- WebKit artifactは取得してCSVを開き、22行すべてが`webkit`、status `success`であることを確認しました。Chromium artifactもupload successと34/34 scenario成功をActions logで確認しましたが、artifact ZIPが32 MiBのローカル転送上限を超えたため、この環境ではZIP全体の展開・CSV直接読込はできませんでした。Chromium artifactの欠落やupload失敗ではありません。
- `center-round-display`診断artifactもChromium（ID `13044504796`）／WebKit（ID `13045145881`）ごとにupload successでした。river-spacing専用artifactは異常ファイルがなく作成されませんでした（既存の`if-no-files-found: ignore`動作）。主artifact側にはscreenshotsとserver logを含みます。pages-dist artifact（ID `13044279824`）も保存されました。
- workflow sourceと静的テストで、matrix各要素のfailure・cancel・skipがReusable workflow successにならず、`.github/workflows/deploy.yml`の`release-freshness`、`deploy-worker`、`pages-build`が`needs.browser-ui.result == 'success'`を要求することを確認しました。`continue-on-error`による失敗の成功扱いはありません。成功runではBrowser UIとverifyは実行されましたが、変更分類が`validation-only`のため`release-freshness`、`deploy-worker`、`production-test`、`pages-build`、`pages-deploy`はすべてskipでした。従って既存条件どおりdeployを起動しなかったことは確認しましたが、Browser UIのfailure／cancel／必須job skipを入力した場合にdeploy拒否する実行経路は実際には起動していません。ここは静的確認のみで、実行確認は未実施です。今回のCI/workflow変更にはアプリ変更がないため、デプロイを強制していません。

### 品質・効果判定と未確認事項

- Phase 1とPhase 2でscenario invocation総数は56のままです。実engineに基づく実行数はChromium 34／WebKit 22で、全56成功、failure 0、timeout 0、skip 0でした。Phase 1の35／21はmanifest label誤り1件を含みます。`browser-online-dialog-layout.py`が実際には常にWebKitを起動していたため、その割当だけを直しました。scenario本体、assertion、viewport、online/offline検証は変更していません。
- **A. 壁時計時間**: 1回のrunでBrowser UI回帰区間を18:12.3から8:50.4へ短縮したことを実測しました。matrix全jobのwall clockも19:18.2から9:35へ短縮しました。
- **B. runner使用量**: Browser UI runner時間は19:18.2から18:02へ1:16.2減りました。run全体では22:00.8から19:22ですが、deploy jobの有無が異なるため比較できません。
- **C. 品質**: 全56 scenario、両engine、既存assertionとworkflow success gateを保ち、成功runです。deployのnegative path（failure／cancel／skip時の拒否）は静的確認のみです。artifactはengine別に保存されました。
- 変更ファイル（Phase 2全体）: `.github/workflows/browser-ui.yml`、`tests/run-browser-regressions.py`、`tests/test_browser_regressions_selection.py`、`tests/ci-change-classifier.test.mjs`、`docs/verification/ci-performance-2026-10-28.md`、`docs/verification/browser-ui-wall-clock-issue28-2026-10-31.md`、`docs/verification/README.md`、`docs/ROADMAP.md`。Deploy workflow本体は変更していません。
- ローカル検証は上記のPython構文・engine選択5 tests・`npm test` 71 tests・change-classifier test・PyYAML構文／matrix/artifact/gate静的検証・`git diff --check`が成功しました。CIの`verify`は1,304件成功です。Browser UIはCodex Cloudで実行していません。iPhone Safari実機確認もしていません（今回のCI内部変更の必須条件ではありません）。
- 最初の失敗run [41205805669](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41205805669)は誤ったmanifest labelを特定・修正するために使い、効果測定には含めません。同一目的の手動CI再実行や反復計測は追加していません。
- 残存リスク: CI一回の測定であり、日ごとのrunner性能変動や長期安定性は未確認です。Chromium ZIPのローカル直接展開は転送上限のため未確認です。Browser UI failure／cancel／skip時のdeploy gate実行経路は未確認です。

**Issue #28はOpenのままです。** 壁時計短縮・suite成功・artifact保存・静的gate確認は完了しましたが、IssueのClose条件であるfailure／cancel／skip時のdeploy禁止をActions上の実行結果として確認していません。iPhone Safari実機確認は今回のCI変更では不要で、自動検証と実機確認を区別しています。

Browser UIをCodex Cloudで起動する環境構築は行いません。

## Phase 3 deploy gate最終検証（2026-10-31）

### 作業開始点と再利用した記録

- `origin/main`をfetchし、Phase 2文書commit `53dc02faa396ef537d8b86dadd0bc860e79579e1` を最新SHAとして確認して開始しました。Phase 2実装commit `4142dff5acabaa7ba332b19292b6d8ccb71c0352`／`791439185535f0a96bd5de66fa401f5c683b07c2`へ巻き戻していません。
- Issue #28本文とPhase 1・2コメント、Baseline run [41196608100](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41196608100)、改善後run [41206140603](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41206140603)、Phase 2記録を再利用しました。56 scenarioを再測定していません。

### Deploy依存関係とmatrix集約の扱い

- `.github/workflows/browser-ui.yml`は`chromium`／`webkit`の2要素matrix、`fail-fast: false`、`max-parallel: 2`です。matrix jobにjob-levelのengine別skip条件も`continue-on-error`もありません。
- GitHubのmatrix job結果は集約値です。2026-10-30公開の[GitHub Community報告](https://github.com/orgs/community/discussions/211624)では、runner割当より前にcancelledとなったmatrix legがあっても`needs.<matrix-job>.result`が`success`となった再現例が複数報告され、個別jobのAPI結果確認が回避策として示されています。これはCommunityの再現報告でGitHub公式仕様説明ではありませんが、集約値だけに依存する設計の残存リスクとして扱いました。
- `.github/workflows/deploy.yml`へ`browser-ui-matrix-audit`を追加しました。`run_full_suite == 'true'`のrunで`always()`条件から実行し、current `run_id`／`run_attempt`のActions jobs APIを読みます。実job名`browser-ui / browser-ui (chromium)`と`browser-ui / browser-ui (webkit)`がそれぞれ1件存在し、両方の`conclusion`が`success`であることを要求します。API取得失敗、job欠落・重複、failure／cancelled／skipped／その他のconclusionはaudit failureになります。現在のattemptを参照するため、job単体rerun後も古いattemptの結果を混同しません。必要権限は`actions: read`と`contents: read`です。
- `release-freshness`、`deploy-worker`、`pages-build`は従来の`needs.browser-ui.result == 'success'`に加え、auditのsuccessも必要とします。さらにverifyと各前提jobのsuccess、`deploy_required`、workflow_dispatchの明示入力を維持します。`production-test`はWorker deploy successに依存し、`pages-deploy`はPages build successをneedsに持ちます。これらのjobはproduction処理を行う前にauditを通過します。
- docs-only変更では既存classifierが`run_full_suite=false`かつ`deploy_required=false`を返します。このときmatrix auditをskipし、既存どおりverify／Browser UI／production deployを省略します。deployment decisionは未完了releaseがあればdocs-only pushでもsuiteをtrueにするため、その場合はmatrix auditを必須にします。

### 異常系のテスト結果と検証範囲

| Chromium | WebKit | 個別job監査の期待 | downstream gateの期待 |
| --- | --- | --- | --- |
| success | success | 許可 | 他の条件もsuccessなら続行可能 |
| failure | success | 拒否 | 停止 |
| success | failure | 拒否 | 停止 |
| cancelled | success | 拒否 | 停止 |
| success | cancelled | 拒否 | 停止 |
| skipped | success | 拒否 | 停止 |
| success | skipped | 拒否 | 停止 |
| failure | failure | 拒否 | 停止 |
| cancelled | cancelled | 拒否 | 停止 |
| skipped | skipped | 拒否 | 停止 |

- `tests/deploy-gate-matrix.test.mjs`は、実Actions jobs APIレスポンスを検査する`.github/scripts/check-browser-ui-matrix.mjs`を直接テストします。両engineの全status組み合わせに加え、matrix全体のfailure／cancelled／skipped相当、job欠落、重複、null payloadを拒否します。
- `tests/ci-change-classifier.test.mjs`はworkflowの実condition文字列を抽出して対応する条件式を評価し、success／failure／cancelled／skippedの集約値ごとに`release-freshness`、`deploy-worker`、`pages-build`が許可するのはsuccessだけであること、verify等の必須job skipを許可しないことを確認します。これは条件式の静的評価であり、GitHub Actions式ランタイムそのものを実行した証拠とは区別します。
- PyYAML 6.0.3でBrowser UI／Deploy YAMLを解析し、2要素matrix、依存job、Permissions、auditの配置を確認しました。YAML parsing・条件式評価は静的検証です。
- 既存run [41205805669](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41205805669)ではChromium job failure／WebKit job successが実際に記録され、`fail-fast: false`でWebKit側は完了しました。run自体はfailureです。ただしそのrunは`deploy_required=false`だったため、release/deploy jobは分類条件によりskipでした。これは失敗matrix時の本番gate拒否を直接実行した証拠ではありません。
- 既存run [41206140603](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41206140603)ではChromium／WebKit両jobがsuccessし、Browser UI matrixも成功しました。一方`deploy_required=false`のためrelease/deploy jobはskipでした。今回追加したauditの実API queryは、push後に自動実行されるvalidation-only runで成功pathを実行して確認します。production deployやCloudflare secretは使用しません。
- cancelled／skipped legを意図的に作る追加Actions runは起動していません。個別job APIを照会して各legの結論を直接fail-closedで判定するコードと、各stateの自動テストで確認し、実施していないActions異常runを実績扱いしません。actual negative-path workflow runは未確認です。

### Phase 3に関連する性能・artifact・CIの再確認

- 改善前後は既存Actions runとPhase 2のscenario開始・終了ログの記録を再照合しました。比較値は18分12.3秒から8分50.4秒、9分21.9秒短縮、単一run比較で51.4%です。今回の性能測定runは起動しておらず、この値を恒常的な改善率とは断定しません。
- run 41206140603のartifact metadataではChromium artifact ID `13045050963`、34,789,006 bytes、WebKit ID `13044801727`、7,996,053 bytesが存在し、両方とも非expiredです。WebKit CSVは22行を直接展開確認済みです。Chromium CSVはZIPが32 MiB転送上限を超えるため直接展開未確認で、artifact metadata・upload log・34/34 success logまでを根拠とします。
- 複数runでの性能再現性は未確認です。iPhone Safari実機確認は今回必須ではなく、実施していません。

### Phase 3ローカル検証と完了条件

- `node tests/ci-change-classifier.test.mjs`: 17 tests成功。
- `tests/deploy-gate-matrix.test.mjs`: 2 tests成功。
- `npm test`: 72 test files成功、失敗0、skip 0（Phase 3 test追加後のローカル実行）。
- PyYAML YAML parse、`git diff --check`、Browser UI selection 5 testsも実行しました。push後のActions結果と実API audit成功は別途追記します。
- 静的検証はmatrix gateがsuccess以外を拒否するコード構造とunit validatorを確認します。既存Actions runはfailure+successとsuccess+successの実matrixを確認しています。新規validation-only runではjobs API auditのsuccess pathを実行します。cancelled／skippedの実Actions matrix runやnegative deploy pathの実行は行わず、個別leg API監査が非success／欠落を拒否するunit testsで扱います。
- 完了条件の評価: 短縮計測、全56件success、scope維持、既存CI成功、artifact保存はPhase 2 runで充足。failure/cancel/skip gateはPhase 3の個別job API auditと静的status tableで補強し、GitHub上のaudit successも確認後に完了判定します。再現性、Chromium CSV直接展開、iPhone Safariは残存riskとして明記します。
