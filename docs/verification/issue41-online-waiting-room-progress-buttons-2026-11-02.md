# Issue #41 オンライン待機画面の進行ボタン — 2026-11-02

## 状態

- Issue #41「オンライン待機画面の操作ボタンを進行状態に応じて切り替える」。iPhone Safari実機確認が終わるまでOpenを維持し、結果を受けてClose可否を判断する。
- Issue本文と最新の`main`を確認して着手。開始時ブランチ`work`、作業ツリーclean、開始時HEAD `559af2fefac7c49c498e756b11f813cbb97516f8`。通常の`git fetch origin`はプロキシ接続不可。許可付き`git fetch origin`は成功し、`origin/main`も同じSHA `559af2fefac7c49c498e756b11f813cbb97516f8`。behind/aheadは`0/0`、`origin/main..HEAD`の未pushコミットなし。
- Issue #34は左側「ルームを退出」・右側「準備完了」・下段全幅「再接続」を2列gridで配置済み。進行ボタンの同位置配置はこの領域に追加する。

## 事前調査と仕様維持

- HTMLは`index.html`、待機画面と状態表示は`src/online/waiting-room.ts`、待機操作の配置は`src/style.css`。既存Browser UIの状態mockとレイアウト確認は`tests/browser-online-waiting-room.py`、本番WebKitダイアログ配置は`tests/browser-online-dialog-layout.py`。
- 既存の`allReady`は人間席が1人以上あり、各人間席が接続中かつreadyの場合にtrue。座席確定ボタンと開始ボタンはこれを利用する。条件式は変更しない。
- 座席確定要求は既存の`finalize-seats` Worker actionへ送る。Worker側のCPU補充、座席抽選・固定・同期、接続・再接続、ホスト権限、開始条件、退出・全員退出時の終了処理は変更しない。
- 再戦は既存の`rematchWaiting`と人間全員の準備条件を維持する。再戦のホストが未準備の間は同じ位置に「準備完了」を表示し、ホスト準備後に同位置を「オンライン対局を開始」へ切り替える。

## 実装

- `src/online/waiting-room.ts`ではホスト準備後の座席確定操作を自身の準備状態がtrueになった時だけ表示し、座席確定前の準備ボタンと同じ`progress` grid領域に割り当てた。座席確定後の開始ボタンも同領域を使用する。通常の人間参加者の`allReady`判定は変更していない。
- 準備ボタンは常に`set-ready: true`を送り、準備後は非ホストには表示せず、ホストは「席を確定」へ切り替える。再戦ではホスト未準備時に同じ位置で準備を受け付け、準備後に開始ボタンを表示する既存の再戦手順を維持。
- `index.html`から「ルームを終了」ボタンを削除し、同ボタンのDOM参照・クリックイベント・待機UI用ハンドラを除去。`close-room` action型、Workerのルーム終了処理、全員退出時の終了処理は変更していない。
- 左の退出、右の進行ボタン、下段全幅の再接続のCSS grid配置と共通ボタンrole classを維持。進行ボタンは320px幅でも縮小可能・折返し可能な既存共通スタイルを使う。
- `tests/browser-online-waiting-room.py`に同位置遷移、準備未完了時の無効化、非ホスト権限・準備解除非表示、確定後の開始、退出の位置固定を追加。CPU補充、座席抽選・固定、開始、退出、再接続・再戦の既存回帰シナリオを残す。役割クラス検査とIssue #34のWebKit配置fixtureも削除したボタンに合わせた。
- 更新ファイル：`index.html`、`src/online/waiting-room.ts`、`src/style.css`、`tests/browser-online-waiting-room.py`、`tests/browser-online-dialog-layout.py`、`tests/browser-button-roles.py`、`tests/button-roles.test.ts`、`docs/ROADMAP.md`、`docs/verification/README.md`、本検証記録。

## ローカル自動検証

