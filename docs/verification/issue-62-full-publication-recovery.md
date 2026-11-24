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

## 2026-11-24 の台帳復元と本番公開結果

障害 run 45276890552 の予約は、今回限りの承認に従い [bd2077c](https://github.com/ak-sekine/heibon-mahjong/commit/bd2077cca4b255c7cbe80c9d009af207227f65db) で復元した。その後の [reuse run 45381502132](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45381502132) は Worker と本番オンライン検証に成功し、Pages deployment 作成後に失敗した。台帳確定と独立 audit はスキップされ、終了チェックが run を失敗にした。エラーの根本原因は未特定。

Pages が旧版を配信し、予約前の保存サイト全35ファイルと一致すること、失敗 deployment が失敗のままであること、Worker コードと Wrangler 設定に差分がないことを確認した。別途承認を得て、予約を親に残した [78a1caa](https://github.com/ak-sekine/heibon-mahjong/commit/78a1caa00d700c0b861b2e11da910e1a7a9f92dc) で state.json と site/ を予約前のツリーへ復元した。Abort では Worker を切り戻していない。Cloudflare の管理履歴・稼働 version ID と開発 Worker の公開ヘルスは独立確認していない。

本番公開元は `422ca54a1ccf1df3531017e4e0b3ec5e41d7ec4c`。後続の文書のみの main 更新とは区別する。[main push CI 45294395931](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45294395931) の attempt 1 で必須品質ゲートと最終 audit が成功し、Pages artifact 14874923811 と audit artifact 14875319681 を生成した。[reuse 再試行 45399996598](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598) の attempt 1 は同じ Pages artifact と ZIP digest を照合し、全品質ゲートの重複実行なしで Worker、オンライン検証、Pages、台帳確定、[独立 audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45399996598/job/138468007873) が成功した。Worker と Pages の成功 deployment は 8028734815 と 8028772302。[確定台帳 ce7703d](https://github.com/ak-sekine/heibon-mahjong/blob/ce7703dc428ff0eba54422eccb6440a811cdf9a9/state.json) は pending が null で、公開の実配信メタデータと一致した。開発版の確定記録と site/dev/ は復旧時のまま。修正後の full は回帰テストで条件を確認し、本番では再実行していない。

### 実測

ジョブ数は skipped を除外し、runner 時間はジョブの開始から完了までの合計。壁時計は Actions API の run 開始から完了まで。

| 実行 | ジョブ数 | 壁時計 | runner 合計 |
|---|---:|---:|---:|
| [変更前 push 44914960575](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44914960575) | 9 | 31分15秒 | 75分55秒 |
| [変更前の成功公開 44917709085](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44917709085) | 14 | 33分07秒 | 76分56秒 |
| 今回の main push | 11 | 11分17秒 | 37分47秒 |
| 今回の成功した reuse 再試行 | 9 | 4分14秒 | 3分30秒 |
| 今回の失敗した reuse 初回 | 9 | 3分35秒 | 2分47秒 |

push と成功公開の組では run 数はともに2、全品質ゲートは2回から1回、ジョブ数は23から20、壁時計合計は64分22秒から15分31秒、runner 合計は152分51秒から41分17秒。今回は失敗した初回を含めると3 run・29ジョブ、壁時計合計19分06秒、runner 合計44分04秒。独立 audit は21秒。push run 作成から Pages 成功まで、変更前は1時間04分38秒、今回は復旧待ちと再試行を含め13時間03分41秒。対象 SHA、監査範囲と経過条件が異なるため、差のすべてを再利用方式の効果とはみなさない。過去の reuse 45188804189 は独立 audit をスキップし、full 45276890552 は予約で止まった。Actions の課金使用量は未確認。

### 受入条件の根拠

1. 同一 SHA の main push と成功した reuse で、全品質ゲートを一度だけ実行し、検証元と成果物の来歴を台帳で追跡できた。
2. main CI で既存の必須検証と Chromium／WebKit 各2グループ、最終 audit が成功した。
3. [再利用テスト](../../tests/reuse-production-ci.test.mjs)、[台帳競合テスト](../../tests/environment-git-store.test.mjs)、[条件テスト](../../tests/environment-workflows.test.mjs) で異常時の拒否を確認した。失敗した reuse は実際に全体 failure になった。
4. 最新 main、予約、Worker → オンライン検証 → Pages → 台帳確定 → 独立 audit を成功 run で確認した。Environment と権限制限を維持した。
5. docs-only の[成功実績](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45275801281)、[手動の非公開全検証](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44965425797)、[開発公開](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955)、[#58 の限定診断記録](issue58-browser-ui-sharding.md) と、現行の条件回帰テスト・main CI の並列4グループを照合した。開発公開は #64 以降の Issue ブランチ経路を対象とする。旧 develop の公開権限停止は既定の運用である。
6. 限定2件、関連51件、[候補 CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45281204111)、main CI、失敗・成功の実公開で確認した。full の修正後ライブ公開は未実施。
7. 上記の実測に、再試行コストと比較上の制約を記録した。
