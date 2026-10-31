# Issue #24 公開環境デプロイ調査 — 2026-10-31

## 調査目的

Issue #24のボタン単色統一が公開環境へ反映されたかを確認し、未反映の場合にdeploy jobが動かなかった理由を調べました。公開環境の実配信内容または信頼できるデプロイ記録を取得できなかったため、反映状態は**未確認**です。本記録はユーザーのiPhone Safari・Android Chrome実機確認の前提となる調査記録です。

## 対象SHA・Actions run

- 作業開始時のGitHub `main`: `8a556e2dfe52bbcd3b283fd0675dd7da34960efb`（GitHub Branch APIで確認）
- 手元checkout: branch `work`、`268a7d1d0bb9724d06170f5cdd6e20bebaa092a1`。開始時に未コミット変更はありませんでした。
- `git fetch origin main` は実行を試みましたが、実行環境のproxy接続が拒否されました。したがって手元branchを最新mainへ更新できていません。GitHub APIでmainのSHAと対象workflow・設定を照合しました。
- 実装: `b9b4d7f51982bbe83d2b32f965b01cf29457bf79`
- テスト修正: `268a7d1d0bb9724d06170f5cdd6e20bebaa092a1`
- 最終main: `8a556e2dfe52bbcd3b283fd0675dd7da34960efb`
- Actions `41139721748`: `b9b4d7f`、push、failure。verify成功後、Browser UIがfailure。deploy-worker / production-test / pages-build / pages-deployはskip。
- Actions `41142201343`: `268a7d1`、push、workflow success。verifyとBrowser UIはsuccessだが、deploy-worker / production-test / pages-build / pages-deployはskip。
- Actions `41146814833`: `8a556e2`、push、docs-only扱いでworkflow success。verify・Browser UI・全deploy jobsはskip。
- Actions `41146863442`: `8a556e2`から起動したProduction Worker diagnostics。Workerの本番診断はsuccess。デプロイworkflowではありません。
- 記録push `093dc7d` に対するActions `41148560260`: docs-only workflow success。verify・Browser UI・deploy-worker・production-test・pages-build・pages-deployはskip。
- 同pushに対するProduction Worker diagnostics `41148607718`: success。Worker診断であり、デプロイworkflowではありません。

## 公開URLとデプロイ構成

- ゲーム: https://ak-sekine.github.io/heibon-mahjong/
- オンラインWorker: https://heibon-mahjong-online.ak-sekine.workers.dev
- PagesはCloudflare PagesではなくGitHub Pagesです。`deploy.yml`はWorkerをWranglerで先にdeployし、その公開URLを埋め込んでVite buildし、`actions/deploy-pages@v4`でGitHub Pagesへdeployする構成です。
- Workerは`wrangler.jsonc`の`heibon-mahjong-online`を`worker/index.ts`からdeployします。GitHub Actionsの`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` secretsを参照します。値は取得・記録していません。Worker deploy jobにGitHub Environment指定は見当たらず、Pages deploy jobは`github-pages` environmentを使います。
- push先は`main`。workflow_dispatchにも対応し、`deploy_to_production`入力がtrueの場合のみ手動起動から本番deployできます。入力のdefaultはfalseです。`production-deploy` concurrency groupは`cancel-in-progress: false`です。
- workflowの権限は基本`contents: read`、Pages buildに`pages: write`、Pages deployに`pages: write`と`id-token: write`を付与しています。全workflow runのpermissionは上記対象runで確認できる範囲のみとし、secret値・Actions environmentの設定内容は読んでいません。

## deploy jobが実行されなかった理由

workflowにpaths / paths-ignoreのtrigger filterはありません。pushごとに`detect-changes`が変更パスを分類し、`deploy_required`を出します。`.md`のみならdocs-only、`.github/`・`tests/`・`package.json`のみならvalidation-onlyで、いずれもdeploy対象外です。アプリケーション変更または分類不能時はdeploy対象です。

`41139721748`の実装pushはBrowser UIの色期待値assertionで失敗しました。deploy-workerは`needs.browser-ui.result == 'success'`も必須とするため、このrunはdeployに進みませんでした。

続く`41142201343`ではBrowser UIがsuccessでしたが、変更はテスト修正1ファイルのみでした。`detect-changes`ログは`changed_count=1`、`classification=validation-only`、`deploy_required=false`を記録しています。deploy-workerはさらに`deploy_required == 'true'`を要求するため、Browser UI成功だけではdeployされません。したがって、成功したテスト修正pushが実装SHAの未deployを自動で引き継がないことが今回の直接原因です。

これはworkflowに書かれた条件どおりのskipであり、job依存関係の失敗やキャンセルではありません。`always()`も品質ゲートや`deploy_required`条件を迂回しません。`41146814833`もdocs-onlyだったためdeployされません。

workflowを変更していません。既存のworkflow_dispatchは安全な復旧手段として存在し、mainで`deploy_to_production=true`を明示すれば、full verification・Browser UI・Worker deploy・本番Worker test・Pages build/deployを行います。このGitHub接続にはworkflow dispatch開始操作がなく、GitHub公開APIもこの実行環境のネットワークproxyから403を返すため、実行できませんでした。rerunできるfailed deploy jobもありません（該当deploy jobはskip状態です）。

## Cloudflare / GitHub Pagesのデプロイ状態

