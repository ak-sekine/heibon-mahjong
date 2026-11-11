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
