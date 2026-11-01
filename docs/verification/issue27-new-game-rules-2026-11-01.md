# Issue #27 — 新規対局画面へのルール設定統合

実施日：2026-11-01。Issue：[#27](https://github.com/ak-sekine/heibon-mahjong/issues/27)。開始基準：`origin/main` / `c9eeb62c861ee2bfc007586795d7822f0b70ec40`。実装・ローカル検証後のユーザー本人による実機確認待ちのため、IssueはOpenのままにします。

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
| `python -m py_compile`（変更したBrowser UIスクリプト4本） | **成功** |
| `git diff --check` | **成功** |
| GitHub Actions Browser UI Chromium／WebKit | push後に確認予定 |
| GitHub Actions Deploy gate／Worker／Pages | push後に確認予定 |

Codex Cloud内ではBrowser UIブラウザーを起動していません。Chromium／WebKitの結果は未実施を成功扱いせず、既存のmain向けGitHub Actionsで確認します。

## GitHub Actionsと公開

- 対象commit：記録更新後に追記
- Deploy workflow run：記録更新後に追記
- Run URL：記録更新後に追記
- Deploy gate／production-test：未確認
- Worker公開SHA・結果：未確認
- Pages公開SHA・結果：未確認
- 公開URLの直接HTTP確認：未確認

## 実機確認が必要な項目

以下はユーザー本人による公開後確認待ちです。実施前のため、すべて未確認です。

- iPhone Safari：オフライン新規対局で東風戦／半荘戦を選び、キャンセルで保存値を変えず、開始後に次回値が復元すること。
- iPhone Safari：ルーム作成で同じ設定を使い、キャンセルで保存値を変えず、作成後にWorker確定ルールが待機中とルール確認に反映されること。
- iPhone Safari：狭い縦画面・横画面でルール一覧を内部スクロールし、最下部の「対局開始」／「ルーム作成」と「キャンセル」へ到達できること。閉じた後はメニューボタンにフォーカスが戻ること。
- iPhone Safari：PWA standalone表示領域・セーフエリアで同じ操作ができること。
- オンライン参加者側から確定ルールを読み取り専用で確認でき、再接続後も同じルールが表示されること。
- Android実機：未確認。
- PC実機：未確認（Browser UIのCI結果とは区別）。

### 完了状態

実装・ローカル自動検証は完了しました。GitHub Actionsと公開結果はこの記録を更新して追記します。ユーザー本人の実機確認前のため、Issue #27はCloseしません。
