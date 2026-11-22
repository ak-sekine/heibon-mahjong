# Issue #57 文書のみpushの環境workflow軽量化

作業日: 2026-11-21 UTC
基準: `origin/develop` `7ee1e643d60cfeaaeccaacfd0509a3f77289f418`
fetch後の作業開始SHA: `origin/main` `0e1185df53cc17ae08cb4be3a105f3b61b9c8528`、`origin/develop` `7ee1e643d60cfeaaeccaacfd0509a3f77289f418`。初期checkoutはcleanな`work` branch `a97e8550e87f198ba11205be877ccf5302f2c0a6`で、変更前に最新origin/developから作業branchを作成した。
Issue #47は2026-11-21にcompletedでClose済み。Issue #57はOpenのまま維持する。

## 変更前

`.github/workflows/environments.yml`は`main` / `develop` pushでも全jobを起動し、`verify`からnpm tests・型検査・本番／開発／itchビルド、Browser UI reusable workflow、Chromium／WebKit環境分離、local-online、Browser UI matrix監査へ進んでいた。Browser UIの4グループ監査と公開ゲートは維持する必要がある。

実測比較元は、Issue本文の観測run [Environments #43593235082](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43593235082)（push、`AGENTS.md`のみ、SHA `f4d01f6e4e504c4cd8f740f76f18c6d8eb7dcfa6`）。成功したが、文書だけにもかかわらず`verify`、Chromium／WebKit Browser UI、Chromium／WebKit環境分離、local-onlineが実行された。

GitHub Actions APIから取得した変更前の計測:

| 指標 | 変更前 |
| --- | ---: |
| Environments runのjob数（skipを含む） | 14 |
| runner時間（skipを除く7 jobの実行時間合計） | 3,114秒（51分54秒） |
| 壁時計（最初の実行job開始〜最後の実行job完了） | 1,553秒（25分53秒） |
| Browser UI matrix | Chromium 2 job + WebKit 2 job、全件実行 |

同じpushでは独立したBrowser UI run [#43593235090](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43593235090)も起動し、4 jobs中2 jobs（変更分類とdocs-check）が実行、runner 27秒・壁時計20秒だった。Development Worker bootstrap run [#43593235177](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43593235177)は3 jobsすべてskip。

## 変更後の設計

- push差分は既存`.github/scripts/classify-changes.mjs`で分類する。base/head不明、`git diff`失敗、空差分は`--unsafe`により全検証へ倒す。
- `workflow_dispatch`と`pull_request`は分類結果に関係なく`--unsafe`を使い、従来の全検証を行う。
- 文書のみpushでは`docs-check`（`git diff --check`）と`audit`を実行する。`verify`、Browser UI reusable workflow、環境分離Browser UI、local-onlineは明示的にskipする。
- Browser UI matrix監査は全検証時に従来どおり4グループを監査する。文書のみ時は分類・文書check成功と全重いjobの意図的skipを検査し、`audit`をsuccessとして確定する。分類出力の欠落や不正値はaudit failureとなる。
- workflow-level `paths-ignore`は使わない。`browser-ui.yml`のChromium／WebKit対象、assert、並列数、matrix auditは変更しない。
- `publish`は手動`publish=true`、許可ブランチ、`DUAL_PAGES_ENABLED=true`、分類・文書check・全検証・auditの成功を引き続き要求する。`publish=false`では全検証を実行し公開しない。公開workflow、Worker／Pages条件、成果物照合は変更しない。

## 分類・条件テスト

変更分類とActions条件の限定テストで、以下を確認する。

| ケース | 分類 | 実行 | skip | 公開 |
| --- | --- | --- | --- | --- |
| `AGENTS.md`のみ | `docs-only` | classify、docs-check、audit | verify、全Browser UI、環境分離、local-online | 不可（push） |
| 通常Markdownのみ | `docs-only` | classify、docs-check、audit | 同上 | 不可（push） |
| ゲーム本体コード | `application-or-unknown` | 全検証 | なし（手動publish以外の公開jobは対象外） | 不可（push） |
| workflow / script / test / 依存関係 | validation-only / application-or-unknown | 全検証 | なし | 不可（push） |
| 文書とコードの混在 | `application-or-unknown` | 全検証 | なし | 不可（push） |
| 差分取得失敗・判定不能 | `application-or-unknown` | 全検証 | なし | 不可（push） |
| `workflow_dispatch`, `publish=false` | 強制全検証 | 全検証 | publishのみ | 不可 |
| `workflow_dispatch`, `publish=true` | 強制全検証 | 全検証成功が必要 | なし | 条件成立時のみ可能。実dispatchは行わない |

ローカル実行済み:

- `node --test tests/environment-workflows.test.mjs tests/ci-change-classifier.test.mjs tests/deploy-gate-matrix.test.mjs` — 3 test files成功。分類・manual条件・公開ゲート・matrix監査を検証。
- `npm test` — 92/92成功。
- `python tests/test_browser_regressions_selection.py` — 19/19成功。Chromium／WebKitの既存選択・matrix設定を検証。
- `python tests/test_live_environment_e2e.py` — 31/31成功。既存のlive environment E2E構成テスト。
- PyYAMLで`environments.yml`と`browser-ui.yml`をparse — 成功。
- `git diff --check` — 成功。
- `actionlint` — 未導入のため未実施。
- `npm run typecheck`、`npm run typecheck:worker`、`npm run build` — 成功。

## GitHub設定

2026-11-21にGitHub APIで確認:

- `main`と`develop`はいずれも`protected: false`、classic protection disabled、required status check contextsなし。
- repository rulesets APIは空配列。組織または上位階層のポリシーは未確認。
- Issue #47の完了・Closeを確認。Issue #57はOpenのまま。Issueの変更や外部設定変更は行わない。

job-level skipを含む実際のrequired-check状態は、変更後の通常push runで確認する。

## Actions実行・計測

通常pushと手動`publish=false`は同じSHA `983251ef2a8a2712311f3713e6a05096be70a9d1`でそれぞれ全検証を実施した。`publish=true`は公開発生を防ぐためGitHub Actionsへdispatchしていない。job conditionのeligible条件は限定テストで評価した。

| run | URL / SHA | job数 | runner時間 | 壁時計 | 結果 |
| --- | --- | ---: | ---: | ---: | --- |
| 変更前 Environments docs-only push | [#43593235082](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43593235082), `f4d01f6e` | 14（7実行） | 51分54秒 | 25分53秒 | success、docs-onlyにも全重いjobが起動 |
| 変更前同一pushのBrowser UI | [#43593235090](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43593235090) | 4（2実行） | 27秒 | 20秒 | docs-check・分類のみ実行 |
| 変更後通常push Environments | [#44893196109](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44893196109), `983251ef` | 16（11実行） | 34分38秒 | 11分04秒 | success。4 Browser UI groups、環境分離2件、local-online、audit success。publish skip |
| 変更後同一pushのBrowser UI | [#44893196054](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44893196054) | 8（7実行） | 33分02秒 | 9分46秒 | success。Chromium／WebKit 4 groups success |
| 変更後docs-only Environments | [#44894465861](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465861), `f7b4e41` | 8（3実行） | 40秒 | 45秒 | success。重いjobとpublishはskip、docs-only audit success |
| 変更後同一pushのBrowser UI | [#44894465845](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465845) | 5（2実行） | 20秒 | 11秒 | success。verify-build・Browser UI matrix skip |
| 変更後同一pushのWorker bootstrap | [#44894465847](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465847) | 3（0実行） | 0秒 | — | 全job skip |
| 手動 `publish=false` | [#44893278635](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44893278635), `983251ef` | 16（11実行） | 37分22秒 | 10分27秒 | success。全必須gate success、publish skip |
| 手動 `publish=true` | dispatchしない | — | — | — | 公開job条件のみ静的評価 |

変更後のdocs-only pushは、検証記録と目次だけを変更したcommit `f7b4e415975c86914d2574308fb23163f29ef01a`で実施した。Actionsログの分類出力は`changed_count=2`、`classification=docs-only`、`run_full_suite=false`、`deploy_required=false`。Environmentsの分類とdocs-check、独立Browser UIの分類とdocs-checkがsuccess。Environments auditの「Confirm intentional docs-only skips」もsuccessし、matrix audit stepは意図どおりskip、audit job自体はsuccess、publishはskipになった。

| docs-only push計測範囲 | 変更前 | 変更後 | 削減率 |
| --- | ---: | ---: | ---: |
| Environments jobs（実行/全job） | 7 / 14 | 3 / 8 | job総数42.9% |
| Environments runner時間 | 3,114秒 | 40秒 | 98.7% |
| Environments壁時計 | 1,553秒 | 45秒 | 97.1% |
| push event全workflowのjobs | 9 / 21 | 5 / 16 | job総数23.8% |
| push event全workflowのrunner時間 | 3,141秒 | 60秒 | 98.1% |
| push event全workflowの壁時計 | 1,554秒 | 46秒 | 97.0% |

変更後docs-only run一覧:

- Environments [#44894465861](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465861): 8 jobs（3実行）、runner 40秒、壁時計45秒、success。`verify`、Browser UI、環境分離、local-onlineはskip。
- Browser UI [#44894465845](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465845): 5 jobs（2実行）、runner 20秒、壁時計11秒、success。verify-buildとBrowser UI matrixはskip。
- Development Worker bootstrap [#44894465847](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44894465847): 3 jobsすべてskip、runner 0秒。

全workflow job数は実行jobとskip jobを含む。runner時間はskip jobを含めず、Actions jobの開始・完了timestampの合計。壁時計は対象run群で最初の実行job開始から最後の実行job完了まで。並列実行した3 workflowを合わせた比較値は同日・同runner環境の実測であり、他のpushへの保証値ではない。

公開への影響: 実Worker／Pages公開、公開workflow、`DUAL_PAGES_ENABLED`、secrets、branch protection、rulesetsを変更しない。

## 受入条件（6件）

1. AGENTS.mdのみのpushで重い検証を省略し文書検査を実行 — `AGENTS.md`の分類テスト成功。markdown-only pushで重いjobのskip、文書検査、audit successをActionsで確認。
2. コード・CI設定・依存・混在・判定不能で全検証 — 条件テスト成功。通常pushでverify、Chromium/WebKit、環境分離、local-online、auditがsuccess。
3. 手動公開と公開条件 — `publish=false` full run success、publish skip。`publish=true`の全gate eligible条件はテストで評価し、dispatchも公開もしていない。
4. required checksの成立 — main/developにbranch protection required contextsなしを確認。通常push・manual全jobでfailure/pendingなし、audit success。
5. Chromium/WebKit品質ゲート維持 — 4 groups全success、既存matrix監査success。対象範囲・assert・並列設定を削除・緩和していない。
6. 削減効果を文書化し、意図しない公開なし — docs-only pushのjob数、runner時間、壁時計、削減率を実測・記録。通常push・manual・docs-onlyでpublish skipを確認。

## 未確認事項

- `publish=true`をdispatchした場合の実runは未確認（公開防止のため意図的に未実施）。
- 組織・上位階層で適用されるルール（APIで取得できるrepository rulesetsは空）。
- iPhone Safari実機確認（本変更はworkflowのみで、実機操作を伴わない）。

## main 統合と検証

作業開始時のローカルHEADは `a97e8550e87f198ba11205be877ccf5302f2c0a6`（`work`、clean、最新mainに対してbehind 40 / ahead 0）。許可付きのGit通信で取得した統合前mainは `25ca994be34b9d45fe1752588982d6a3ea84144b`、参照developは `3d3a1bd76d8c6fd55b2f09ae50e2375ba4d180aa`。比較時点でmain固有12件、develop固有72件。参照developの先端でも、分類・文書検査・auditの成功と重い検証・publishのskipを確認した。[develop run #44955079999](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44955079999)

mainには `6318fa1192ece23a8d6b73a13a22f468612bb670` をfast-forwardで反映した。Issue #57の分類・文書検査・audit、関連テスト、および過去のdevelop検証記録を移植した。環境workflowとテストのIssue #57差分はmainに競合なく適用できた。分類ジョブの実行失敗時も全検証が動くよう、後続の重いjobはverify成功で選択し、auditは分類失敗を検出する。分類処理そのものは既存スクリプトを再利用した。

Issue #58のBrowser UI再編、ゲーム・実機検証差分、運用文書の無関係な差分を除外した。mainのChromium/WebKit全4グループと環境分離2件を維持し、公開用reusable workflow、旧Deploy workflow、予約・環境承認・SHA確認・Worker/Pages順序には差分がない。公開callerには分類と文書検査の成功を依存条件として追加した。GitHubで旧Deploy workflowは `disabled_manually`、mainの `protected` は `false`、branch rules一覧は空だった。required status checks個別APIと公開フラグの読取APIはHTTP 403だった。

ローカルでは分類17件、環境workflow 6件、関連CIテスト6ファイル、`npm test` 92ファイル、Worker型検査、本番・開発・itchビルド、`git diff --check` が成功。開発・itchビルドにはCIの検証用URLを指定した。開発ビルドは初回にURL未指定で既存のガードが作動し、指定後に成功した。Chromium/WebKitの実行結果はActionsで確認する。

| Environments run | SHA | 状態 |
| --- | --- | --- |
| [変更前のmain文書のみpush #44952666228](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44952666228) | `25ca994be34b9d45fe1752588982d6a3ea84144b` | 9実行 / 13件、runner合計4,000秒、壁時計1,589秒。Chromium/WebKit全4グループを実行、publishはskip |
| [統合コミットの通常push #44960150625](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960150625) | `6318fa1192ece23a8d6b73a13a22f468612bb670` | 分類・docs-check・verify・環境分離2件・local-online成功。WebKit group 2が失敗し、残り3グループとauditは停止判断時点で未確定 |

比較はEnvironments workflowに限定し、runner時間はskipを除く各jobの開始から完了までの合計、壁時計は最初の実行jobの開始から最後の実行jobの完了までとした。公開有無の比較基準として、作業開始時点の最新Worker/Pages deploymentはいずれも `3c52d17b7c301cb8a4ff5d22fa53bb5594cade94`（Worker ID `7965528881`、Pages ID `7965544141`）。

### main 上の文書のみ push

統合記録および変更前のCI実測値の追記だけを含む `85999b4c59c39b5be1dbc8521b6c689c671199fc` をmainに反映した。[Environments #44960242324](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960242324)

- 分類ログは `classification=docs-only`、`changed_count=1`、`run_full_suite=false`、`deploy_required=false`。分類とdocs-checkは成功。
- verify、Browser UI、環境分離、local-online、publishはskip。auditの軽量経路がskipを検証して成功し、通常経路のmatrix監査stepはskip。run全体もsuccess。
- 変更前のmain文書pushとの比較では、全job数は13件から8件、実行job数は9件から3件。runner時間は4,000秒から27秒（99.3%減）、壁時計は1,589秒から33秒（97.9%減）。変更前後ともmain上の文書pushを比較した実測値。
- `AGENTS.md` 単独の分類はローカルテストで確認した。main上の実pushには内容のある既存検証記録の更新を使った。

公開フラグの読取APIは利用できなかったが、統合コミットのverifyログで `Publication mode: enabled (true; manual publish=true dispatch still required).` を確認した。

### main 上の通常 push と停止判断

WebKit group 2の「Run standalone itch smoke test before Browser UI suite」で、2回目の対局開始・打牌確認時に `tests/browser-itch-package.py:317` のassertが失敗した。打牌受理の診断は取得できたが、取得した診断に `GameController.confirm` 由来の期待する状態遷移は含まれていなかった。原因は未確定。スモークテスト本体とBrowser UI workflowは統合前mainと同一であり、assertやゲートは変更していない。[失敗job](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960150625/job/137017389804)

必須ゲートの失敗により作業を停止した。停止判断時点で通常pushの残り3ブラウザーグループは進行中で、auditとpublishの最終結果は未確認。通常pushの公開callerはイベント条件で対象外。docs-only runではpublishのskipを確認した。Worker/Pagesの最新deployment IDとSHAは統合前と同一だった。非公開手動 `publish=false` は停止条件に従い未実施。公開用 `publish=true` も実行していない。

確認済みのリモートmain先端は `85999b4c59c39b5be1dbc8521b6c689c671199fc`。docs-only実測以降の追記は、停止条件に従い作業ツリーに保存した。通常pushの必須ゲート成功と手動全検証が未達のため、Issue #57はOpenのまま。

### WebKit itchスモークの競合修正

前回停止時の追記は当時の記録として保持した。失敗runの最終結果は、分類・docs-check・verify・環境分離2件・local-online・Browser UIの残り3グループが成功、WebKit group 2とauditが失敗、publishがskipだった。[通常push #44960150625](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960150625)

失敗時も打牌受理、`GameController.confirm` 由来の遷移、選択牌の手牌からの消失と河または公開面子での一意性を要求するPlaywrightの待機は成立していた。その後、診断画面を経由して直近40件だけを読み直す間にCPUが進み、確認済みの遷移が抜粋範囲から外れてassertが失敗した。Issue #57統合前後でスモークテスト、Browser UI workflow、ゲームソースは同一だった。[失敗job](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960150625/job/137017389804)・[診断JSONとtrace](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44960150625/artifacts/14729460966)

修正前mainは `85999b4c59c39b5be1dbc8521b6c689c671199fc`、参照developは `3d3a1bd76d8c6fd55b2f09ae50e2375ba4d180aa`。developの `d701d227e94563dab5f367d38a9287df4e200c2a`、`9b1f49264565419fa06b1578f25d1279d9bac12e`、`d353bacc92acd34155c92d9cd72c678e522b3c68` から、`tests/browser-itch-package.py` と `tests/test_itch_smoke_startup.py` の差分だけを `e84b2f023d0aa1b9222c6cc504fe40e2d0b342d5` としてmainへ反映した。

打牌前に確認した操作IDを除外し、新規打牌の開始・受理を同じIDで対応付け、その間に記録された `GameController.confirm` 遷移と牌の位置を診断画面を開く前に取得する。証拠を確保した後も牌の移動先の検査と失敗時の直近40件の診断を維持する。5秒の待機上限と既存の検査条件は維持した。CPU鳴きと40件を超える後続CPUログを同時に検査する回帰ケースを含め、関連ユニットテスト13件が成功した。

現行mainのworkflowにWebKitスモーク単独起動の入力はなく、ローカルPlaywrightのWebKit取得も配信元でHTTP 403だった。ブラウザー実行結果は、既存のGitHub Actions WebKit group 2のstandalone itchスモークで確認する。[修正後の通常push #44963268562](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44963268562)

修正後の通常pushではWebKit standalone itchスモークが回帰suiteの前後で各3回成功した。制御失敗を使ったスクリーンショット、Playwright trace、診断JSONの採取検査も成功した。通常CIの全必須ゲート成功とpublishのskipを確認した後、同じmain SHAを対象に `publish=false` を明示して手動起動した。[WebKit group 2](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44963268562/job/137026876986)・[非公開手動検証 #44965425797](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44965425797)

### 修正後 main の最終検証（2026-11-22 UTC）

検証対象SHAは `e84b2f023d0aa1b9222c6cc504fe40e2d0b342d5`。通常pushと手動 `publish=false` の両runがsuccess。手動runでもWebKit standalone itchスモーク前後各3回と制御失敗時の診断採取に成功した。

| Job | 通常push #44963268562 | 手動 `publish=false` #44965425797 |
| --- | --- | --- |
| `classify-changes` | success | success |
| `verify` | success | success |
| `docs-check` | success | success |
| `local-online` | success | success |
| `isolation-browser (chromium)` | success | success |
| `isolation-browser (webkit)` | success | success |
| `browser-ui / browser-ui (webkit, group 1)` | success | success |
| `browser-ui / browser-ui (chromium, group 1)` | success | success |
| `browser-ui / browser-ui (chromium, group 2)` | success | success |
| `browser-ui / browser-ui (webkit, group 2)` | success | success |
| `browser-ui / detect-changes` | skipped | skipped |
| `browser-ui / docs-check` | skipped | skipped |
| `browser-ui / verify-build` | skipped | skipped |
| `audit` | success | success |
| `publish` | skipped | skipped |

Browser UI内でskipされた3件は、呼び出し元の検証済みビルドを再利用するための既存の分岐。全4グループは両runで成功し、auditが確認した。

本番WorkerとPagesの最新deployment IDはそれぞれ `7965528881` と `7965544141`、SHAは両方 `3c52d17b7c301cb8a4ff5d22fa53bb5594cade94` で作業前と同一。旧Deploy workflowは手動無効の状態を維持した。公開用 `publish=true` の実行は対象外で、公開保護は既存テスト・workflow条件と両runのskipで確認した。

受入条件7件は、mainの文書のみpush、限定テスト、修正後mainの通常pushと非公開手動検証で照合した。AGENTS.md単独は分類テスト、実pushは本検証文書の更新で確認した。ローカルWebKitは取得制限があり、WebKitの実行はGitHub Actionsで検証した。iPhone Safari実機と上位階層の外部ルールは今回の実行対象外。Issue本文とチェックボックスは変更せずOpenを維持する。
