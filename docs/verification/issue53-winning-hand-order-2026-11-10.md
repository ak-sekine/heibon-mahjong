# 和了後の手牌順 — Issue #53

## 開始時の確認

- 2026-11-10、Issue本文とコメントをREST APIで再取得。Open、コメント0件。元画像はIssueに添付されていない。
- `/workspace/heibon-mahjong`、ブランチ`work`、未コミット変更なし。fetch成功後のHEAD / origin/mainはともに`2f82ba7735326abdc3bbb7a10c629aee18486982`、behind/ahead=0/0、未pushコミットなし。remoteは`https://github.com/ak-sekine/heibon-mahjong.git`。
- 通常sandboxのfetch/APIはproxy socket EPERM。正規の許可付きfetchは成功。`gh issue view --comments`はclassic Projects GraphQLエラーのためREST APIへ切替。
- `AGENTS.md`、`docs/SPEC.md`、描画・ロン・ツモ処理、既存table/round-end/layoutテストと配布設定を確認。

## 確認できた原因と再現範囲

| 表示 | 修正前の処理・問題 | 修正 |
| --- | --- | --- |
| 卓下部の自分 | `hand`のみソート。ロン牌は含まれず13枚。ツモは`drawnTile`を末尾へ独立追加 | 和了時だけ和了牌を含めて全体ソート |
| 結果画面 | ソート済み`hand`の末尾へ和了牌を追加。途中の牌種で和了すると対子・順序が分断 | 全体ソート後にDOM作成 |
| CPU公開手牌 | 結果画面と同じ末尾追加。和了牌に左margin | 全体ソート、marginを枠線へ変更 |

ロンは`winResult.winningTile`（通常は放銃者の河にある物理牌、槍槓にも対応）、ツモは勝者の`drawnTile`を参照する。いずれも`player.hand`には含まれない。ゲーム処理はこの保持方法を変更しない。

七対子の固定壁（`11z 66s 11m 22p 99m 44s 5m`、赤5萬ロン）と通常ロン・途中順位の牌でのツモで確認。旧ソースに追加回帰テストを適用すると3ケースとも失敗し、修正後は成功。七対子は14枚・7対子となり、赤5萬も5萬に隣接する。

**元報告の全現象を特定したとは扱わない。** 現行ソースの自分の13枚は和了後もソートされるため、「萬子・索子・字牌が全体的に入り交じる」という報告を末尾追加だけでは説明できない。元画像・当時のGameState・公開itch版のSHAがなく、同一現象の再現は未確定。修正は確認できた和了手の欠落・順序違反に限定する。

`replaceChildren`はソート済み配列順でDOMを作る。対象CSSはflex/gridの通常順で、牌種に基づく`order`や逆順指定はない。SVGも牌ごとに生成し共有ID参照なし。新しいブラウザ検証ではDOMのラベル列と実際の座標順を両方比較する。ブラウザ固有原因は確認していない。

## 変更と非干渉

- `src/rendering/table.ts`: 自分の和了時表示、CPU公開手牌、結果手牌のソート。`tileOrder`と既存ID順を維持。表示用コピーのみ使用。
- `src/style.css`: 公開和了牌の間隔を枠線へ変更し、同種牌を分断しない。結果画面の既存`winning-draw`印は維持。
- `tests/table.test.ts`: 旧末尾追加前提を更新、七対子ロン・通常ロン・ツモのDOM、枚数/ID、赤牌、無操作、state全体の不変性を追加。
- `tests/browser-round-end-ui.py`: 既存Chromium/WebKit両枠に七対子ロンを追加。各勝者のDOMと表示座標、結果ダイアログ、state不変を検証。既存の副露/カン、河、CPU3席、結果開閉、次局・対局終了試験を維持。
- 対局中のソート、独立ツモ、選択・打牌・リーチ制限、非公開他家は既存経路。ゲームロジック、和了識別、物理ID、点数計算、同期、次局処理の変更なし。
- オンラインは別の公開view描画を使用し、結果は既に`revealedHand`全体をソートする。今回オンライン処理の変更なし。再接続は既存CI回帰で確認する。

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 成功、86テストファイル |
| `node tests/table.test.ts` | 成功、55ケース |
| 修正前ソースへ追加テスト適用 | 新規3ケース失敗を確認、修正ソースへ復元済み |
| `npm run build` | 成功 |
| `VITE_ONLINE_API_URL=https://heibon-mahjong-online.ak-sekine.workers.dev npm run build:itch` | 成功、ZIP直下index.html、3ファイル |
| Python構文 / `git diff --check` | 成功 |
| `npm run test:browser` | ローカル全体実行を省略。AGENTS.mdの既知Chromium制限・sandbox無効化禁止に従い既存Actionsの同じmanifestで検証 |
| Playwright WebKit単独 | 試行したが実行ファイルなし。公式導入を試みたがcdn.playwright.dev等が403 Domain forbidden。CIで検証 |

## ビルド・配布

Pagesとitchは同じ`table.ts`を実行する。mode/base、エントリ、PWA、Worker URL注入方式が異なるが、手牌ソートのmode分岐はない。今回の確認済み順序違反は両方に共通。公開itch版のコード・SHA比較は未確認で、古い配布版との違いを原因から除外できない。

ローカルZIP: `artifacts/itch/heibon-mahjong.zip`（git管理外）。コミット後に再ビルドしてSHAを一致させる。Deploy workflowもPagesと同じ公開Worker URLでitch ZIPを作成しartifactへ保存する。**itch.ioへの実際の再アップロードは行っていない。修正ZIPの手動再アップロードが必要で、公開済みitch版の修正済み宣言はしない。**

## Actions・受入条件・実機

対象コミットのActionsとPages deploy結果はpush後に追記する。ローカル成功をActions成功と混同しない。

| Issue受入条件 | 判定 |
| --- | --- |
| 七対子ロンの整列・対子隣接 | ローカルDOMテスト成功、ブラウザはCI結果待ち |
| その他ロン・ツモの一定順 | ローカルDOMテスト成功、ブラウザはCI結果待ち |
| 通常手牌・ツモ・選択 | 既存ローカルテスト成功、CI結果待ち |
| 副露・河・CPU・結果・次局・得点 | 既存ローカルテスト成功、CI結果待ち |
| 描画自動テスト | 追加済み。Chromium/WebKitはCI結果待ち |
| itch/Pages差異・反映経路 | ソース/生成経路確認済み、公開itchビルド比較は未確認 |
| iPhone Safari | **未確認** |

Issue #53はOpenを維持しClose不可。修正ZIP再アップロード後、iPhone Safariで七対子ロン、通常ロン/ツモ、赤牌、卓下部と局の結果の両方、選択・打牌・リーチ・副露/カン・河・次局を確認する必要がある。機種/iOS、ビルドIDと結果を記録する。自動WebKit成功を実機成功とは扱わない。元の全体的な混在が残る場合は画像と診断ビルドID・局面を再取得して調査する。
