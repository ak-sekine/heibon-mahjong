# Issue #47 開発Worker初回作成の準備（2026-11-12 UTC）

## 基準と範囲

- 開始branch `work`、作業ツリーclean、remote `https://github.com/ak-sekine/heibon-mahjong.git`。
- 開始HEAD / fetch後origin/main: `cb457bb0dfe00455adf66d5f8c51284d0d00081f`、behind/ahead 0/0、未push commitなし。
- `git fetch origin`は通常sandboxでproxy:8080接続失敗。正規の許可付き同一fetchで成功。
  checkoutのfetch refspecにdevelopが含まれなかったため、明示refspecで取得。
- 最新origin/develop: `a18d2108f27e8de715217074891b18aee5df25c6`。
  develop branchをこの参照から作成。mainとの差7コミットは既存のpush済みIssue #47実装であり、今回追加分ではない。
- Issue本文と4コメントを確認。Open、同一アカウント・別Worker・自己bindingが現行方針。
- 元developの既存CI run `43123226125`をAPIで確認：全体success。今回のCI結果とは区別する。
- ユーザー申告のGitHub Variables/Environment Secrets設定は前提として扱う。
  秘密値を取得しない。実Cloudflare状態・権限は準備段階で確認していない。

## 変更6ファイル

- `.github/workflows/bootstrap-development-worker.yml`: develop push専用、厳密なメッセージ一致時のみ実行。
  mainのworkflow_dispatch登録不要。準備pushはskip。既存の公開経路と独立、contents:readのみ。
- `.github/scripts/bootstrap-development-worker.mjs`: config検査、不在確認、最新SHA照合、開発専用deploy、
  返却URL抽出、実DO ID分離・本番settings不変・health確認、独立した開発rate-limit probe。
- `tests/bootstrap-development-worker.test.mjs`: モックCLI/APIによる正常・停止条件とworkflow契約、quota検査。
- `docs/operations/bootstrap-development-worker.md`: 承認後の起動、検証・URL登録、失敗後の扱い。
- `docs/operations/environments.md`: 初回作成手順へのリンク。
- 本検証記録。

既存production config / Workerソース / migration / CI / 公開ゲートは変更しない。
開発configも既存の自己binding・v1/v2 SQLite migrationをそのまま使用する。
main・Pages・公開フラグ・Issue状態は変更しない。PRは作成しない。

## 検証結果

- `npm test`: 全91テストファイル成功。
- `npm run typecheck:worker`: 成功。
- `npm run build`: 成功（TypeScript、Vite、PWA）。公開操作ではない。
- `wrangler deploy --dry-run --config wrangler.development.jsonc`: 成功。
  ROOMS / RATE_LIMITERの2binding、開発entryのbundleを確認。実デプロイなし。
  初回はsandbox外のconfig directoryへの書込エラーで失敗し、
  `XDG_CONFIG_HOME=/tmp/heibon-wrangler-config`で再実行成功。
- actionlint 1.7.11: 全workflow成功。初回検査でif式内のコロンのYAML解釈エラーを検出し、
  folded scalarへ修正して再検査成功。既存workflowは変更していない。
- モック検証：URL未登録で成功、固定開発configだけdeploy、main/event/message/account不正拒否、
  古いSHA拒否、既存Worker拒否、403/曖昧404/500停止、URL不明/本番URL/複数URL拒否、
  外部binding/routes/migration変更拒否、namespace欠落/共有拒否、本番settings変化/health失敗時は出力URL未確定、
  secretをSummaryへ含めないこと、quotaの400→429と503/制限未適用の失敗を検証。
- `wrangler dev --local --config wrangler.development.jsonc --port 8788 --persist-to /tmp/heibon-bootstrap-development-do`
  でローカル実行。sandboxではlisten EPERMのため、許可付きlocal起動で成功。
  Request.cf取得の警告は出たが、ローカルWorkerの起動・検証は成功。
- ローカル開発URLだけへ既存`test:online:production`を実行：
  two-human-game-host-cpu-handoff-reconnect / disconnect-reconnect /
  host-handoff-one-human-three-cpu / four-humans-zero-cpu / three-humans-one-cpu の5シナリオ成功。
  このコマンド名は対象が本番であることを意味しない。実本番への要求なし。
- rate probeはfetch先をローカル開発Workerへ差し替えて実行し成功。
  空表示名の400拒否と永続quotaの429応答を確認。fixture hostnameは実URLではなく登録禁止。
- `git diff --check`: 成功。

## 未確認と承認境界

実Cloudflareへの作成・実URL取得・実DO ID比較・実health・実オンライン検証は未実施。
Cloudflareが返す開発URLは未取得であり、推測値を登録していない。
本番DOを操作する環境間E2Eは実施せず、作成時にnamespace ID比較で独立性を確認する。
実環境間のルーム/token非共有E2E、Pages公開、iPhone Safari確認はIssue #47の残件として維持する。

ユーザーの明示的な許可後のみ、最新CIを確認して専用メッセージの空commitをdevelopへpushする。
成功runのSummaryに実URL・SHA・namespace IDを残し、全step成功を確認して実URLを報告する。
その確認済みURLだけをRepository Variable `DEVELOPMENT_WORKER_URL`へ登録する。
失敗しても自動削除・本番への切替・無条件再deployはしない。手順は[運用文書](../operations/bootstrap-development-worker.md)。