- `npm test`: 76/76テストファイル成功、失敗0、skip 0。最初の実行はHTMLボタン数が1つ減った後も既存テストの期待件数が更新されていなかったため失敗。期待値を新UIに合わせて更新し、全体を再実行して成功。
- `npm run build`: 成功（TypeScript検査、Vite production build）。
- `npm run typecheck:worker`: 成功。Workerコードは変更なし。
- 変更したPython Browser UIスクリプトの`py_compile`: 成功。`python tests/test_browser_regressions_selection.py`: 5件成功。
- `git diff --check`: 成功。
- Codex Cloud内のChromium／WebKit Browser UIは未実施。`AGENTS.md`の既知制限（Chromium起動時Crashpad `SO_PASSCRED` / `EPERM`）に従いローカル起動を繰り返さず、Actions上のChromium／WebKit結果と区別する。

## GitHub Actions・公開

- 初回main Deploy run [#41457690810](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41457690810) はSHA `5bf833582734afed9f363b614d230c29f7ffc662` を対象に実行。`docs-check`と`verify`（回帰テスト、Worker型検査、Pages build）はsuccess。Chromium Browser UIは新規ルーム作成後、WebSocket初期状態を待つ前にテストが準備ボタンを確認してfailure。WebKitはホストだけが準備済みで参加者はまだ未準備なのに、参加者の準備ボタンが非表示になると誤って期待しfailure。いずれもテスト側のタイミング／期待順の誤りであり、画面実装の失敗ではないことをログから確認。初期状態の描画を待ち、ホスト準備後も未準備の参加者には準備ボタンを残し、その参加者自身の準備後に非表示となることを待つ形へ回帰スクリプトを修正した。`browser-ui-matrix-audit`はfailure、Deploy gateは不成立。Worker／Pages公開はskip。
- 修正後run [#41458786517](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41458786517)（SHA `9c91447102ac8199ac8a54b55108059c0d6d0c7c`）では`verify`がsuccess。Chromium／WebKit Browser UIは、ホストだけが準備した直後に未準備の参加者の準備ボタンが消えるとテストが誤認して両方failure。参加者自身が準備するまでは同ボタンが表示されるのが仕様のため、テスト順と期待を修正。`browser-ui-matrix-audit`はfailure、Deploy gateは不成立。Worker／Pages公開はskip。
- run [#41460386920](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41460386920)（SHA `d394da14ddd39420278ecd3c0086b77d12767832`）では`verify`success。Chromium／WebKit Browser UIは、参加者準備後の退出ボタンの画面上のy座標が18.5px変化したためfailure。ルーム表示内容の高さが状態により変わる座標を比較していたテストの問題で、ボタン領域の配置自体は同じ。進行ボタン同士は操作領域からの相対位置で比較し、進行ボタンがない参加者状態では退出ボタンの横位置を同じブラウザー内で比較するよう回帰チェックを修正。`browser-ui-matrix-audit`failure、Deploy gate不成立、Worker／Pages公開はskip。
- run [#41461599181](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41461599181)（SHA `cb14fe7dd24cc85afdf3448ed9eac54f6c7cab31`）では`verify`success。Chromium／WebKit Browser UIは再戦待機でホスト未準備なのに「対局開始」が表示されると旧テストが期待しfailure。新仕様ではホストが準備するまでは「準備完了」を表示するため、再戦テストもこの切り替え順へ修正。`browser-ui-matrix-audit`failure、Deploy gate不成立、Worker／Pages公開はskip。
- 修正後のmainコミットSHA、再実行run、Chromium／WebKit、Deploy gate、Worker／Pagesの公開結果は確認後に追記する。
- PRは作成しない。

## iPhone Safari実機確認

- ユーザー本人による実機確認結果は未報告。確認できるまでは未確認とし、推測で結果を記載しない。
- 受け入れ確認項目：ホスト準備前・準備後・座席確定後の同じ位置での切替、他参加者が未準備時の無効表示、全員準備完了時の有効表示、非ホストの表示・操作権限、CPU補充後の座席と固定、開始、ホスト／参加者退出、再接続後の復元、左の退出位置固定、再接続の下段全幅、縦向きでの折返し・重なり・横はみ出し。
