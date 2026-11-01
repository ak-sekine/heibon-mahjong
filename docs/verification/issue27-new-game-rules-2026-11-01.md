# Issue #27 — 新規対局画面へのルール設定統合

実施日：2026-11-01。Issue：[#27](https://github.com/ak-sekine/heibon-mahjong/issues/27)。開始時の作業ブランチは`work`、開始HEADは`78df436a572939a8462a7856b1c6b930dc700fdd`でした。fetch後の`origin/main` / `c9eeb62c861ee2bfc007586795d7822f0b70ec40`に対して3 commit behind／0 aheadで、独自コミットはありませんでした。実装SHA `5a643e37132193a72c488a193273d458eefbc339`に対し、Browser UIの期待値・検査方法を修正した`f2685db0c8c4e0bdcef1ff6933a19a512220b8ed`、`91e5e420e2055dbbf33157be0d93e4ea2513cf2f`を追加しました。Deploy gate、Worker、Pages公開まで成功しています。ユーザー本人による実機確認待ちのため、IssueはOpenのままにします。

## 変更内容

- オフラインの新規対局ダイアログに対局形式、固定ルール一覧、「対局開始」「キャンセル」を統合しました。独立したルール設定ダイアログと、その画面への遷移ボタンは撤去しました。
- オンラインのルーム作成ダイアログに同じルール編集部品を組み込み、「ルーム作成」「キャンセル」を表示します。参加中・作成要求中は作成画面のルール欄を無効にします。待機画面のルール確認は従来どおり読み取り専用です。
- 現在選択可能な項目は**東風戦／半荘戦**だけです。実装済みだが固定の項目は変更不可として明記し、#16〜#18の切替実装や#19の未実装ルールは追加していません。
- ルール項目・対局形式の入力・固定ルール表示は`RuleEditor`で共通化しました。画面全体のレイアウトは既存ダイアログを使っています。
- 作成ダイアログの縦スクロール、スクロール境界の抑制、セーフエリアを含む最大高さ、下部の操作ボタン、折り返し、閉じた後のメニューボタンへのフォーカス復帰に対応します。画面の色・ボタン役割クラスは既存仕様を維持します。

## ルール一覧

| 項目 | 新規対局・ルーム作成での扱い |
| --- | --- |
| 対局形式 | 編集可能：東風戦／半荘戦。初期値は東風戦 |
| 赤ドラ | 固定：あり（各色の五に1枚） |
| 喰いタン | 固定：あり |
| 和了条件 | 固定：役が必要（ドラのみでは和了不可） |
| 後付け | 固定：完成した手牌に役があれば和了可 |
| リーチ・一発 | 固定：あり（ダブル立直を含む） |
| 裏ドラ | 固定：リーチ和了時にあり |
| カンドラ | 固定：カン成立ごとに追加 |
| 通常流局 | 固定：テンパイ・ノーテンを精算 |
| 途中流局 | 固定：九種九牌・四風連打・四家立直・四開槓。親維持で本場を加算 |
| 連荘 | 固定：親和了・親テンパイ流局で継続 |
| 対局終了 | 対局形式から決定。東4局／南4局後に親が連荘しないとき |

人和、パオ、ダブル役満、三家和は設定可能な項目に見せかけず、今回もゲームロジックを変更していません。

## 保存・復元・同期

- オフライン・オンラインとも既存の`heibon-mahjong-last-rules` localStorage（保存形式version 1）を使います。両者が前回設定を共有する既存仕様を維持しました。
- ダイアログを開いたときに保存済み設定を読み込みます。編集後にキャンセル／Escape／閉じるを行うと編集値を破棄し、保存値を再表示します。開いただけ、編集しただけ、キャンセルしただけでは保存しません。
- オフラインは`GameController.newGame()`が開始を受理した後に`RulePreferences.acceptedStart()`で保存します。進行中の対局のルールは従来どおり`MatchState.rules`の開始時スナップショットです。
- オンラインは作成画面の選択値をWorkerへ送り、成功応答の`rules`（旧応答時は既存format fallback）を確定値として保存します。参加処理は前回値を更新しません。待機・対局・次局・再接続時のWorkerルームルールを正本とする既存動作は変更していません。

## 関連Issueと既存調査

- #6で実装された共通ルールモデル、前回値保存、Worker確定、読み取り専用表示を利用しています。#6の対象が対局形式だけであることを現行`src/model/rules.ts`・`docs/SPEC.md`・保存／Worker処理で再確認しました。
- #16（赤ドラ・裏ドラ・一発・カンドラ）、#17（喰いタン・後付け）、#18（連荘・流局・終了条件）は独立したゲームロジック変更Issueです。該当項目は現行値を表示するだけで切替機能を先行実装していません。
- #19は人和・パオ・ダブル役満・三家和の仕様調査Issueです。未実装項目を設定欄へ追加していません。
- 2026-10-31のOpen Issue調査コメントと`docs/verification/open-issue-investigation-2026-10-31.md`は歴史的調査結果として保持し、現行コードを改めて確認しました。

## 変更ファイル

- `index.html`
- `src/main.ts`
- `src/ui/new-game-dialog.ts`
- `src/ui/rule-settings.ts`
- `src/online/waiting-room.ts`
- `src/style.css`
- `tests/new-game-dialog.test.ts`
- `tests/button-roles.test.ts`
- `tests/browser-button-roles.py`
- `tests/browser-app-idle.py`
- `tests/browser-offline-rules.py`
- `tests/browser-online-waiting-room.py`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/verification/README.md`
- 本検証記録

## 実行した検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | **成功**：73 tests、pass 73、fail 0、skip 0 |
| `npm run build` | **成功**：TypeScript型検査とVite production build |
| `npm run typecheck:worker` | **成功** |
| Python構文検査 | **成功**：変更したBrowser UIスクリプトを`py_compile`で検査。2回のBrowser UI期待値更新後も`ast.parse`で再検査 |
| `git diff --check` | **成功** |
| GitHub Actions `npm test` | **成功**：run #483で1309 tests、pass 1309、fail 0 |
| GitHub Actions Browser UI | **成功**：run #483のChromium 36 script executions、WebKit 24 script executions。offline／online rules、全対局回帰、320〜414pxの狭幅・1280px幅、フォーカス復帰を含む |
| Browser UI matrix audit | **成功**：Chromium・WebKit両jobの実在とsuccessを確認 |
| Deploy gate | **成功**：verify、Browser UI、matrix audit、release freshnessがすべてsuccess |
| Worker production test | **成功**：本番HTTPS、ルーム、WebSocket、再接続、認証・プライバシーを含む5シナリオ |
| Pages build／deploy | **成功** |
| run #483 | **成功**：[GitHub Actions run #483](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41277122584) |

Codex Cloud内ではBrowser UIブラウザーを起動していません。Browser UI結果はGitHub Actionsの同一SHAのChromium／WebKit jobとmatrix auditで確認しました。検証中、run #481は半荘戦を選んだ後の既存期待値が東風戦のままだったため失敗しました。run #482はPlaywrightのfieldsetに対する`is_disabled()`判定が失敗しました。期待値を正しい半荘戦表示へ修正し、参加者側はnative fieldsetのdisabled状態とすべてのラジオ入力の`:disabled`状態を直接検証するように更新した後、run #483で両エンジンの全回帰が成功しました。期待値は緩めていません。

## GitHub Actionsと公開

- 検証・公開対象commit：`91e5e420e2055dbbf33157be0d93e4ea2513cf2f`
- Deploy workflow run：#483 — [https://github.com/ak-sekine/heibon-mahjong/actions/runs/41277122584](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41277122584)、**completed / success**
- Worker：**公開成功**。`https://heibon-mahjong-online.ak-sekine.workers.dev`。Worker記録SHA=`91e5e420e2055dbbf33157be0d93e4ea2513cf2f`。本番オンラインシナリオ5件成功。
- Pages：**公開成功**。`https://ak-sekine.github.io/heibon-mahjong/`。Pages記録SHA=`91e5e420e2055dbbf33157be0d93e4ea2513cf2f`。
- 公開URLの直接HTTP応答確認：**未確認**。ActionsのWorker本番テストとPages deployment action・SHA記録を公開成功の根拠としています。

## 実機確認が必要な項目

以下はユーザー本人による公開後確認待ちです。実施前のため、すべて未確認です。

- iPhone Safari：オフライン新規対局で東風戦／半荘戦を選び、キャンセルで保存値を変えず、開始後に次回値が復元すること。
- iPhone Safari：ルーム作成で同じ設定を使い、キャンセルで保存値を変えず、作成後にWorker確定ルールが待機中とルール確認に反映されること。
- iPhone Safari：狭い縦画面・横画面でルール一覧を内部スクロールし、最下部の「対局開始」／「ルーム作成」と「キャンセル」へ到達できること。閉じた後はメニューボタンにフォーカスが戻ること。
- iPhone Safari：PWA standalone表示領域・セーフエリアで同じ操作ができること。
- オンライン参加者側から確定ルールを読み取り専用で確認でき、再接続後も同じルールが表示されること。
- Android実機：未確認。
- PC実機：未確認（Playwrightの1280×900 viewport CI結果とは区別）。

### 初回公開時の状態

実装、自動検証、GitHub Actions、Deploy gate、Worker／Pages公開は完了しました。iPhone Safari実機での新規対局／ルーム作成、保存・キャンセル、狭幅・横向き・safe area・PWA standalone、内部スクロール、操作ボタン到達、閉じた後のフォーカスをユーザー本人が確認するまでIssue #27はCloseしません。Android実機、PC実機、公開URLへの直接HTTP確認も未確認です。

## 2026-11-01 追加修正：Safariでルール欄と操作ボタンが重なる

ユーザー本人のiPhone Safari実機確認で、ルール説明が操作ボタンの背後に入り、スクロール領域がフッター上端で終わらず、スクロールバーも見えない不具合が確認されました。添付スクリーンショットは実機での再現証拠として扱います。

### 原因と修正

- 初回実装では、オフラインはダイアログ全体をスクロール領域とし、操作フッターを`position: sticky`でその上に重ねていました。オンライン作成もフォーム全体をスクロールさせ、同じstickyフッターを使っていました。この構造ではフッターをスクロール領域の外に固定できていませんでした。
- 両ダイアログをヘッダー／本文／フッターに分け、本文だけを独立してスクロールするFlexboxレイアウトに変更しました。本文と各Flex親に`min-height: 0`、ダイアログにsafe-areaを考慮した`svh`／`dvh`最大高さを設定し、フッターをスクロール対象から外しました。
- iOS Safariの自動非表示スクロールバーを補うため、本文の表示高さ・全長・`scrollTop`からthumb位置と長さを計算するインジケーターを追加しました。リサイズ・向き変更・本文変更を監視し、スクロールできない場合は非表示にします。本文右側にトラック幅と文章の余白を確保しています。
- ルール内容、保存、Worker同期、対局開始処理は変更していません。キーボードで本文をスクロールできる領域にし、オンラインのTab移動テストも更新しました。

### 追加・更新した検証

- `tests/browser-create-dialog-layout.py`を追加し、オフライン／オンライン双方で320×320、320×568、375×667、812×375（横向き相当）、390×844を検査します。本文下端とフッター上端、固定ボタンの表示・タップ領域、最終ルールへのスクロール、インジケーターの表示・thumb寸法・位置同期を確認します。
- Browser UI manifestにChromium／WebKitの両方を追加し、選択テストの期待件数を更新しました。
- ローカル検証結果とGitHub Actions、Deploy gate、Worker／Pagesの公開結果は、この追補コミットの結果を後日ここに記録します。既知のCodex Cloud Chromium起動制限により、ローカルBrowser UIを成功扱いしません。
- iPhone Safari実機での再確認は未実施です。確認完了まではIssue #27をOpenのままにします。
