# 未デプロイ変更の検出と安全な回収 — 2026-10-31

## 問題と原因

GitHub ActionsのDeploy workflowは`github.event.before..github.sha`だけを分類し、今回のpushがテスト・workflowのみなら`deploy_required=false`にしていました。Issue #24では、アプリ変更`b9b4d7f`のBrowser UI失敗後、テスト期待値だけを直した`268a7d1`が成功してもdeploy jobはskipされました。後続のdocs-only runもdeployされず、公開環境の反映は未確認のままでした。

mainの最新`7813aea`まで確認し、ローカル`268a7d1`との間は文書6ファイルのみの4 commitでした。コードやworkflowの追加変更はありませんでした。既存のIssue #24調査記録とIssue #23（Browser UI時間調査）も確認しました。

## 判定方式

変更分類と公開状態を分けました。

1. 現pushの差分は、docs-onlyなら軽量のまま、tests/workflowなら既存どおり全回帰検証、アプリ変更なら全回帰検証とdeploy候補として分類します。
2. WorkerとGitHub Pagesそれぞれの最後に成功したdeployment record SHAから現在の実行SHAまでの差分を取り、アプリ変更が残っているか判定します。
3. どちらかに未反映のアプリ変更があれば、現pushがテストだけまたは文書だけでも、全品質ゲートを実行します。検証に成功した場合のみ公開します。
4. 配信履歴が初回で存在しない、API取得に失敗する、SHAがcheckout内で解決できない場合は、同期済みと推測しません。pushでは全検証後にWorkerとPagesを安全に再デプロイする経路へ進みます。手動実行で`deploy_to_production=false`なら本番deployはしません。

変更分類は[`.github/scripts/classify-changes.mjs`](../../.github/scripts/classify-changes.mjs)、2種類を組み合わせる判定は[`.github/scripts/deployment-decision.mjs`](../../.github/scripts/deployment-decision.mjs)です。

## デプロイ状態の情報源と権限

GitHub Actions runのsuccessだけでは公開状態を判定できません。既存run `41142201343`はworkflow successでしたがWorker/Pages deploy jobはskipでした。Pages用deployment API、Cloudflare Workerのversion情報、GitHub Actions履歴も調査しました。Cloudflare API認証情報はこの環境では利用できず、Pages/Worker両方の最終公開SHAを独立して証明する既存記録は見つかりませんでした。未取得のSHAは補いません。

新しい状態源はGitHub Deployments APIです。独立した環境名`heibon-production-worker`と`heibon-production-pages`を使い、実際のサービスdeployが成功した後に対象`github.sha`を記録します。lookupは各環境の最後の`success` statusに紐づくSHAを取得します。workflow run全体の結論を公開SHAとして流用しません。GitHub-hosted workflow tokenには状態参照jobで`deployments: read`、記録を行うWorker/Pages jobで`deployments: write`が必要です。状態はGitHub側に履歴として残り、mainへstate fileを自動commitしません。

状態APIが読めない場合はunknownとして扱い、pushではfull verify後の再デプロイへ進みます。記録APIが失敗したjobは成功扱いになりません。次回の取得で最後のsuccess recordが前回のSHAのままなら、未反映を検出して再試行します。初回はsuccess recordがないため同じfull verify経路に入り、両サービスが成功するとそれぞれ記録されます。

## Worker / Pagesの部分成功と復旧

公開順序は既存どおりWorker、Production Worker test、Worker URLを使ったPages build、GitHub Pages deployです。Worker成功後にProduction testまたはPagesが失敗した場合、Worker SHAだけは新しくなりPages SHAは古いままです。次回はPages側の差分で未反映を検出し、全ゲート成功後に両サービスを再デプロイします。単純で安全な再実行を採用し、古いWorker URLの履歴からの復元や片側だけの再利用はしません。

並行pushは`production-deploy` concurrencyで直列化し、公開前にGitHub APIで`main`の現在SHAと対象SHAが一致することを確認します。古いqueued SHAなら公開を止め、新しいmainのrunへ渡します。手動dispatchも実行対象を`github.sha`として明示し、deploy=trueのときは変更分類にかかわらず全ゲートを通します。deploy=falseでは本番deployを許可しません。

## 品質ゲート

未反映アプリ変更では、既存の順序で以下を全て必須にします。

