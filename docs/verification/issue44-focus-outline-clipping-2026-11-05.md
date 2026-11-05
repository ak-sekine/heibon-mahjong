# オンラインルーム作成画面のフォーカス枠 — Issue #44、2026-11-05

## 原因調査

Issue #44のスクリーンショット報告では、iPhone Safariで日本語キーボード表示中に「プレイヤー名」の水色枠の左端が切れていました。Issue本文時点でブラウザーによる再現確認はありません。

修正前のDOMとCSSを確認しました。

- `#online-create-name` は `#online-create-content.dialog-scroll-content` 内にあります（[`index.html`](../../index.html)）。
- `.dialog-scroll-content` は `overflow-x:hidden; overflow-y:auto`、paddingは`0 8px 4px 0`で左paddingがありません。
- `.online-dialog input:focus-visible` は `outline:3px solid #82dcff; outline-offset:2px` です。枠は入力矩形の外へ合計5px描画されます。
- `.dialog-scroll-panel` も `overflow:hidden` です。

したがって、作成画面の入力枠左端はスクロール領域の左clip端を5px越える配置でした。IssueのスクリーンショットとCSSのclip領域・outline寸法は、左端切れの原因と整合します。iPhone Safariの描画ピクセルを修正前に実ブラウザーで採取したわけではないため、実機での直接再現は未確認です。Codex Cloud内でChromium/WebKitを起動する検証は実施せず、既存方針どおりGitHub ActionsのBrowser UI検証を使います。

## 修正内容と影響範囲

- `src/style.css` の `.online-create-dialog .dialog-scroll-content` に `padding-left:6px; margin-right:-6px` を追加しました。
- outlineの外側寸法5pxに対して1pxの余裕を持たせました。右marginを同量マイナスにすることでスクロール内容の有効幅を保ち、入力欄やルール行を狭めません。スクロールインジケーターの列と操作フッターは変更していません。
- 変更はルーム作成ダイアログに限定し、オフライン新規対局の共通スクロールCSSには適用しません。参加画面は既存のダイアログ内paddingで入力枠の外側余白を持ちます。
- `tests/browser-online-dialog-layout.py` にフォーカス枠の回帰確認を追加しました。作成の表示名、参加の表示名・ルームコードについて、computed outline（色・幅・offset）とDOM矩形から得た枠の描画範囲を各overflow clip祖先のpadding-boxと比較します。320pxを含む全既存viewportでChromium／WebKit両方に実行します。テスト時のフォーカス状態の画像も保存します。

## ローカル検証

- 作業開始時HEAD：`920ea2de1b4e124abc296ecb6c6c085fbb8f6f21`（`work`、未pushコミットなし）。開始時の未追跡 `.github/scripts/__pycache__/` は今回の変更と無関係のため保持しています。
- `git fetch origin` 成功。取得した`origin/main`：`60aff03b25bea07312b60e0095620a16978409f6`。このSHAを基準に`main`へ切り替え、差分0／ahead 0で作業を開始しました。
- `npm test`：82件成功、失敗0件。
- `npm run build`：成功（TypeScript、Vite、PWA shell）。
- `tests/browser-online-dialog-layout.py`：Python構文チェック成功。
- `git diff --check`：成功。
- Browser UI Chromium／WebKit実行：push後のActions結果を記録します。

## GitHub Actionsと公開

commit、push、Browser UI、Deploy gate、GitHub Pages公開の結果は、push後に対象SHAとの一致を確認して追記します。iPhone Safari実機確認は自動検証と分け、ユーザー確認待ちです。

## iPhone Safari実機確認待ち

公開後、Safariとホーム画面PWAの両方で次を確認してください。

1. ルーム作成を開き、プレイヤー名欄をタップする。日本語キーボード表示中と非表示時に、水色枠の四辺が欠けず、文字入力できること。
2. ルール一覧を上下にスクロールし、インジケーターがスクロール位置に合わせて動くこと。入力欄とルール設定の幅、下部の「キャンセル」「ルーム作成」ボタン配置が変わっていないこと。
3. 「キャンセル」と「閉じる」でダイアログを閉じられ、入力後に「ルーム作成」を実行できること。
4. ルーム参加画面でプレイヤー名とルームコードを順にフォーカスし、両方の枠が四辺とも見え、入力できること。
5. 可能なら横幅320px相当の狭い画面で横方向のはみ出しがないこと。

Issue #44はOpenのまま維持し、実装・自動検証と実機確認を区別します。
