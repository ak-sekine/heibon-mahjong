# 和了後の手牌順 — Issue #53

最新最終判定（2026-11-10）: ユーザー本人のPages版（iPhone Safari）・itch.io版の正常動作報告を記録し、既存自動検証と照合して受入条件7件をすべて達成、completedでClose可能と判定。文書push後のActions確認・完了コメントに続けてCloseする。過去の「実機未確認」「再アップロード未実施」「Open維持」は当時の記録であり、現在の判定は末尾の最終確認を参照。公開itch ZIPの厳密なSHA一致は未確認。

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

固定七対子の和了直後は`phase=won`、`hand=[東,東,6索,6索,1萬,1萬,2筒,2筒,9萬,9萬,4索,4索,5萬]`、`drawnTile=null`。和了牌は`man-5-0`（赤5萬）、河に1枚保持、`shape=seven-pairs`、25符。表示は`1萬,1萬,赤5萬,5萬,9萬,9萬,2筒,2筒,4索,4索,6索,6索,東,東`となる。

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

Pagesとitchは同じ`table.ts`を実行する。mode/base、エントリ、PWA、Worker URL注入方式が異なるが、手牌ソートのmode分岐はない。今回の確認済み順序違反は両方に共通。`curl -I https://ak-sekine.itch.io/heibon-mahjong`は許可付き実行でもCONNECT 403 Forbiddenとなり、公開itch版のコード・SHA比較は未確認で、古い配布版との違いを原因から除外できない。

ローカルZIP: `artifacts/itch/heibon-mahjong.zip`（git管理外）。修正コミット`4297b5bcb0a36c42267f1d9e0fa94acf35d501f6`で再ビルドし、JS内のSHA一致とZIP整合性を確認。91,915 bytes、SHA256 `9b5ea39b7423b340a315d49f2aa0c4ba75428348f943017d403b1975f573df59`。Deploy workflowもPagesと同じ公開Worker URLでitch ZIPを作成しartifactへ保存する。**itch.ioへの実際の再アップロードは行っていない。修正ZIPの手動再アップロードが必要で、公開済みitch版の修正済み宣言はしない。**

## 初回検証のActions・受入条件・実機

検証記録コミット`a4c86ce4cc946000f9bae8d1c36a376d04cd8f1a`のpushで[run 42804037115](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42804037115)も自動開始された（実装は同一）。`verify`/文書検査はsuccess、WebKitは同じ最終成功項目app-idleの後でfailure。記録時点でChromiumは実行中。元runの失敗を上書きせず、再検証も描画検証完了・公開成功とは扱わない。ログ配信先の許可追加をユーザーへ依頼済み、回答待ち。これ以上の再実行は行わない。

修正SHA `4297b5bcb0a36c42267f1d9e0fa94acf35d501f6`を`HEAD:main`へpush成功。`git ls-remote`で同SHAを照合。対象[Actions run 42802702695](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42802702695)は**failure**。

- `docs-check`、`detect-changes`、`verify`はsuccess。両エンジンのstandalone itch事前smokeもsuccess。
- Chromium / WebKitはともに`Run Vite and browser regressions`でfailure。API注釈ではcreate-dialog、online-dialog、PWA、keyboard-help、app-idleまで成功を確認。次のmanifest項目はoffline-rulesだが、原因はログ未取得のため断定しない。今回追加したround-end試験は未到達で、DOM座標のブラウザ検証は未実施。
- `browser-ui-matrix-audit`はfailure。`release-freshness`、`deploy-worker`、`production-test`、`pages-build`、`pages-deploy`はskip。**この修正のPages公開は行われていない。**
- 正しいWebKit job ID `129784598609` のログとartifact `13756838900`を許可付きで取得しようとしたが、配信先`productionresultssa18.blob.core.windows.net`へのアクセスが403 Forbidden。ログ内容を取得できず、失敗原因は未確定。古いrunやローカル成功で代替しない。
- ネットワーク設定で同ホストを許可した後、元runのログとtiming CSVを取得して原因を調査する。原因確認前の無根拠な再実行・コード変更はしない。追加コード修正・再公開は保留。
- ローカル作成ZIPは利用可能だが、CIの本番Worker URLによる新しいリリースZIP生成と公開はゲートで止まっている。実機配布の前にブラウザ失敗を解消する。