- `npm test`
- Worker TypeScript typecheck
- Pages build
- Browser UIのChromium・WebKit回帰
- Worker deploy
- Production Worker test
- GitHub Pages build・deploy

テストまたはBrowser UI失敗時にはdeploy-workerが実行されません。docs-only pushでも未検証アプリ差分を検知した場合はfull verifyし、検証成功まで公開しません。軽量化分類は未反映アプリがない場合だけ適用します。

## テスト

変更分類・状態APIのunit tests、Issue #24で起きたtest-only recovery、docs-only pending、docs-only/test-only clean state、Worker/Pagesの片側成功、初回、状態API失敗、dispatch false/true、stale SHA拒否を自動テストします。Actions YAML構文とjob条件も確認します。

ローカル実行結果とpush後Actions結果は完了後に追記します。ローカルBrowser UIは環境のloopback server起動が`EPERM`で拒否され、Playwright Chromium/WebKit binaryも未導入のため未実施です。Chromium/WebKit full suiteはpush後のActions結果で確認します。

## Issue #24の公開状況

ソース上の単色仕様は通常`#F8DC91 / #154E3C`、押下`#E9C66A / #154E3C`、無効`#9DA27C / #20352C`です。危険操作・見送る・キャンセル・閉じるも通常色です。

GitHubで確認できた既存runでは実装run `41139721748`がBrowser UI失敗、追従test-only run `41142201343`が全56 variant成功し、verifyとbuildもsuccessでしたが、deploy jobsはskipでした。後続のdocs runもdeployなしです。Worker diagnostics successはdeploy successと区別します。新規Actions、本番Worker/Pages結果、配信内容、computed styleはpush後に確認・追記します。現時点で公開反映済みとは扱いません。Issue #24はOpenのままにし、iPhone SafariとAndroid Chromeの実機確認をユーザーへ引き継ぎます。

公開環境確認では、ソース確認、Actions、Worker deploy、Pages deploy、HTTP配信物、ブラウザーcomputed style、ユーザー実機確認を別々に報告します。確認できないものは未確認と記録します。

## 作業時間

実測できたコマンドの所要時間を記録します。工程の正確な連続開始・終了時刻を取得していないものは推定しません。Actions待機と並行編集は二重計上しません。

| 工程 | 実測・確認 |
| --- | --- |
| Workflow / 最新main / Actions / deployment state調査 | 工程の連続開始・終了は未計測。GitHub APIでmain SHA `7813aea`、対象run、Issue #24状態を確認 |
| 設計・実装 | 工程の個別開始・終了は未計測 |
| Unit tests | `npm test`: 70/70 success、32.435秒（Node test runner報告） |
| Build / Worker typecheck | `npm run build` success、Vite build 0.828秒。`npm run typecheck:worker` success。親commandの合計所要は個別未計測 |
| Workflow YAML | PyYAMLでdeploy.yml/browser-ui.ymlをparse、success。時刻区間は未計測 |
| Browser UI | ローカル起動を試行したがserver bind `EPERM`、Chromium/WebKit executableが未導入。Actions結果を追記予定 |
| GitHub Actions待ち / Deploy / 公開確認 | 新run結果の追記予定。並行作業を差し引き、実測できない待ち時間を補完しない |
| 文書作成・GitHub反映 | 文書更新開始前のUTC時刻は`2026-10-31 01:42:14`。終了・push時間は後で記録 |

この作業で実測上もっとも時間がかかった個別ローカル処理は`npm test`の32.435秒です。Browser UIやActionsの所要は未取得のため、長時間化の原因とは結論しません。改善候補は、API状態記録の権限・実運用確認と公開URL取得／computed-style確認の自動化です。実測効果は未確認です。

## 運用と未確認事項

- production deploy runが失敗したらjob summaryと最後に成功したservice deployment SHAを調べ、次のmain pushでfull verifyと安全な再deployを行います。手動復旧ではmain最新SHAを選び`deploy_to_production=true`にします。
- Deployment API read/write権限不足や障害があれば成功と見なされず、full verificationと再deployを行います。権限変更が必要な場合は管理者がworkflow token policyを確認してください。
- ActionsのChromium/WebKit、本番Worker test、Worker/Pages deploy、実配信物とcomputed styleはpush後に追記します。
- iPhone Safari・Android Chrome実機確認は未実施で、Issue #24はOpenを維持します。
