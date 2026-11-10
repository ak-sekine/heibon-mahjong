# Issue #32: カン単一候補の即時実行（2026-11-10）

## 本人の実機報告と確認状態

ユーザー本人の今回の報告: **iPhone Safari実機で、暗カン候補が1件だけでも候補選択パネルが表示された（NG）**。
過去の実機OK／NG記録は維持する。この修正後のiPhone Safari実機確認は**未確認**。自動Chromium／WebKit検証を実機OKと扱わず、Issue #32は**Openを維持**する。

## 作業開始時のGit状態

- 作業場所: `/workspace/heibon-mahjong`、ブランチ: `work`、remote: `https://github.com/ak-sekine/heibon-mahjong.git`。
- 作業ツリーclean、未pushコミットなし。開始HEAD／fetch成功後のorigin/main: `0af27b3674b678669869325048407c02a698623a`。behind/ahead: `0 / 0`。
- 通常sandboxの`git fetch origin`はプロキシport 8080への接続に失敗。正規の許可付きで同じfetchを再実行し成功した。

## 実装

- `ActionPanel.selectSingleCandidate()`を種類ボタン押下時の共通入口とし、有効候補1件を既存`CandidateSelection.show(..., 'select')`で確定する。暗カン／加カンは既存`select-kan`、ポン／チー／大明カンは既存`select-call`へ渡す。
- 有効候補0件ではカンを実行しない。2件以上は従来の`kan-toggle`による候補表示へ進む。描画更新に自動確定を入れず、押下前・送信失敗・拒否・状態同期の再描画による自動実行を防ぐ。
- 入力のoperationId／panelIdを維持し、確定時のactionType／candidateIdを実際の候補へ更新する。即時カンの診断元は`kan-toggle`。確定前にカンボタンと戻るを無効化し、送信中は既存stateによる無効化を継続する。
- `CandidateSelection`の単一確定も候補自身のoperationTypeを優先する。ローカル／オンラインstate builderは全カン候補を既に保持しており、調査と混在候補テスト追加のみで製品実装は変更しない。
- 合法判定、通信仕様、ゲーム状態更新、嶺上ツモ、ドラ処理、CSS・卓サイズ・Safari向け候補配置は変更しない。検証ページの案内を新操作へ更新した。

## 変更ファイル

- 製品UI: `src/ui/action-panel.ts`、`src/ui/candidate-selection.ts`。
- 検証ページ案内: `src/verification/scenarios.ts`。
- 単体テスト: `tests/action-panel.test.ts`、`tests/action-panel-state.test.ts`。
- Browser UI: `tests/browser-action-panel.py`、`tests/browser-call-test.py`、`tests/browser-candidate-geometry.py`、`tests/browser-pc-table-layout.py`、`tests/browser-kan-page.py`、`tests/browser-step13-5.py`、`tests/browser-step13-5-5-kan.py`。
- 仕様・記録: `docs/SPEC.md`、この文書。

## 検証

- ローカル`npm test`: 86テストファイル成功（全体実行時点）。追加の混在state／候補自身の操作種別テストを含む関連2ファイルも再実行し成功。
- `npm run build`、`npm run typecheck:worker`: 成功。
- Browser UI選択テスト: 9件成功。変更したPythonの構文検査、`git diff --check`: 成功。
- 新規単体テストは、押下前の非実行、暗カン／加カンの単一即確定、trace引継ぎ、連打、送信中、拒否・タイムアウト後の明示再操作、0候補、混在する異なる合法候補の保持を確認する。
- Browser UIは既存Deploy workflowのChromium／WebKitで実施する。通常対局の実controller／state builderとオンラインcontrollerを用い、11 viewportで暗カン単一・複数、加カン、暗カン＋加カン混在、ポン複数、チー複数、大明カンを検査する。単一カンでは送信中連打、タイムアウト時の同期待ちと確認による解除、拒否、送信失敗からの復帰を検査する。タイムアウトはcontrollerへの既存接続状態／状態確認イベントで再現し、通信層のタイマーテストは既存suiteが担当する。
- `call-test.html`の暗カン単一・複数・加カンは即実行／パネル表示を分けて検査する。複数候補の戻る、再選択、内部スクロール、Safari相当可視領域、卓矩形・操作領域下端の保持を維持する。PCの候補位置テストと短画面の戻るテストは複数暗カン局面へ移した。
- Cloudの既知のChromium起動制限はリポジトリの手順に従い再調査せず、Browser UIとDeploy gateは対象コミットのActions結果を確認して記録する。

Actions run／公開SHA／push後の状態は、実行結果の確認後に追記する。
