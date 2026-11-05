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

### iPhone Safari実機確認（ユーザー本人の報告）

2026-11-05、ユーザー本人がiPhone Safariで次の4項目を確認し、すべてOKと報告しました。

1. **OK** — オンライン対局で、鳴き判断の残り時間が選択ボタンの上側1箇所だけに表示される。
2. **OK** — 残り秒数が更新されても、重複表示や古いメッセージが発生しない。
3. **OK** — 鳴き選択または「見送る」の後に残り時間表示が消える。
4. **OK** — ロン判断でも残り時間が1箇所だけに表示され、操作後に消える。

**集計：OK 4件、NG 0件、報告された4項目について未確認0件。** この集計は報告された4項目だけを対象にします。端末機種、iOSバージョン、確認時刻、画面幅は報告されていないため記録していません。

この報告でiPhone Safari実機確認が未実施だった状態を更新します。今回明示されていないタイムアウト時の動作、個々のチー・ポン・カン等の種別、特定の画面幅は、実機確認済みとして扱いません。

### 受入条件の評価

| Issue #48の受入条件 | 判定と根拠 |
| --- | --- |
| 残り時間が鳴き選択ボタン群の上側に1箇所だけ表示される。 | **充足。** ユーザー本人のiPhone Safari報告（上側1箇所）と、Chromium／WebKitのBrowser UI検証（選択肢群より上に1箇所）を根拠とします。 |
| 秒更新時に重複や古い表示が残らない。 | **充足。** iPhone Safari実機報告と、Chromium／WebKitの秒更新・既存status要素更新の自動検証を根拠とします。 |
| 選択・見送り・タイムアウト後に不要な表示が消える。 | **充足。** 実機報告は鳴き選択・見送りとロン操作後の消去を確認しています。タイムアウト後の消去はChromium／WebKitおよび状態テストで確認しており、タイムアウトは今回の実機確認範囲外です。 |
| チー・ポン・カン・ロン等で重複表示がない。 | **充足。** Chromium／WebKitのBrowser UI自動検証でチー・ポン・大明カン・ロンの判断を確認しています。実機で個別に確認した種別は報告されていません。 |
| オフライン・オンラインの影響範囲が調査され、回帰がない。 | **充足。** コード調査で、残り時間文言はオンライン判断状態変換から設定され、オフライン状態変換に判断タイマーがないことを確認しました。オフライン／オンラインの状態テストと、共通ActionPanelの描画回帰テストを根拠とします。ゲーム判断・タイマー進行ロジックは変更されていません。 |
| iPhone Safariなどの狭い画面で表示位置・操作性に問題がない。 | **充足。** ユーザー本人のiPhone Safari報告で表示位置と選択・見送り操作後の消去を確認しています。Chromium／WebKit自動検証では320、375、390、430pxで位置と44px以上の操作領域を確認しています。実機の具体的な画面幅は未報告です。 |

### 自動検証・公開記録との照合

対象コードコミット`d4bfaa41ccad501f400fc26eca7fc5984f8e1add`は、GitHub Actions [Deploy run #42028711294](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42028711294)の全体successと一致します。runのverify、Chromium、WebKit、Browser UI matrix audit、release freshness、Worker deploy、本番production-test、Pages build／deployの各jobがsuccessでした。run詳細では、独立したbrowser-ui内のverify-build／docs-check／detect-changesは再利用済みbuildによりskipでした。

既存記録にある`npm test`、`npm run build`、`npm run typecheck:worker`、Browser UI選択テスト7件の成功、Chromium 42 scenario／WebKit 32 scenarioの成功と照合しました。runのverify jobは回帰テスト・Worker型検査・Pages buildの成功を示しています。ブラウザーUI検証は自動検証であり、iPhone Safari実機確認とは別の根拠です。

Worker／Pagesは対象コードSHA `d4bfaa41ccad501f400fc26eca7fc5984f8e1add`で公開成功と記録されています。ActionsのWorker deploy、production-test、Pages build／deploy各jobもsuccessです。

文書更新コミット`107fe3c5b9498e91f61093ef3a511bfd70c3c17c`とActions [run #42031364488](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42031364488)も照合しました。docs-checkはsuccessし、変更分類・deploy gate・Worker／Pages build・deploy等のコード検証または公開jobは文書のみの変更としてskipでした。これはコード変更を含まない文書更新に対する正常なskipで、コード検証やデプロイが実行されたことを意味しません。

### 判定

Issue #48の6受入条件は、iPhone Safari実機報告、自動検証、コード調査を区別したうえで、いずれも根拠を確認できました。実機未確認の範囲（タイムアウト、個々の鳴き種別、具体的な画面幅）は残りますが、該当する表示・状態遷移・幅の条件は自動検証とコード調査で確認されています。したがって、**Issue #48はcompletedとしてClose可能**と判断します。Issue本体はこの作業では操作せず、Openのまま維持します。Close操作は完了報告を確認したあとに別途行います。
