# Issue #48 — 鳴き判断の残り時間メッセージ重複

## 再現条件と原因

Issue #48は、2026-11-05に提供されたiPhone画面で、対局中の鳴き判断に同じ残り時間文言が鳴き選択肢の上と「見送る」ボタンの下に見える事象を報告しています。Issueのスクリーンショットは本リポジトリには添付されていないため、画面を独立に再生したものではありません。

ソースを追うと、重複はオンライン判断状態の二重割当で発生します。`createOnlineActionPanelState()`が、同じ`decisionStatus`を`callGroup.status`と`actionStatus`へ渡していました。共有`ActionPanel`は前者を選択肢群の上、後者を選択肢群の後（共通操作欄）へ別々に描画します。ロン判断でも`ronGroup.status`と`actionStatus`へ同じ文言を渡す形でした。

関連記録の[Issue #8 鳴き操作・スクロール調査](call-scroll-diagnostics-issue8-2026-10-30.md)はオフラインの表示パネル位置・入力の問題、[Issue #41 座席確定メッセージ重複](issue41-seat-finalized-message-duplicate-2026-11-02.md)はオンライン待機画面の別DOMによる重複です。画面症状の類似はありますが、この2件とIssue #48で同一原因を共有するコード経路は確認されませんでした。

タイマー自体やDOMの積み重ねが原因ではありません。オンラインの`game-controller.ts`が判断window単位で1秒ごとに状態を再描画し、`ActionPanel.update()`が既存status要素の`textContent`を更新します。古い要素の複製やタイマーの多重登録は、この表示経路では確認されませんでした。

オフライン状態変換`createLocalActionPanelState()`には判断タイマーがなく、鳴きstatusも空です。共通描画コンポーネントはローカル／オンライン両方で使われますが、残り時間文言を作るのはオンライン判断状態変換だけでした。したがって修正対象はオンラインの表示データ割当で、オフラインの鳴き・CPU対局進行やゲーム判断処理は変更していません。

## 修正

- 鳴き判断のカウントダウンは`callGroup.status`だけに渡し、共通`actionStatus`は「鳴き判断を待っています。」にしました。
- ロン判断のカウントダウンは`ronGroup.status`だけに渡し、共通`actionStatus`は「ロン判断を待っています。」にしました。
- 非該当の判断groupのstatusは空にし、非表示groupに同じタイマー文言が残らないようにしました。
- 秒計算、1秒間隔の更新、判断送信、見送り、サーバーtimeout、同期・再接続、CPU進行の実装は変更していません。

## 追加・変更した回帰検証

- `tests/action-panel-state.test.ts`: オフライン鳴き状態のタイマーなし、オンライン鳴き／ロン判断のgroup別status、カウントダウン更新、期限切れ、判断解決後のクリアを確認します。
- `tests/action-panel.test.ts`: status要素への一度だけの描画、更新時の古い文言置換、判断終了後の消去、次windowでの再表示を確認します。
- `tests/browser-action-panel.py`: Chromium／WebKitで320、375、390、430pxを対象に、表示数と位置、チー・ポン・大明カン表示、秒更新、選択・見送り後の消去、ロン判断とtimeout、44px以上の操作領域を確認します。
- `tests/run-browser-regressions.py`と`tests/test_browser_regressions_selection.py`: 同シナリオをChromium／WebKitのBrowser UI manifestに登録し、engine別の選択数を検証します。

## 自動・ブラウザー検証

対象コードコミット: `d4bfaa41ccad501f400fc26eca7fc5984f8e1add`。

- `npm test`: 成功（82 runner entries、失敗0、skip 0）。
- `npm run build`: 成功。アプリの`tsc --noEmit`、Vite production build、PWA shell生成を含みます。
- `npm run typecheck:worker`: 成功。
- `python tests/test_browser_regressions_selection.py`: 成功（7 tests）。
- Python構文検査と`git diff --check`: 成功。
- GitHub Actions [Deploy run #42028711294](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42028711294): 対象SHA `d4bfaa41ccad501f400fc26eca7fc5984f8e1add`で全体success。
- runの`verify`（単体テスト、Worker型検査、Pages build）、Chromium 42 scenario、WebKit 32 scenario、browser matrix audit、release freshness、Worker deploy、本番HTTPS／room／WebSocket／reconnect／auth／privacy検証、Pages build／deployがすべてsuccess。再利用済みbuildによりBrowser UI workflow内の独立した`verify-build`等3 jobは想定どおりskipです。
- 追加した`browser-action-panel.py`はChromium・WebKit双方で320／375／390／430pxの全幅が成功しました。残り時間は鳴き選択群の上に一度だけあり、秒更新で重複せず、チー・ポン・大明カン／ロンの判断、選択・見送り後の消去、timeout時の残り時間消去、次判断への切替、44px以上のボタン領域を検査しました。WebKitは自動ブラウザー検証でありiPhone Safari実機の結果ではありません。
- Worker URL `https://heibon-mahjong-online.ak-sekine.workers.dev` はWrangler deployと本番対局検証がsuccess。Pages `https://ak-sekine.github.io/heibon-mahjong/` はbuild／deployがsuccess。Worker／Pages記録SHAはいずれも`d4bfaa41ccad501f400fc26eca7fc5984f8e1add`です。

## 実機確認とIssue状態

iPhone Safari実機では未確認です。狭い画面でのブラウザー自動検証を実機確認とは扱いません。残り時間が鳴きボタン群の上だけにあること、ボタンとの重なりがないこと、選択・見送り・timeout後に不要表示が消えることを、iPhone Safariで確認する必要があります。

この必須の実機確認が未完了のため、Issue #48はOpenのままにします。