| Issue受入条件 | 判定 |
| --- | --- |
| 七対子ロンの整列・対子隣接 | ローカルDOMテスト成功、ブラウザはCI停止により未到達 |
| その他ロン・ツモの一定順 | ローカルDOMテスト成功、ブラウザはCI停止により未到達 |
| 通常手牌・ツモ・選択 | 既存ローカルテスト成功、CI失敗、ブラウザ回帰未完了 |
| 副露・河・CPU・結果・次局・得点 | 既存ローカルテスト成功、CI失敗、ブラウザ回帰未完了 |
| 描画自動テスト | 追加済み。Chromium/WebKitはCI失敗、ブラウザ回帰未完了 |
| itch/Pages差異・反映経路 | ソース/生成経路確認済み、公開itchビルド比較は未確認 |
| iPhone Safari | **未確認** |

Issue #53はOpenを維持しClose不可。まずCI失敗の診断と解消、両エンジンの追加描画試験成功、Pages公開が必要。修正ZIP再アップロード後、iPhone Safariで七対子ロン、通常ロン/ツモ、赤牌、卓下部と局の結果の両方、選択・打牌・リーチ・副露/カン・河・次局を確認する必要がある。機種/iOS、ビルドIDと結果を記録する。自動WebKit成功を実機成功とは扱わない。元の全体的な混在が残る場合は画像と診断ビルドID・局面を再取得して調査する。

## 追加調査: 回転席の座標判定（2026-11-10）

### 開始状態と前回報告の訂正

開始HEAD / fetch後origin/mainは`c17b514daab957dbc1d7f209707e52be5ffafe41`、`work`、作業ツリーはクリーン、behind/ahead=0/0、未pushなし。Issue本文・コメントを再取得し、Open・コメント0件を確認。

ユーザーが取得した4ジョブのログでは、すべて`tests/browser-round-end-ui.py:440`、320px / `yakuman-ron` / winnerId=1で失敗。DOMのexpected/actualは一致、winningCount=1、monotonic=falseだった。**前回の「和了描画テストに未到達」という推定は誤りで、訂正する。** API注釈の取得結果だけから実行位置を断定すべきではなかった。上の初回記録は当時の判断履歴として残し、最新判定はこの節とする。

### 原因と修正する検証

`.table .seat-right`は`transform: ... rotate(270deg)`、左席は90deg。`.table .seat .concealed-hand`は`flex-direction:row`であり、flexの局所座標と`getBoundingClientRect()`のviewport座標は異なる。旧assertはrowなら常に`current.left >= previous.right`と比較していた。右席ではDOM順に画面の下から上へ進むため、このX比較は表示順の条件にならない。

今回変更するアプリ本体ソース・CSSは**0件**。DOM順序・和了牌1枚のassertを維持し、画面上の位置検証を以下へ変更する。

- computed styleのflex方向から局所進行ベクトルを作り、手牌から祖先までのtransform / 個別scale / rotateを適用して画面上の進行方向を求める。
- 実測DOM矩形をその方向へ射影し、正の寸法、DOM順の前進、隣接牌の非重複（許容誤差0.1px）、垂直方向の中心揃え（0.2px）をすべて検証。現行の90度単位の回転であることも検証し、未対応の傾きを黙って通さない。
- 320×568の`yakuman-ron`では旧X判定がfalseとなることを実測で確認する。同じ実DOMへ一時的に重なりとCSS order変更を与え、新しい検証が両方を拒否することを確認後、元のstyleへ戻す。assert削除・skipなし。
- raw DOM矩形、computed transform、進行方向、牌間隔をJSON artifactへ保存し、代表局面をActions noticeにも出力する。結果画面のDOM順・横方向の非重複、既存全シナリオは維持する。

### 検証・公開（追加修正）

ローカルPython構文検査、browser manifest選択9テスト、`npm test`全86ファイル、`npm run build`、`build:itch`は成功。ローカルブラウザは既知Chromium制限・WebKit配布元403が継続するため既存Actionsで実行する。