- Cloudflare Workerの最終成功deploy時刻・deploy対象SHAは**未確認**です。アクセス可能なGitHub Actions記録にはWorker diagnostics run `41146863442`と`41148607718`のsuccessがありますが、これはdeploy記録ではなく、Worker実装SHAとの照合もしていません。
- GitHub Pagesの最終成功deploy時刻・公開SHAも**未確認**です。今回確認した3つのDeploy workflowでは`pages-deploy`はすべてskipです。
- Cloudflare dashboard / Pages deployment history / Worker version APIにはアクセスできませんでした。GitHub Actionsも上記run以降に実deploy成功を示す記録は取得できていません。

## 公開環境の配信内容・computed style

公開URLへのHTML/CSS/JavaScript取得を試みましたが、実行環境のproxyが外部接続を403で拒否しました。Browser UIのweb取得ツールも対象URLを開けませんでした。そのため、公開配信物、キャッシュとoriginの比較、バンドル内SHA、computed styleは**すべて未確認**です。

手元ソース`src/style.css`では次の指定を確認しました。これはリポジトリのソース確認であり、公開配信物の確認や実画面でのcomputed style確認ではありません。

| 状態 | ソース指定の背景 | ソース指定の文字 |
| --- | --- | --- |
| 通常 | `#F8DC91` | `#154E3C` |
| 押下 | `#E9C66A` | 通常文字色を継承（`#154E3C`） |
| 無効 | `#9DA27C` | `#20352C` |

同CSSは`.ui-button`に共通の通常色、`:active`に押下色、`:disabled`に無効色を適用します。危険操作・見送り・キャンセル・閉じるの**公開画面上の色**は未確認です。配信CSSにこの規則が存在することも、対象DOMで実際に勝つことも確認できていません。

## 修正・検証・未確認事項

- workflow条件・アプリコード・配色仕様は変更していません。理由は、skip原因がrun logで確定し、既存の明示dispatch経路があり、実deploy操作を起動する手段がこの接続にないためです。
- workflow構文検証、テスト、deploy、公開環境の確認は今回実行していません。workflow変更・ゲームコード変更がないため重いテストは再実行していません。
- 新規検証記録に`git diff --no-index --check /dev/null docs/verification/issue24-production-deployment-2026-10-31.md`を実行し、whitespace errorなしでsuccessしました。ローカルcheckoutは最新mainではないため、main全体のworkflow検証には使っていません。
- `41142201343`のverifyとBrowser UI success、および`41146863442`のWorker diagnostics successを確認しました。これらを本番deploy successや公開ページ反映の証拠として扱いません。
- 実配信HTML/CSS/JS、computed style、Cloudflare Worker version/deploy SHA、Pages deployment record、キャッシュ状態は未確認です。
- このIssue #24はOpenのままにします。iPhone Safari・Android Chromeの実機確認も未実施です。

## 作業時間

作業開始は`2026-10-31 00:05:34 UTC`です。最初の検証記録commit・Issueコメント後の確認を含む区間を`00:10:53 UTC`で区切ると、ここまでの経過は5分19秒です。初回調査区間は2分7秒、記録作成・最初のdiff check区間は36秒、残りのGitHub反映・Issueコメント・Actions/Issue状態確認区間は2分36秒（00:08:17–00:10:53）です。最後の記録追記・Issueコメント更新・最終read-only確認はこのcheckpoint後であり、所要時間は未計測です。Actions調査とCloudflare/Pages調査は初回調査内で並行しており、個別の計測開始点がないため分割していません。合計値から推測配分していません。

| 工程 | 時間 |
| --- | --- |
| リポジトリ・workflow調査、Actionsログ、Cloudflare/GitHub Pages調査、公開環境取得の試行 | 合計2分7秒（この初回調査区間で計測。内訳未計測） |
| 修正 | 0分（修正なし） |
| ローカル検証 | 文書diff check success（所要時間は個別未計測） |
| GitHub Actions待機、デプロイ待機 | 0分（新しい実行なし） |
| 公開環境確認 | 未確認。接続試行時間は上の調査区間に含む |
| 文書更新・ローカルdiff check | 36秒（00:07:41–00:08:17 UTC） |
| GitHub反映、Issueコメント | API writeの個別所要時間は未計測。00:08:17–00:10:53の2分36秒区間に含む |

Actions/デプロイ待ちと文書作業の並行計上はありません。最終記録追記以降の時間を推測で補っていません。

## iPhone Safari・Android Chrome実機確認への引き継ぎ

本番反映が未確認のため、実機確認の前にまずworkflow_dispatchを`main`の最新SHAで`deploy_to_production=true`にして実行し、Worker deploy・production-test・Pages deployのsuccessを確認してください。その後、公開URLを端末で開き、必要ならハード再読み込み後に次を確認してください。

- 通常・押下・無効の各状態で背景色と文字色がそれぞれ `#F8DC91 / #154E3C`、`#E9C66A / #154E3C`、`#9DA27C / #20352C` であること。
- 危険操作、見送る、キャンセル、閉じるが通常時に共通色であり、押下・無効も状態色に従うこと。
- メニュー、確認ダイアログ、ローカル対局、オンライン待機/ルーム操作、診断ログの実使用ボタンで確認すること。連打・処理中表示・disabled・画面回転・縦横・明るさも見ること。
- 配信SHAまたはActions deploy結果と確認時刻を記録し、実機で見た色とcomputed styleを分けて記録すること。

**実機確認状態: 未実施。公開環境の反映状態: 未確認。**
