# Issue #34 オンライン待機画面の操作ボタン配置 — 2026-11-02

## 状態

- GitHub Issue #34 は実機確認5項目OK（NG 0、未確認0）により完了判定。`completed`でCloseする。
- Issue本文と最新 `main` を確認してから実装を開始。開始時のブランチは `work`、HEADは `a3bdce2fe912d883820599565441cff7a3ee6ebd`、作業ツリーはclean。`git fetch origin` 成功後の `origin/main` は `203b6360f3270c1711abf652e00f2c672c55850d`。ローカルの6件遅れをfast-forwardで解消し、実装開始時のHEADを最新mainに揃えた。
- Issue本文は通常接続時の退出／準備完了の左右配置、切断時の再接続をその下段に全幅表示、接続中・成功後の既存状態維持、320px前後とPC幅での非重複・横はみ出し防止を要求。
- GitHub Issue検索では同じ待機ボタン配置を扱うOpen Issueは見つからなかった。Issue #21など既存のオンライン回帰テスト作業は別の障害再現・テスト強化で、今回の配置要件と重複しない。最新mainの待機室Browser UI変更も別の局面テストであることを確認。

## 実装

- `src/style.css` の `#online-actions` を2列グリッドに固定し、`#online-leave` を左、`#online-ready` を右、`#online-reconnect` を次の行全幅に割り当てる。幅480px以上で3列になる既存ルールを除去し、再接続の出現・消失によって上段が移動しない領域を確保。
- `tests/browser-online-waiting-room.py` に通常接続と再接続表示中の配置・横幅・ビューポート外表示チェックを追加。320、375、390、414／430、1280px幅で退出と準備完了の左右・同じ上段、再接続の下段全幅、切替前後で上段位置が同じこと、既存ボタン色を検証する。通常の再接続成功フローに加えて、手動再接続時の接続中表示・再接続ボタン非表示・接続成功後の状態も検証。
- `src/online/waiting-room.ts` とボタンの有効・無効条件、退出・準備完了・再接続処理は変更していない。HTML、ボタンのrole class、配色は維持。
- ROADMAPと本検証記録の目次を更新。Actions runと公開結果を下記に追記する。

## ローカル自動検証

- `npm test`: 成功、76/76テストファイル、失敗0、skip 0。
- `npm run build`: 成功（TypeScript検査、Vite production build）。
- `npm run typecheck:worker`: 成功。
- Browser UI Python構文検査: 成功。
- `python tests/test_browser_regressions_selection.py`: 5件成功。
- `git diff --check`: 成功。
- Codex Cloud内のChromium／WebKit起動: 未実施。リポジトリ記録済みのCloud Chromium Crashpad `SO_PASSCRED` / `EPERM` 制限に従い、ブラウザー検証はGitHub Actions `Browser UI verification` とmainのDeploy gate上で実施。未実施を成功扱いしない。

## GitHub Actions・公開

初回のmain Deploy run [#41443519982](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41443519982) は実装SHA `2d60be6a4950e541070b39c461ae856e693a53b2` を対象に実行。`docs-check`、`detect-changes`、`verify` はsuccess。Chromium／WebKit両方の待機画面テストは、切断時の幅430pxに対する通常時の比較基準を初期幅一覧へ追加し忘れたためfailureしました。幅430pxの上段比較前に落ちたケースです。matrix auditもfailureとなり、Worker／Pages公開工程はskipされました。

修正版run [#41444838765](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41444838765) はSHA `9db1af62844baaa350daf95a76783772f82bfa4c` を対象に実行。`docs-check`、`detect-changes`、`verify`、WebKit Browser UIはsuccess。Chromiumは待機画面の配置・接続遷移アサーションを通過した後、後続のオンライン対局診断テストで `game_action_response_timeout` が記録されずfailureしました。原因は、手動再接続中の表示確認用にテストmockへ追加した100ms遅延が、以降のゲーム再接続にも残ったことです。遅延を手動再接続1回で消費するようmockを修正しました。このrunではmatrix auditがfailureとなり、Worker／Pages公開工程はskipされました。

最終Deploy run [#41446809663](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41446809663) はSHA `6214f8cc73cf509acfe189cc5852a6deba855d97` を対象に実行し、全体がsuccessしました。`verify` は回帰テスト1,356件成功、Worker typecheck、Pages buildもsuccess。ChromiumとWebKitのBrowser UIは両方successし、待機画面回帰スクリプトを含むブラウザー検証を完了しました。通常接続では幅320、375、390、414、430、1280px、切断状態では幅320、375、390、430、1280pxを検証し、配置、上段位置の維持、再接続の下段全幅、既存配色、横スクロールなしを確認しています。再接続中から成功後への表示遷移と既存操作の検証も通過しました。

同runでは`browser-ui-matrix-audit`、`release-freshness`、`deploy-worker`、`production-test`、`pages-build`、`pages-deploy`もsuccess。Deploy gateを通過してWorkerとGitHub Pagesを公開し、公開対象SHAは`6214f8cc73cf509acfe189cc5852a6deba855d97`です。mainの公開対象SHAはこの値と一致します。Worker: https://heibon-mahjong-online.ak-sekine.workers.dev 、Pages: https://ak-sekine.github.io/heibon-mahjong/ 。

ローカルの`npm test`（76/76テストファイル、失敗0、skip 0）、`npm run build`、`npm run typecheck:worker`、Browser UI Python構文検査、回帰テスト選択検査（5件）、`git diff --check`も成功しました。Codex Cloud内のブラウザー起動は未実施であり、実行済みとして数えていません。

## iPhone Safari実機確認

2026-11-02、ユーザー本人がiPhone Safariで次の5項目すべてOKと報告（NG 0、未確認0）。CIと公開の成功とは独立した実機報告として記録する。

1. 通常接続時、同じ行の左が「ルームを退出」、右が「準備完了」である。
2. 接続切断時も上段左右が変わらず、その下に親領域幅の「再接続」が表示される。
3. 再接続中の既存文言・ボタン状態と、接続成功後に再接続ボタンが消える動作。
4. 準備完了、退出、再接続の操作ができる。
5. iPhone Safariの縦向き幅で折返し・重なり・左右はみ出しがなく、必要に応じ横向きでも崩れない。

結果：OK 5件、NG 0件、未確認0件。端末機種、iOS／Safariバージョン、確認時刻は未報告のため補完しない。横向きは任意項目であり実機確認報告なし。Chromium／WebKit CI結果と区別する。受け入れ条件を満たすためIssue #34はcompletedでClose可。
