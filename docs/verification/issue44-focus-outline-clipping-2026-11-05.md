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

- commit / push：`e1d583ac32d6fe8e29f9f789bbe330c6b716d54f`を`main`へpushし、リモート`refs/heads/main`が同SHAであることを確認しました。push前fetchで`origin/main`は`60aff03b25bea07312b60e0095620a16978409f6`、未pushコミットは今回の1件のみでした。
- Actions run [#41963501717](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41963501717)、対象SHA `e1d583ac32d6fe8e29f9f789bbe330c6b716d54f`：verify、npm regression、Worker型チェック、Pages build、Chromium Browser UIはsuccess。Browser UIのWebKitは別画面の既存`tests/browser-round-end-ui.py`が355×320で失敗しました。ログでは「順位確認」ボタンの`clickEvents`が0件のまま結果dialogが再表示されず、原因は未特定です。
- 同じ初回runのWebKit `tests/browser-online-dialog-layout.py`（作成画面・参加画面のoutline、320pxを含む幅）はsuccessし、今回のフォーカス枠回帰テストは通過しました。matrix auditは両エンジン必須条件によりfailure、Worker deploy、production test、Pages build／deployはskipされ、公開されませんでした。
- 失敗WebKit jobの単独再実行（run attempt 2）はverify/build successでしたが、Browser UIが`pages-dist-e1d583ac32d6fe8e29f9f789bbe330c6b716d54f-2` artifactを要求し、Deploy workflowが`...-1`として保存したため、ブラウザー起動前にfailureしました。再実行時のartifact名不一致です。
- 最終通常push run [#41965193092](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41965193092)、対象SHA `4264a24e87f98331f95533a80f719c8e85c32b3b`：verify、npm regression、Worker型チェック、Pages build、Chromium／WebKit Browser UI、matrix audit、release freshness、Worker deploy、本番Worker test、Pages build／deployがすべてsuccess。両Browser UI jobのSHAは対象SHAと一致し、Chromium 42 scenario、WebKit 31 scenarioを実行しました。今回追加した`browser-online-dialog-layout.py`も両エンジンでsuccessし、作成・参加画面のフォーカス枠、320px幅、既存の作成画面レイアウト確認が通過しました。
- Worker URLは[https://heibon-mahjong-online.ak-sekine.workers.dev](https://heibon-mahjong-online.ak-sekine.workers.dev)。Worker deployment記録SHAとPages deployment記録SHAはともに`4264a24e87f98331f95533a80f719c8e85c32b3b`でActions対象SHAと一致し、Pagesは[https://ak-sekine.github.io/heibon-mahjong/](https://ak-sekine.github.io/heibon-mahjong/)で公開成功しました。
- 今回の実機結果を記録した文書更新commit `92580ded6d215abc8f44d962cc75882fa3c3486a` のActions run [#42002567021](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42002567021) は全体success。docs-checkと変更分類はsuccessし、verify、Browser UI、matrix audit、release freshness、Worker production-test／deploy、Pages build／deployは文書のみの変更により正常にskipされました。このskipは失敗ではなく、このrunでゲーム検証・Deployを再実行していません。
- 初回runのWebKit失敗は355×320での既存`tests/browser-round-end-ui.py`のタイムアウトでした。ログでは「順位確認」ボタンの`clickEvents`が0件のまま結果dialogが再表示されず、原因は未特定です。同scenarioは直近成功run [#41940009814](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41940009814)（SHA `c57d35cd65adc5cb28c977383c379127f734e305`）と今回の最終runではsuccessしました。初回失敗が一時的かは確定できず、今回のCSS変更とはセレクター範囲・失敗画面の双方が異なります。
- `4264a24e87f98331f95533a80f719c8e85c32b3b`は初回実装commit `e1d583ac32d6fe8e29f9f789bbe330c6b716d54f`に余白計算コメントとCI失敗記録を加えたcommitです。公開コードは同じで、Worker／Pages公開SHAと成功Actions対象SHAは`4264a24…`です。
- 最終runの検証・公開結果は上記のとおり成功しています。以下の実機報告は自動検証とは分けて記録します。

## iPhone Safari実機確認（2026-11-05）

- 確認者：ユーザー本人
- 確認環境：iPhone Safari
- 今回報告された6項目：OK 6件、NG 0件、未確認 0件。

1. OK：「新しくルームを作る」でプレイヤー名をタップすると、水色のフォーカス枠が四辺とも欠けずに表示される。
2. OK：日本語キーボードの表示中・非表示時に、入力とダイアログ表示に問題がない。
3. OK：ルール一覧を上下にスクロールでき、スクロールインジケーターが正常に動く。
4. OK：下部の「キャンセル」「ルーム作成」ボタンが正しく表示・操作できる。
5. OK：「ルームに参加する」のプレイヤー名・ルームコード欄でもフォーカス枠と入力に問題がない。
6. OK：画面の横はみ出しや、入力欄・ルール・ボタンの重なりがない。

今回報告されていないホーム画面PWA、320px相当幅の実機表示、ダイアログの「閉じる」操作は、上記の実機OKに含めません。端末機種、iOSバージョン、確認時刻も報告がないため記載しません。修正前の実機での直接再現も未確認です。

## 受入条件と完了判断

主要受入条件は、ユーザー本人によるiPhone Safari実機確認で満たされました。作成画面のフォーカス枠、キーボード表示前後、ルール一覧とスクロールインジケーター、操作ボタン、参加画面の入力欄、および横はみ出し・要素重なりの有無が報告範囲でOKです。自動検証では指定Actions runのChromium 42 scenarioとWebKit 31 scenario、フォーカス枠回帰テスト、matrix audit、regression tests／build、Worker本番検証、Worker／Pages deployが成功し、公開SHA `4264a24e87f98331f95533a80f719c8e85c32b3b` はActions対象SHAと一致しています。

以上からIssue #44はcompletedでClose可能と判断します。今回の作業ではIssue本体を変更せず、Openのまま維持します。Close操作は別途ChatGPT側で実施します。

初回Actionsの別画面WebKit timeoutと、再実行時のartifact名不一致は原因未特定の履歴として保持します。最終runが成功したことをもって、それら過去の失敗原因が解明されたとは判断しません。
