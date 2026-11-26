# Issue #67 オンラインルーム作成ダイアログ検証

- 基点: `d3bf9a647c4dd0ed8698e0e7cf41c07e15666f7d`。候補・統合・公開対象 SHA: `c823a8311d295453d0b51c79a5627c5fae7e0284`。
- 右上の閉じると専用参照を削除し、既存のスクロール抑止付きフォーカスをキャンセルへ移した。関連ブラウザーテストとボタン分類を更新。共通CSS・他ダイアログ・通信仕様は変更していない。SPECは現行記述と一致。
- ボタン分類の限定テスト成功。`npm test` は通常サンドボックスで Python 子プロセス起動 EPERM により失敗、許可付き実行で1601件成功。`npm run build`、`git diff --check`、変更した Python テストの構文検査成功。
- 候補 CI: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45641028603 成功。main CI・最終 audit: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45643294955 成功。両方とも Chromium・WebKit を含む。
- 本番公開: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45645325439 成功。成果物再利用、Worker、オンライン、Pages、台帳確定、独立した公開後 audit が成功。台帳の本番 SHA は上記と一致し pending は null。
- 受入条件1〜6: 自動検証は成功。iPhone Safariでの表示・操作はユーザーによる実機確認待ちのため最終評価は一部達成。条件7: 自動検証・main CI・公開は成功、実機確認は未実施。自動検証を実機確認の代わりとしない。
- itch.io の手動アップロード・実機確認は未実施。IssueはOpenのまま。候補のコミット後に確定した結果はこの作業ツリー上の追記であり、まだコミットされていない。

## 追加修正：フォーカス枠（実機報告後）

- ユーザー報告：2026-11-26、iPhone Safari縦画面のGitHub Pages版で、作成画面の右上「閉じる」はなくキャンセルに初期フォーカスされるが、その水色の枠の左端・下端が欠けた。スクリーンショットは会話内で提示された。修正後の実機再確認は未実施。
- 原因：フッターの左右・下に余白がなく、フォームの `overflow:hidden` によってボタンから外側に伸びる3pxのoutlineと2pxのoffsetが切られる構造。作成側のフッターに左右・下6pxの余白を追加し、共通スタイルとスクロール制御は維持した。
- 両ボタンの実際のoutline幅・offsetを含む矩形を全祖先のクリッピング境界およびviewportと比較する回帰検証を追加。320×320、縦画面、PCを含み、代表サイズのスクリーンショットをCI成果物に出力する。
- ローカル：ボタン分類・新規対局関連テスト、Python構文検査、`npm test`（許可付き、1601件）、`npm run build`、`git diff --check` 成功。ブラウザーはAGENTS.mdに従いGitHub Actionsで実施。
- 今回の候補・main・公開SHA、CI URL、公開結果：候補push・検証前のため未確定。iPhone Safariによる修正後の実機確認はユーザーが行う。

### 候補 CI の途中結果

- 候補SHA: `988bbaca276363583e6d3bffed602d60c8f86963`。run: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45658469916 。Chromium・WebKitのUI回帰4ジョブ、verify、local-online、Chromium環境分離は成功。
- WebKit環境分離はPlaywright依存関係のインストール中で長時間未完了。run全体の結果は未確定のため、今回のmain統合・本番公開・公開後auditは未実施。mainと本番台帳は前回の `c823a8311d295453d0b51c79a5627c5fae7e0284`、pendingはnull。修正後iPhone Safari実機確認は未実施。
- この途中結果の追記は候補commit後の未コミット変更。

### 再開後の検証と公開結果

- 上記の「未完了」「未コミット」は前回停止時点の記録。候補CIはその後成功し、WebKit環境分離と最終auditも成功した。遅延原因は未確認。https://github.com/ak-sekine/heibon-mahjong/actions/runs/45658469916
- 候補スクリーンショットは成果物保存先からの取得がForbiddenとなり目視未実施。代替証跡は同runのChromium・WebKit UI回帰でのoutlineとクリッピング境界の検査成功。
- 統合SHA `988bbaca276363583e6d3bffed602d60c8f86963` のmain必須CIと最終auditは成功。https://github.com/ak-sekine/heibon-mahjong/actions/runs/45709160919
- 本番公開run https://github.com/ak-sekine/heibon-mahjong/actions/runs/45710701975 は失敗。Worker公開・本番オンライン検証は成功したが、Pages deployが成果物メタデータ取得エラーで失敗し、台帳確定・公開後auditは未実施。台帳には同runのproduction pendingが残り、確定済みproduction SHAは `c823a8311d295453d0b51c79a5627c5fae7e0284`。Pagesのrelease.jsonも同SHAを示す。Pages deploymentのfailureとWorker成功を別々に扱い、再公開や台帳復旧は行っていない。
- 修正後iPhone Safariの実機再確認は未実施。本節および前節の途中結果は作業ツリー上の未コミット追記であり、mainにはまだ反映していない。

