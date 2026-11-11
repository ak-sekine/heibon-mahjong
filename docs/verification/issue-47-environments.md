# Issue #47 検証記録（2026-11-11）

## 自動検証

- 開始時HEAD / fetch後origin/main: `cb457bb0dfe00455adf66d5f8c51284d0d00081f`。ブランチwork、clean、behind/ahead 0/0。最新mainからdevelop作成。
- `npm test`: 88 test files成功（新規workflow契約テスト追加前）。PWA変更後の関連4ファイル再実行成功。
- `npm run typecheck:worker`: 成功。
- 本番build / 開発build / itch buildとZIP: 成功。ローカルでは検証専用`.validation.workers.dev`を指定。実WorkerのURLではない。
- 両ビルドのseal / SHA256 inventory再検証: 成功。HTMLの`./`リンクをindex.htmlへ解決する検査の不備を修正後に成功。
- 成果物合成テスト: mainのみ、developのみ、両順序、保持側の全ファイルhash不変、未準備devの省略、本番なしdev bootstrap拒否、古いSHA拒否、同SHA再実行拒否、破損候補拒否、保存snapshot破損拒否、pending中の再公開拒否を検証。
- Pages失敗/応答不明をpending状態として再現。実GitHub Pages障害注入・並行push・Worker失敗の外部E2Eは未実施。CI失敗時のジョブ依存、Worker branch/token分離、公開前pending保存を静的検証。
- SW runtime検証: 本番はdev fetchを処理しない、キャッシュ削除は自環境のみ、本番clients.claimなし。
- storageキー検証: 本番旧キー維持、開発書込/削除で本番値不変。
- ブラウザ検証はGitHub ActionsのChromium/WebKitで実施する。ローカルはAGENTS.mdの既知の起動制限に従い再実行しない。
- GitHub変数一覧APIは権限付き通信後HTTP403（Resource not accessible by integration）。設定状態は未確認。新経路は`workflow_dispatch`のpublish=trueも要求するため、pushだけでは外部公開しない。

## 実機・公開・外部設定

いずれも未確認。Cloudflare資格情報はこの実行環境にない。Worker名とDO設定は追加したが、開発Worker作成済みとは報告しない。
本番/開発URLの公開確認、実Worker間の状態分離、最終公開SHA、Pages build/deploy成功は未確認。

## 受入条件対応

| #47受入条件 | 状態 | 根拠・残件 |
|---|---|---|
| 検証済み本番/開発成果物と巻き戻り防止 | 一部実装 | hash inventory、合成・pending・freshness。実Pages移行未実施 |
| 両URLのリソース、PC/iPhone CPU対局 | 一部実装 | build/static検査、ブラウザCIを追加。公開URL/実機未確認 |
| PWAインストール・offline・更新の分離 | 一部実装 | SW/cache/storage、ブラウザCI追加。旧ユーザー移行とiPhone実機未確認 |
| 対応Worker、ルーム/認証/状態分離 | 一部実装 | 別config/DO/entry/token経路。別アカウント設定・実通信未確認 |
| 更新・並行・失敗・再実行の他環境保全 | 一部実装 | ローカル合成障害試験。実Actions/Pages障害・競合未確認 |
| 本番ゲート・可用性・SHA追跡 | 一部実装 | 旧ゲート維持、新経路に同等検証と台帳。移行未実施 |
| 運用/rollback/未確認項目文書 | 実装 | 開発設計、運用、当記録。実行結果を継続追記 |

IssueはOpenを維持。公開/実機を含む未完了受入条件にはチェックしない。

## develop初回CI

`8c260652ad65b33019a3f05d571863d78da7b56e` / [run 43109455700](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43109455700)：verify成功。新規Chromium分離テストでwaiting workerがnullのまま更新要求するテスト同期不備を検出。更新インストール・有効化のイベントを明示的にawaitする修正を追加する。実公開ジョブは未実行。

ローカル全89テストファイル成功（workflow契約テスト追加後）。開発HTMLにはホーム画面用DEV名を追加。JSのimport/new URL参照も静的検査対象に含め、両実ビルドのseal成功。これらの変更後の関連3テストファイルも成功。

初回CIの追加所見：既存itch smokeは`online-mock.invalid`を前提とするため、検証用itch buildを従来どおりmock URLに戻す。公開用ZIPは本番Worker検証後の独立buildに分ける。ローカル2Worker検証は開発側の起動待ちで失敗したため、同時起動のinspectorポートを分離し、起動失敗ログを出すようにする。SW更新fixtureのLast-ModifiedはHTTPサーバーの秒精度を考慮して変更する。

## 既存本番の公開記録（読取のみ）

2026-11-11にGitHub Deploymentsを照合。`heibon-production-worker`（7709534462）、`github-pages`（7709559454）、`heibon-production-pages`（7709565599）はいずれもSHA `d50e8a6a5a67e8767de824bb80d2e83751cf474d`でsuccess。本番Pages runは[43012562746](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43012562746)。本番Worker URLは既存検証記録の`https://heibon-mahjong-online.ak-sekine.workers.dev`。現行公開bytesへの直接アクセスは未確認。今回のdevelop pushではこれらを変更していない。

旧本番SWの広いclients.claimを模した追加更新fixtureから、開発controllerの再取得とoffline継続を確認するブラウザケースを追加する。実iPhoneでの移行確認の代わりにはしない。AGENTS.mdの通常作業先もdevelopへ変更し、将来の作業が旧main直push指示へ戻らないようにする。

## 分離テストの成功記録

[a02b31f / run 43110144307](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43110144307)でverify、Chromium/WebKitの環境分離smoke、local-onlineが成功。local-onlineは本番用/開発用の別ローカルDO storeを用い、相互のルーム404・token拒否を確認し、両方で既存の5シナリオ（2人対局とCPU引継ぎ再接続、切断再接続、ホスト引継ぎと1人+CPU3人、4人、3人+CPU1人）が成功した。公開済み本番Workerへは通信していない。

[63ff388 / run 43110685013](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43110685013)には旧root SWのclients.claimを模した回帰ケースを追加。最終結果は追記する。保存先に台帳未登録のdevファイルがある場合も停止する試験を追加し、ローカル成功。これにより未準備側に未検証ファイルが混入していても公開しない。

## 変更ファイル一覧

- 運用: `AGENTS.md`、`README.md`、`docs/SPEC.md`、`docs/ROADMAP.md`、`docs/development/issue-47-environments.md`、`docs/operations/environments.md`、本検証記録。
- build/PWA: `.gitignore`、`package.json`、`vite.config.ts`、`index.html`、`scripts/build-pwa.mjs`、`src/pwa/register.ts`。
- 保存分離: `src/environment.ts`、`src/model/rules.ts`、`src/online/diagnostics.ts`、`src/online/waiting-room.ts`。
- Worker: `wrangler.development.jsonc`、`worker/development.ts`、`worker/tsconfig.json`。
- 公開: `scripts/environments/artifacts.mjs`、`.github/scripts/deploy-isolated-worker.mjs`、`.github/workflows/environments.yml`、`.github/workflows/publish-environments.yml`、`.github/workflows/deploy.yml`。
- 検証: `tests/environment-artifacts.test.mjs`、`tests/environment-storage.test.ts`、`tests/environment-workflows.test.mjs`、`tests/online-environments.mjs`、`tests/browser-environments.py`、`tests/browser-pwa.py`、`tests/pwa.test.mjs`。