iPhone Safari実機は引き続き未確認。Issue #53はOpenのまま維持する。itch.ioへの再アップロードは未実施。


### 全体検証とPages公開の成功

テスト修正SHA `063926f18e113d5ed2b6568c7abd410aa239402a`をmainへpushし、リモートSHAを照合。[run 42825786468](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42825786468)の`verify`、Chromium全45本、WebKit全35本、matrix audit、release freshness、Worker deploy、production-test、Pages build/deployがすべてsuccess。今回の追加修正ではアプリ本体を変更しておらず、既存の和了表示修正を含むこのSHAがPagesへ公開された。

代表局面では新しい座標assertと負例のassertも成功した。ただし同じsuite step内の大量のnoticeにより、代表測定のnoticeはActions APIの注釈に保持されなかった（per-stepのnotice上限）。実測JSONは既存artifactの`round-end-ui.json`に保存している。配信先のネットワーク制限を回避せずに実測値を確認できるよう、`.github/workflows/browser-ui.yml`へ独立した`Report winning hand geometry` stepを追加する。保存済みJSONを読むだけで、テスト判定・アプリ・配布設定は変更しない。新しいCI変更を含む全体検証と実測値は、次の実行完了後に追記する。

同SHAのローカルitch ZIPも再生成成功。`artifacts/itch/heibon-mahjong.zip`、SHA256 `a1fad53e5a2c9fb19f0950bf1aced7d26029d966790f6468369ac79ca99b0957`。CIも同SHAの本番Worker URLを注入したZIPを生成・artifact保存済み。実際のitch.io再アップロードは行っていない。


### 実DOM矩形とcomputed styleによる確定原因

実測報告stepを含むSHA `55e10f7e3527f863709bd3e8080fd4f049e292cf`の[run 42828803806](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42828803806)はsuccess。`verify`、Chromium全45本、WebKit全35本、独立診断step、matrix auditが成功。アプリ変更がなく既にPages公開済みなので、このvalidation-only実行のWorker/Pages公開skipは正常であり、初回失敗による公開停止とは異なる。

320×568 / `yakuman-ron` / winnerId=1の実測値（単位CSS px）:

| エンジン | flex方向 | 先頭2枚のleft | 先頭→次のtop | 矩形のwidth×height | 全13箇所の牌間隔 | 画面進行方向 |
| --- | --- | --- | --- | --- | --- | --- |
| chromium | row | 287.593262 / 287.593262 | 328.195740 → 314.055115 | 18.406250 × 13.140625 | 1〜1 | (0, -1)、下→上 |
| webkit | row | 287.702637 / 287.702637 | 328.195740 → 314.055115 | 18.406250 × 13.140625 | 1〜1 | (0, -1)、下→上 |

computed transformはChromiumで右席が`matrix(0, -1, 1, 0, -6.2036, -12.1094)`、WebKitは`matrix(0, -1, 1, 0, -6.203598, -12.109375)`。手牌コンテナは両方`matrix(1, 0, 0, 1, 13.148, 0)`、個別rotate/scaleはnone。親の270度回転により、rowの局所X方向は画面の負Y方向となる。

旧条件はChromiumで`287.593262 >= 305.999512`、WebKitで`287.702637 >= 306.108887`を要求しfalseとなる。実際はY方向に1pxの隙間を持って進むため、これは描画上の重なり・順序違反ではなく、**親の回転を無視してviewportのXで比較したテスト側の誤判定**と確定した。

両ブラウザともDOMラベル列はexpectedと一致、和了牌の印は1個、新geometry.valid=true、旧legacyMonotonic=false。重なりを加えた負例・CSS orderを変更した負例はどちらも拒否（overlapRejected=true、reorderRejected=true）。実測JSON全体は各browser artifactの`round-end-ui.json`、代表値は両ジョブの`Winning hand geometry`注釈から取得して照合した。これらはPlaywrightの自動検証であり、iPhone Safari実機の結果ではない。

### 公開・変更範囲・最終判定

