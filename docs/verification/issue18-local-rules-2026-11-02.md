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

ローカルの結果はこの節に記録します。GitHub ActionsのChromium／WebKit、Deploy gate、Worker公開、GitHub Pages公開は、対象コミットSHAを照合した結果を後から追記します。

- `npm test`: 成功。75 test files、pass 75、fail 0、skip 0。Issue #18用 `tests/issue18-rules.test.ts` は22件すべて成功。
- `npm run build`: 成功（TypeScript compileとVite production build）。
- `npm run typecheck:worker`: 成功。
- Browser UI Python script syntax: `python -m py_compile tests/browser-online-waiting-room.py tests/browser-app-idle.py` 成功。
- `git diff --check`: 成功。
- Chromium Browser UI: Codex Cloud内はプロジェクト指示に記録されたChromium起動制限があるため未実施です。既存GitHub Actionsで実行し、結果を追記します。
- WebKit Browser UI: Codex Cloudでは未実施です。既存GitHub Actionsで実行し、結果を追記します。
- 特殊局面: 親テンパイ連荘・通常流局精算、4種類の途中流局、東4局／南4局のやめ条件、同点・2位以下、精算後供託、流し満貫、旧schema、オンライン作成・復元・再戦を自動テストで確認しました。

### 初回GitHub Actions確認と修正

実装SHA `20b11cb6773325d16c377992eb65d51b19889ad7` のDeploy run [`41381185539`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41381185539) はverify成功でした。Chromium／WebKit Browser UIは両方、既存の`tests/browser-app-idle.py`に残っていた`localStorage` version `3`の期待値で失敗し、schema v4で保存された実際値`4`と不一致になりました。ログを確認し、テスト期待値を4へ更新しました。matrix auditはBrowser UI失敗により失敗し、release freshness、Deploy gate後続、Worker／Pages公開はskipされ、このrunでは公開していません。

期待値更新コミット`4ea0047523913e3d04a3fec71a4031dc0ce4f14d`のDeploy run [`41381543798`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41381543798) はverify成功でしたが、Chromium／WebKitの両方で既存`tests/browser-offline-rules.py`の読み取り専用ルール名リストが更新前の13項目のままで失敗しました。アプリ表示・ルールモデルの比較以前のテスト期待値不整合と判明したため、一覧を新設7項目込みの全18行に更新し、ブラウザーで7項目の既定値も確認するようにしました。matrix auditは失敗し、release freshness、Deploy gate後続、Worker／Pages公開はskipされ、このrunでも公開していません。

## GitHub Actionsと公開

- 初回実装コミットSHA: `20b11cb6773325d16c377992eb65d51b19889ad7`（直接push済み）。
- 保存version期待値修正版SHA: `4ea0047523913e3d04a3fec71a4031dc0ce4f14d`（直接push済み）。
- 読み取り専用項目・既定値のBrowser UI期待値修正SHA: 追記予定。
- GitHub Actions Deploy run: 追記予定。verify、Browser UI Chromium／WebKit、Deploy gate、Worker公開、production test、Pages build/deployを対象SHAで確認します。
- Worker公開SHAと結果: 追記予定。
- GitHub Pages公開SHAと結果: 追記予定。Pagesの独立HTTP応答を確認したかも区別して記録します。
- 最終検証記録コミットSHA: 追記予定。

## iPhone Safari実機確認チェックリスト

通常操作で確認できる項目を優先します。特殊局面は上の自動テストで確認し、実機で起こせない項目を実機確認済みとは扱いません。

| # | 操作と確認内容 | 実機結果 |
| --- | --- | --- |
| 1 | オフライン新規対局で7項目すべて表示され、親テンパイ連荘・九種九牌・四風連打・四家立直・四開槓がON、アガリやめ・テンパイやめがOFFである。 | 未確認 |
| 2 | 1項目ずつON/OFFを切り替えられ、設定を確定した次の新規対局で値が復元される。 | 未確認 |
| 3 | 対局中の読み取り専用ルール確認に7項目と現在値が表示される。 | 未確認 |
| 4 | オンラインルーム作成時に設定でき、待機画面・対局中の確認にホスト確定値が表示される。 | 未確認 |
| 5 | オンライン再接続後および再戦時に7項目が維持される。 | 未確認 |
| 6 | CPUを含む対局で、ルール確認・局結果・次局への通常操作が支障なく進む。特殊な途中流局局面は自動テストで確認する。 | 未確認 |
| 7 | アガリやめ・テンパイやめ後に対局結果画面を開き、4人の最終順位・持ち点を確認できる。 | 未確認 |

機種、iOSバージョン、確認日時、各項目のOK／NG／未確認をユーザーの報告後に記録します。実機確認が完了するまでIssue #18はOpenです。

## 未確認事項

- 実機公開後のiPhone Safari確認は未実施です。
- Codex Cloud上での直接Chromium／WebKit起動は行わず、GitHub Actionsの結果で確認します。
- Actions、Worker・Pages公開、公開後のURL応答は実行後に対象SHAと結果を記録します。
- 最終diffの対象はIssue #18のルールモデル、共通UI、局進行・途中流局処理、該当テスト、指定された3文書とこの検証記録だけです。
