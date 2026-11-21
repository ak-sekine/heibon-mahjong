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