## 明示的許可後のCI確認（2026-11-12）

ユーザーから初回作成の明示的な許可を受領。準備commit `46b9f6b`のrun `43220966634`は
npm test 1,539件とWorker型検査に成功したが、`PRODUCTION_WORKER_URL`の登録値末尾に`/`があり、
sealの厳密なURL検査で失敗していた。ブラウザ以降はskip。作成はまだ実施していない。
既存公開ゲートと本番設定を維持し、environments.ymlの検証用ビルド入力だけ末尾`/`を正規化する。
ローカルで本番/開発buildとsealを再検証。公開用URLの厳密な照合は変更しない。

## 実行完了記録（ユーザーの明示的許可後）

### 結果

- 実Worker URL: **https://heibon-mahjong-online-dev.ak-sekine.workers.dev**。
  Wranglerの公開トリガー適用出力から取得し、同じURLでhealthとオンライン検証を通した。
- 作成対象: `heibon-mahjong-online-dev`、config: `wrangler.development.jsonc`。
- GitHub Environment: `worker-development`（deployment branch policyのdevelop許可をAPIで確認）。
- `DEVELOPMENT_WORKER_URL`は作成時に不要。値の自動登録はしていない。
  [運用文書](../operations/bootstrap-development-worker.md)に確認済み実値の登録コマンドを記載。
- 本番Workerのsettings前後完全一致を自動確認。本番DOへのテスト要求・変更APIは呼んでいない。
  main / Pages / DUAL_PAGES_ENABLEDは変更せず、PR未作成、Issue #47はAPIでもOpenを確認。

### 実DO分離

2026-11-12 13:28 UTCの読み取り診断でCloudflare APIが返した識別子。
完了処理でも両環境のID非共有・各class・自己bindingを再検証して成功した。

| binding | 本番namespace ID（読取のみ） | 開発namespace ID |
|---|---|---|
| ROOMS | `bb2855728c5b42beba5771655a131f8d` | `5d60a68fe93b40958b974e973ddb7eed` |
| RATE_LIMITER | `7aef4eef34c14bf594b0d8b2070a8f52` | `f1a5e3c6ba1e40dc8eb60578409b1371` |

本番settingsの診断時SHA256: `254420624fc69761b80aeb61e4becdd5f805f214c198f86934cbd33de0a01c43`。
開発settingsの診断時SHA256: `750d7549649787febbaa88e8b5eac688ee19b29c724be559ae6e991e8850934d`。
完了処理はこの開発SHA256との一致を要求し、既存コード/DOの再アップロード/migrationを実行しなかった。

### 実行と検証の対応

- `358f844185af4c17457df45271fab7a5aa4b2926`: CI入力正規化。
  [run 43222182844](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43222182844)は全体success。
  npm test、Worker型検査、両Pages/itch build、成果物seal、Chromium/WebKit環境分離、
  両エンジンの既存UI全体、local-online、matrix auditがすべて成功。公開jobはskip。
- `3d6b3a0cec462b292346b2b18dfec7af37c58332`: 許可後の空commit。
  [初回run 43226991277](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43226991277)のprepareはsuccess。
  Wrangler deployが失敗終了し、URLは未取得、後続オンライン検証はskip。
  エラー生出力は保存・表示していないため元の詳細原因は未確定。失敗を成功扱いしていない。
- `86b92ebb7c97ebfbc5044829c7341cc3afb1a5f8`: 読取専用診断と秘密を出さないエラーcode分類を追加。
  [診断run 43227573328](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43227573328)はsuccess。
  実APIで本番/開発settingsとも200、開発Workerと独立DOは作成済みと確認。
  初回作成を再実行せず、公開トリガーだけを完了する判断とした。
- `e0252da8a182eec9553921e6e0b29172e4700dad`: settings SHA一致を要求する公開トリガー完了経路。
  [完了run 43227915964](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43227915964)は全体success。
  prepareのnpm test・Worker型検査・dry-run成功。開発設定だけでtriggers deploy成功。
  Wrangler返却の実URL取得、実DO ID比較、本番settings前後一致、実health（200/期待JSON）が成功。
  同じ開発URLのオンライン5シナリオとRATE_LIMITERの429/正のretryAfterMsが成功。
- 追加した診断/完了経路の関連テスト11件、actionlint全workflow、git diff --check成功。
  アプリ/Worker本体は準備基準a18d210以降変更なし。
  診断・完了commitの既存フルCIはそれぞれ別runで進行するため、358f844の全CI成功と混同しない。

### 追加変更と残件

今回の追加変更は`.github/workflows/environments.yml`のCI入力正規化、
bootstrap workflow/script/testの診断・完了経路、読取専用`inspect-development-worker.mjs`、
運用・検証文書。初回作成の専用経路を通常の本番公開処理へ混ぜていない。

開発Workerの実作成・health・DO分離・オンライン検証は今回完了。
GitHub変数の登録作業、実環境間の同コード/token拒否E2E、Pages移行、iPhone実機検証は未実施。
Secret一覧APIは403で名前の確認不可だったが、Actions内で開発Environment Secretを利用した実処理は成功。
Issue #47全体の受入完了とは扱わず、Openを維持する。

開始HEAD `46b9f6be6681daa14c19996310d41d5c22ce0eba`、fetch後mainは引き続き
`cb457bb0dfe00455adf66d5f8c51284d0d00081f`。各push後のremote照合成功。
