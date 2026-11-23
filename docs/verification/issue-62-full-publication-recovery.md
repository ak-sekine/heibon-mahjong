# Issue #62 full 公開の Worker スキップと予約の復旧計画

## 障害と修正の検証

[障害 run 45276890552](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45276890552) の attempt 1 は本番 `full` として必須 CI と予約が成功した。再利用専用の `verify-production-source` は設計どおりスキップされた。これが `reserve` を介して Worker の上流にあり、Worker 条件の暗黙の `success()` により本番 Worker がスキップされた。オンライン検証、Pages、確定、独立 audit も実行されず、run 全体は success と表示された。

回帰テストでは旧条件で本番 full の成功経路が実行対象外になることを再現した。両 Worker の条件に `!cancelled()` と予約成功の明示判定を追加した。既存の ref、イベント、公開フラグ、Environment と Secret の制約を維持する。テストは full、reuse、Issue 開発、旧 develop ref の条件評価、非対象環境、予約失敗・スキップ・キャンセル、不正な入口、run キャンセルを確認する。develop ref の条件評価は Environment 側の公開許可を示すものではない。

予約成功後に Pages・台帳確定が成功しなければ、権限を持たない終了チェックが失敗する。本番は独立 audit の成功も必要とする。通常の非公開 CI と docs-only push からは公開 workflow が呼ばれない。

## 読み取り専用の照合結果

- 最新 main は `e67cc031419eb61f1f2bd27ff894be1f639d9acc`。pages-verified の先端は予約 `de7cb7594ce965bfaa9bf0bdf1b59ef2edfc5cb6` で、親は直前の確定 `5b17d70af61fd37d273836b95096d7b856b75dc6`。
- 予約の `pending` は対象 main SHA と run 45276890552・attempt 1 を指す。予約と親の確定済み `current` は一致する。`pending.previous` も親の `current` と一致し、親は `pending: null`。予約差分には `state.json`、本番ファイルと公開メタデータが含まれ、`site/dev/` の差分はない。
- 予約親の `site/` 全35ファイルを公開 URL のバイト列とハッシュで照合し、一致した。本番は `463a3ff019a50d9e5d23d8776ddf2640100a77b4`、開発は `99f6d146049133a1471bd62265089f5b65500563`。本番 Worker のヘルスは正常。
- 最新の本番 Worker deployment は 8000706896、Pages deployment は 8000740781。いずれも前回の成功 run 45188804189 に属する。予約後の GitHub deployment は0件で、進行中・待機中の公開 run も見つからなかった。Cloudflare 管理画面・API 経由での操作履歴と稼働 version ID はこの調査では未確認。

## 別途承認後の復旧手順

1. 台帳復元の明示承認を得て、作業中の公開・管理操作が重ならないよう関係者と調整する。最新の main と pages-verified、障害 run と attempt、予約 ID、pending、親の関係を再取得する。公開・待機 run、追加 deployment、先端の変更があれば停止する。
2. 親の保存サイトと実配信の全ファイル・台帳を再照合する。Cloudflare の本番・開発 Worker の現在の version と予約前の version および予約後の管理操作を、権限のある担当者が確認する。未確認や差異があれば台帳のみの復元を停止し、部分公開として調査する。
3. 予約コミットから隔離した作業ツリーを作成する。親の `state.json` と `site/` 全体を `git restore --source=<親SHA> --staged --worktree -- state.json site` で再現する。両パスが親と完全に一致し、ステージされた差分がこの2パス内に限られることを確認する。本番・開発の保存サイトと台帳情報をセットで復元する。
4. 予約を親とする新規の通常コミットを作り、対象 run と復元元をコミットメッセージに記録する。直前に手順1・2の前提を再確認し、pages-verified へ通常の fast-forward push を行う。拒否や競合があれば停止する。この構成で予約コミットと調査証跡、既存の開発版を Git 履歴に保持する。
5. リモート先端が復元コミットで、`pending: null`、`current` と保存サイトが親と一致し、配信バイト列と deployment が以前のままであることを読み取り専用で確認する。Worker や Pages の再デプロイはこの計画の対象外。照合に失敗した場合は追加操作を止めて報告する。

この調査では台帳復元・公開・main 統合を実施していない。[本番・開発運用](../operations/environments.md#障害と復旧ロールバック)の停止条件に従う。