### 復旧事前調査

- `pages-verified` の予約 `ed460b9ebc676bef9204d61903f91e6bf5f51add` と親 `a89929fe0abd8897cf1ce9bb1b329992b444c014` を取得し、`inspectRecoverySnapshots` で所有者・対象SHA・siteDigest・本番開発のsnapshotおよび開発版の保持bytesを検証した。`verifyRecoveryPublicSite` で公開中の35ファイルが予約前の親snapshotと一致。
- 本番Worker healthは正規Origin指定で成功。元runのWorker deployment 8070746609とオンライン検証は成功。開発Workerの直接healthはプロキシCONNECT 403で未確認。前回mainと対象mainの差分はCSS・テスト・文書のみでWorkerソース変更はない。
- 元runのPages artifact 15066358984は未失効でAPI上存在する。Pages deployment 8070773768はfailure。実行中runは照会時なし。Pages environmentのbranch policyは取得できたが、workflow既定権限のAPIはHTTP 403。前回の成果物ダウンロードは保存先Forbidden。予約は未解決で復旧公開・Finalize・復旧auditは未実施。
- mainは `988bbaca276363583e6d3bffed602d60c8f86963`、確定本番は `c823a8311d295453d0b51c79a5627c5fae7e0284`。追加公開・Worker再公開・台帳変更は行っていない。必要な権限と新規Pages実行経路を安全に検証できる証拠が揃うまで停止。根本原因は未確定。

### 復旧 preflight の実装（未完了）

- Codexの `GET /repos/ak-sekine/heibon-mahjong/actions/permissions/workflow` はHTTP 403で、既定権限を照会できなかった。この結果はActionsの `GITHUB_TOKEN` の実効権限を示さない。
- 予約・親・元run・main CI・Worker deployment・現在の配信を読み取るpreflightと、一意な非公開用artifactのアップロード・検索検査を追加。Pages公開、Worker公開、台帳pushは含めない。書込権限やPages deploy権限の確認とは区別する。
- 現行監査は確定台帳の元publication runと最新Pages deploymentのrun・SHA、元Workerの来歴の一致を要求する。別runによる復旧に対応する限定的な来歴検証は未実装であり、recoverモードはfail-closed。候補CI、main CI、Actions上のpreflight、本番復旧、Finalize、復旧audit、修正後実機確認は未実施。
- ローカルでYAML構文検査、限定テストと既存のsnapshot・workflow・Pages監査テストが成功。上記の以前の「未コミット」は当時の状態を記録する。

### 復旧 preflight 実行結果

- 読み取り専用preflight候補・mainのworkflow SHAは `9d6f201a77da26510e6cdf5553805205aed14410`。対象ゲームSHA `988bbaca276363583e6d3bffed602d60c8f86963` とは異なる。候補CI https://github.com/ak-sekine/heibon-mahjong/actions/runs/45726266288 とmain CI https://github.com/ak-sekine/heibon-mahjong/actions/runs/45727608463 は必須ジョブ・audit成功。
- mainからのpreflight https://github.com/ak-sekine/heibon-mahjong/actions/runs/45728923606 は成功。固定予約と親、元runとmain CI、Worker deployment、予約前の配信全ファイル、production health、API読取、OIDC取得、テスト用artifactの作成と一意検索を確認。artifact ID `15075253537`。これは通常の汎用artifactであり、Pages deploy用artifact検索やPages書込権限の成功を証明しない。Environment保護を変更せず、preflightはdeploymentを作っていない。
- recoverは実装済みの公開経路ではなく明示的に失敗する安全停止。通常監査は最新Pages deploymentのSHA・runを台帳のゲームSHA・元runと一致させ、元runも成功を要求する。別workflow SHA・別runによる復旧を元の失敗runと偽らず検証する限定的来歴設計とテストが未完了。このためPages復旧、Finalize、復旧auditは実施していない。Worker再公開も行っていない。
- 前回のCodex APIでのHTTP 403は `GET /repos/ak-sekine/heibon-mahjong/actions/permissions/workflow` への照会。Actionsの読み取りやOIDCの成功とは異なり、Pages書込権限の可否は未確認。修正後のiPhone Safari実機確認も未実施。
