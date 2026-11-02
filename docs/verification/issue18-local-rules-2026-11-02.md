# Issue #18 — 連荘・途中流局・オーラス終了条件

## 対象と開始時の状態

- リポジトリ: `ak-sekine/heibon-mahjong`
- 対象: [GitHub Issue #18](https://github.com/ak-sekine/heibon-mahjong/issues/18)
- 前回調査対象SHA: `8c0c9df68b60a43eb0e70aaf9c7327a0f111335b`
- 作業開始時HEAD: `8c0c9df68b60a43eb0e70aaf9c7327a0f111335b`
- `git fetch origin main` 成功後の`origin/main`: `8c0c9df68b60a43eb0e70aaf9c7327a0f111335b`
- 開始時ブランチ: `work`、作業ツリーclean、未pushコミットなし、`origin/main`とのbehind/aheadは`0/0`
- 前回調査SHAとの差分: 同一SHAのため差分なし。今回の実装開始時点でmainにIssue #18の変更は含まれていません。
- Issueは作業開始時点でOpenでした。ユーザーのiPhone Safari実機確認が終わるまでOpenのままにします。

## 設定項目

| 項目 | 初期値 | OFF／ON時の動作 |
| --- | --- | --- |
| 親テンパイ連荘 | ON | OFFでも通常のテンパイ料精算・供託持越し・本場加算は維持し、親を交代します。親の和了連荘には影響しません。 |
| 九種九牌 | ON | OFFでは宣言操作を表示せず、宣言APIを拒否して打牌を続けます。 |
| 四風連打 | ON | OFFでは4人の第一打が同じ風牌でも途中流局にせず、ロン・鳴き応答と次のツモへ進みます。 |
| 四家立直 | ON | OFFでは4人目のリーチを供託・打牌後に確定し、通常進行を続けます。 |
| 四開槓 | ON | OFFでは複数人合計4回目のカン後も嶺上牌・ドラ表示・打牌を続けます。局内のカン上限4回は維持します。 |
| アガリやめ | OFF | ONでは最終予定局に親が和了（親の流し満貫を含む）し、精算後に親が厳密な単独トップなら対局を終了します。 |
| テンパイやめ | OFF | ONでは最終予定局の通常流局で親テンパイ連荘ONかつ親テンパイの場合、テンパイ料精算後に親が厳密な単独トップなら対局を終了します。 |

全7項目は個別に変更できます。親テンパイ連荘、4種類の途中流局は初期値ON、アガリやめ・テンパイやめは初期値OFFです。

## 局進行・精算の処理順

1. 和了、通常流局、途中流局を確定します。
2. 和了点、テンパイ料などを精算します。
3. 本場・供託を更新します。途中流局の供託は持ち越し、テンパイ料はありません。
4. 親の連荘・交代を判定します。
5. 最終局のアガリやめ・テンパイやめを精算後の持ち点で判定します。
6. 対局終了または次局への遷移を決めます。
7. 結果画面とオンライン状態へ確定結果を反映します。

単独トップは親点が他3人それぞれより厳密に高い場合だけ成立し、同点順位表示のプレイヤーID補正を使いません。途中流局ではテンパイやめを適用しません。アガリやめは現行の親流し満貫の連荘扱いを維持し、通常の親和了と同じ精算後終了判定に含めます。

## 保存・同期と互換性

`GameRules`をschema v3からv4へ拡張しました。オフライン設定保存、共通の新規対局設定画面、オフライン・オンラインの読み取り専用ルール確認、Workerルーム確定値、対局snapshot、CPU、再接続、次局、再戦は同じ正規化済みルールを利用します。GameRules v1〜v3とlocalStorage version 1〜3は読み込み可能で、今回の7項目は確定した初期値に補完されます。Room Workerは従来のschemaを受理してv4へ正規化します。

## 自動検証

ローカルとGitHub Actionsの結果を記録します。GitHub Actionsの対象SHAは実装・公開コミット`bd7cc8e35335b3652684077718a77a13be2b3ebf`です。

- `npm test`: 成功。75 test files、pass 75、fail 0、skip 0。Issue #18用 `tests/issue18-rules.test.ts` は22件すべて成功。
- `npm run build`: 成功（TypeScript compileとVite production build）。
- `npm run typecheck:worker`: 成功。
- Browser UI Python script syntax: `python -m py_compile tests/browser-offline-rules.py tests/browser-online-waiting-room.py tests/browser-app-idle.py` 成功。
- `git diff --check`: 成功。
- Codex Cloudでの直接Chromium／WebKit起動: プロジェクト指示に記録された実行環境制限のため未実施です。下記のGitHub Actions Browser UIで両エンジンを実行しました。
- 特殊局面: 親テンパイ連荘・通常流局精算、4種類の途中流局、東4局／南4局のやめ条件、同点・2位以下、精算後供託、流し満貫、旧schema、オンライン作成・復元・再戦を自動テストで確認しました。

### GitHub Actions、Deploy gate、公開結果

- 最終対象SHA `bd7cc8e35335b3652684077718a77a13be2b3ebf` のDeploy run [`41382073027`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41382073027) はsuccessしました。
- `docs-check`、`detect-changes`、`verify`、`browser-ui-matrix-audit`、`release-freshness`がすべてsuccessしました。Deploy gateを迂回していません。
- Browser UIはChromium 37シナリオ、WebKit 25シナリオがすべてsuccessしました。新規対局の7項目初期値と、対局中の読み取り専用一覧18行も両エンジンで通過しました。
- `deploy-worker`: success。Cloudflare Worker `https://heibon-mahjong-online.ak-sekine.workers.dev`をSHA `bd7cc8e35335b3652684077718a77a13be2b3ebf`から公開しました。
- `production-test`: success。HTTPS、room、WebSocket、認証、プライバシーに加え、`two-human-game-host-cpu-handoff-reconnect`、`disconnect-reconnect`、`host-handoff-one-human-three-cpu`、`four-humans-zero-cpu`、`three-humans-one-cpu`の本番シナリオを確認しました。
- `pages-build`／`pages-deploy`: success。GitHub Pages `https://ak-sekine.github.io/heibon-mahjong/`を同じSHAから公開し、ActionsのPages deployment IDも`bd7cc8e35335b3652684077718a77a13be2b3ebf`です。
- Codex CloudからPages URLへの直接HTTP取得は確認できませんでした。`curl`はサイト応答を受け取る前に接続プロキシ（Envoy）から`CONNECT tunnel failed, response 403`を返され、HTTP statusは`000`でした。Web取得ツールもURLにアクセスできませんでした。この環境からの直接到達性だけが未確認で、Pagesの公開成否はActionsの`pages-deploy` successで確認しています。

### 初回GitHub Actions確認と修正

実装SHA `20b11cb6773325d16c377992eb65d51b19889ad7` のDeploy run [`41381185539`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41381185539) はverify成功でした。Chromium／WebKit Browser UIは両方、既存の`tests/browser-app-idle.py`に残っていた`localStorage` version `3`の期待値で失敗し、schema v4で保存された実際値`4`と不一致になりました。ログを確認し、テスト期待値を4へ更新しました。matrix auditはBrowser UI失敗により失敗し、release freshness、Deploy gate後続、Worker／Pages公開はskipされ、このrunでは公開していません。

期待値更新コミット`4ea0047523913e3d04a3fec71a4031dc0ce4f14d`のDeploy run [`41381543798`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41381543798) はverify成功でしたが、Chromium／WebKitの両方で既存`tests/browser-offline-rules.py`の読み取り専用ルール名リストが更新前の13項目のままで失敗しました。アプリ表示・ルールモデルの比較以前のテスト期待値不整合と判明したため、一覧を新設7項目込みの全18行に更新し、ブラウザーで7項目の既定値も確認するようにしました。matrix auditは失敗し、release freshness、Deploy gate後続、Worker／Pages公開はskipされ、このrunでも公開していません。

## GitHub Actionsと公開

- 初回実装コミットSHA: `20b11cb6773325d16c377992eb65d51b19889ad7`（直接push済み）。
- 保存version期待値修正版SHA: `4ea0047523913e3d04a3fec71a4031dc0ce4f14d`（直接push済み）。
- 読み取り専用項目・既定値のBrowser UI期待値修正SHA: `bd7cc8e35335b3652684077718a77a13be2b3ebf`（直接push済み）。
- 最終GitHub Actions Deploy run: [`41382073027`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41382073027)、success。
- Worker公開SHAと結果: `bd7cc8e35335b3652684077718a77a13be2b3ebf`、success。本番シナリオもsuccess。
- GitHub Pages公開SHAと結果: `bd7cc8e35335b3652684077718a77a13be2b3ebf`、success。Codex Cloudからの直接HTTP応答はネットワークプロキシに拒否され未確認です。

## iPhone Safari実機確認（2026-11-02）

- 確認者：ユーザー本人
- 確認環境：iPhone Safari
- 確認日：2026年11月2日
- 端末機種、iOSバージョン、確認時刻は報告されていません。

| # | 確認内容 | 実機結果 |
| --- | --- | --- |
| 1 | 新規対局画面に7項目が表示され、初期値が正しい。 | OK |
| 2 | 設定変更後に対局を開始し、次の新規対局でも設定が保持される。 | OK |
| 3 | オフライン対局中のルール確認に確定値が表示される。 | OK |
| 4 | オンラインルーム作成・待機画面に設定が正しく表示される。 | OK |
| 5 | オンライン再接続・再戦後も設定が維持される。 | OK |
| 6 | CPU対局で局結果から次局へ通常進行する。 | OK |

**指定6項目：OK 6件、NG 0件、未確認 0件。**

上記はユーザー本人から報告されたiPhone Safari実機確認です。特殊な途中流局・精算条件、アガリやめ・テンパイやめが成立する局面、終了後の順位・持ち点確認はこの報告に含まれていません。これらを実機OKとは記録せず、前述の固定局面自動テストおよびBrowser UI結果と区別します。自動テストやGitHub Actionsを今回再実行した結果としても扱いません。

## 完了判定

7項目の実装、初期値と旧データ互換、自動テスト、Chromium／WebKit Browser UI、Worker／Pagesの公開は、実装SHA `bd7cc8e35335b3652684077718a77a13be2b3ebf` とDeploy run [41382073027](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41382073027)で確認済みです。今回報告された指定6項目もすべてiPhone Safari実機でOKでした。特殊局面は自動テストで確認した範囲と実機未確認の範囲を分けて記録しています。実装・CI・公開結果との矛盾はありません。Issue #18をcompletedとしてCloseします。

この記録の更新前のmain commit `52066ebc91d2bc9e47348420f962b264bdceba14` では、文書のみのDeploy run [41383750926](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41383750926) がsuccessし、`docs-check`が成功、verify・Browser UI・Worker／Pages build・deployはskipでした。これは当時の文書変更に対する結果であり、今回の実機確認やテストの再実行を示すものではありません。

## 実機未確認の範囲

- 特殊な途中流局、精算条件、アガリやめ・テンパイやめ、終了後の最終順位・持ち点は今回の実機確認対象外です。固定局面を使った自動テストおよびBrowser UI結果と区別します。
- Pages URLへのCodex Cloudからの直接HTTP応答は接続プロキシ制限により未取得です。GitHub ActionsのPages deploymentはsuccessしており、実機確認で参照したURLは報告されていません。