- 今回の追加調査の変更は`tests/browser-round-end-ui.py`、`.github/workflows/browser-ui.yml`、この検証記録、`docs/verification/README.md`の4ファイル。`src/`の追加変更なし。テスト削除・skipなし。
- Pages deployment ID `7683938802`の`sha=063926f18e113d5ed2b6568c7abd410aa239402a`、status=success、[公開URL](https://ak-sekine.github.io/heibon-mahjong/)をGitHub deployment APIでも照合。実装・描画テスト修正を含む公開runは42825786468。
- 同SHAの[リリースitch ZIP artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42825786468/artifacts/13769818206)を生成済み。ローカルZIPのSHA256は上記のとおり。itch.ioへの手動再アップロードは未実施・必要。
- 原因が確定したのは今回のCI座標判定の失敗。元のiPhone Safari画像で報告された全体的な牌種混在まで同一原因と断定しない。

| Issue #53受入条件 | 最新判定 |
| --- | --- |
| 七対子ロンの整列・対子隣接 | 自動検証成功（DOM順・表示位置・14枚/7対子） |
| その他ロン・ツモの一定順 | 自動検証成功、CPU3席・赤牌を含む |
| 通常手牌・ツモ独立・選択操作 | 既存単体・ブラウザ全回帰成功 |
| 副露・河・CPU・結果・次局・点数 | 単体・統合・両ブラウザ全体成功。今回アプリ追加変更なし |
| 描画自動テスト | 両エンジン全80本成功、実測値と負例を確認 |
| itch/Pages差異・反映経路 | ビルド・ZIP生成・Pages公開を確認。公開itchの旧ビルド比較は未確認、再アップロード未実施 |
| iPhone Safari実機 | 未確認 |

Issue #53はOpen維持、Close不可。残作業は修正ZIPのitch.io再アップロード、iPhone Safariの卓下部と結果画面の七対子ロン・通常ロン/ツモ・赤牌・操作/副露/河/次局の確認。実機で全体的な混在が残る場合は画像・ビルドID・局面を再取得する。


## 最終確認・Close判断（2026-11-10）

### 今回の作業と照合

開始ブランチは`work`、作業ツリーはクリーン、開始HEADは`c17b514daab957dbc1d7f209707e52be5ffafe41`。通常sandboxのfetchはproxy接続で失敗し、正規の許可付き`git fetch origin`は成功。最新origin/mainは`0f9e28a3cdfcf3efdcc368c5fb225f5c783d9900`、behind/ahead=3/0、未pushコミットなし。fast-forwardで同SHAへ追従した。今回の変更は文書のみで、ソース・テスト・仕様は変更しない。

Issue本文を再取得し、受入条件は下表の7件と確認。GitHub APIで指定2 runのhead SHA・completed / successとジョブ結果を再確認した。

- [run 42825786468](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42825786468): `063926f18e113d5ed2b6568c7abd410aa239402a`。verify、Chromium、WebKit、matrix audit、production-test、Pages build/deploy成功。Pagesビルドと同じ公開Worker URLによるitch ZIP生成・artifact保存のstepも成功。
- [run 42828803806](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42828803806): `55e10f7e3527f863709bd3e8080fd4f049e292cf`。verify、両ブラウザ、実測診断step、matrix audit成功。公開ジョブskipはvalidation-onlyのため正常。
- 既存記録のローカル86テストファイル成功、Chromium45本・WebKit35本の全体検証2回成功と整合する。今回ローカルでゲーム全体のテスト・ビルドは再実行していない。
- 和了牌を含む表示用コピーの全体ソート（卓下部・結果・CPU公開手牌）と、回転後の進行方向を考慮する検証を確認。DOM順・前進・非重複・中心揃え・和了牌枚数、重なり/CSS順序変更の負例を維持。GameState・物理牌ID・和了判定・点数計算・通常時の独立ツモ表示を変更していない。

### ユーザー本人による実機報告

出典は今回のChatGPT会話でユーザー本人が提示した動作確認結果。以下はCodexによる実機操作結果ではない。2026-11-10は記録日であり、実際の確認時刻を表さない。

| 配布先・報告環境 | 確認項目 | 結果 |
| --- | --- | --- |
| GitHub Pages版・iPhone Safari | 七対子のロン和了 | OK |
| 同上 | 卓下部の手牌整列 | OK |
| 同上 | 7組の対子の隣接表示 | OK |
| 同上 | 「局の結果」の手牌整列 | OK |
| 同上 | 通常形のロン和了 | OK |
| 同上 | 通常形のツモ和了 | OK |
| 同上 | 「次の局へ」で正常に対局開始 | OK |
| itch.io版 | 七対子のロン和了 | OK |
| 同上 | 和了後の手牌整列 | OK |
| 同上 | 「局の結果」の手牌整列 | OK |
| 同上 | 通常形のロン・ツモ | OK |
| 同上 | 次局への正常な移行 | OK |
| 同上 | 全般的なゲーム動作 | OK |

Pagesは7項目OK、itch.ioは6項目OK、報告されたNGはない。itch.io版は修正済みZIPの案内後に正常動作が報告された。以前の再アップロード未実施という記録から進展した公開先の動作確認として扱うが、アップロード操作そのものをCodexが確認したとはしない。

端末機種、iOSバージョン、確認時刻、実機で表示されたビルドSHAは未報告。itch.io版の端末・OS・ブラウザの詳細も今回の報告から補完しない。公開itch ZIPの正確なビルドSHA・ZIPハッシュ・アップロード日時・ローカル/CI ZIPとの厳密な一致は未確認。Pagesの確認済み公開SHAは`063926f18e113d5ed2b6568c7abd410aa239402a`だが、実機でそのSHAを読み取ったという報告はない。

赤牌、副露、河、CPU公開手牌、点数計算、オンライン、通常時の独立ツモ表示・牌選択の個別項目は、今回の本人実機確認済みとして補完しない。これらの回帰判定は既存の単体・統合・ブラウザ自動検証を根拠とする。

### 受入条件の最終判定

| # | Issue本文の受入条件 | 最終判定・根拠 |
| --- | --- | --- |
| 1 | 七対子ロン後の公開手牌の整列・対子隣接 | 達成。DOM/座標・14枚/7対子の自動検証、Pages実機の7対子隣接と両配布先の整列OK |
| 2 | 七対子以外のロン・ツモ後も一定順 | 達成。自動検証と両配布先の本人報告OK |
| 3 | 通常手牌・ツモ表示・牌選択を維持 | 達成。既存単体・ブラウザ回帰成功。本人による個別操作確認とは区別 |
| 4 | 副露・河・CPU公開・結果・次局・点数に回帰なし | 達成。既存単体・統合・両ブラウザ全回帰成功。結果表示と次局は本人報告でもOK、その他は自動検証根拠 |
| 5 | 和了後の描画自動テスト（Chromium/WebKit） | 達成。45本/35本を2回成功。実測・負例も成功 |
| 6 | itch ZIPとPagesの差異・修正反映経路の記録 | 達成。共通描画ソース、mode/base・エントリ・PWA・Worker URL注入の差異、両ビルド・ZIP生成経路とPages公開を記録。itch公開先の正常動作は本人報告。公開ZIPそのものの厳密なSHA比較は未確認 |
| 7 | 修正後のiPhone Safari確認結果 | 達成。Pages版の本人実機報告を上表に記録。WebKit自動結果と区別 |

受入条件はすべて達成し、Issue #53をcompletedでClose可能と判断する。公開ZIPの厳密なSHA一致や未報告の端末詳細は未確認事項として残すが、上記受入条件の達成を妨げない。元スクリーンショットの牌種全体の混在について根本原因が完全に特定されたとは断定しない。確認できた表示上の問題、その修正、自動検証と本人による正常動作が完了判断の根拠である。

過去の失敗・公開停止・実機未確認・再アップロード未実施の記述は履歴として保存する。今回の文書整合性・相対リンク・`git diff --check`を確認し、mainへ直接push後に対象コミットのActionsを確認する。その後、Issue本文の7チェックを完了に更新し、完了コメント投稿、closed / completedへの変更、状態再取得を行う。コミットSHA・対象Actions・完了コメント・Close後の最終状態はIssueの完了コメントで追跡する。
