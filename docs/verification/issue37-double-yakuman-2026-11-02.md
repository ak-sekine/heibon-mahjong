# Issue #37 特殊形ダブル役満・GameRules v5 — 2026-11-02

## 状態

- Issue #37 は実装開始時にOpenと確認。iPhone Safariの実機確認結果を受け取るまでOpenのままにする。
- 実装開始時：ブランチ`work`、HEAD `d2e25ca0692dc7954fb24d260cb91c6d46f72ca6`、作業ツリーclean。fetch後の`origin/main`は`c09d3f6ddfbaa027d56d033fd9122fbbba2bc269`で、開始時のHEADから4 commit behind／ahead 0。fast-forwardして実装を開始。
- 仕様の正本：[`Issue #19確定仕様`](issue19-unimplemented-rules-2026-11-02.md)「2026-11-02 仕様確定・Issue #19 closeout」。
- 実装コミット：`8beb174a989849f9b27295fa82eb77cbf43b777d`。Browser UI回帰の安定化修正を含む最終公開SHA：`4b2c1bf4adb8150fcabbcd001a76f76ca9b946f4`。
- GitHub Actions run [#41414647412](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41414647412)（run #526、2026-11-02、push event）：全必須ジョブsuccess。verify、Browser UI Chromium／WebKit、matrix audit、release freshness、Worker deploy、production-test、Pages build／deployが成功した。
- Workerは`https://heibon-mahjong-online.ak-sekine.workers.dev`へ公開し、Pagesは`https://ak-sekine.github.io/heibon-mahjong/`へ同じSHAで公開。Workerのproduction-testはHTTPS、ルーム、WebSocket、再接続、認証・プライバシーと5種類のオンライン進行シナリオを通過。Pages deploy actionはGitHub Pages側でdeployment successを報告した。Pagesトップと固定局面URLへのCodex Cloudからの独立HTTP GETは、接続proxyのCONNECT 403で取得できなかった。
- iPhone Safari：未確認。ユーザー本人の報告待ち。

## 実装内容

- `GameRules` schemaと`heibon-mahjong-last-rules`のstorage versionをv4からv5へ更新。
- v1〜v4からの移行では人和`off`、パオ`false`、特殊形ダブル役満`false`、複数ロン`true`、三家和流局`false`を補完。v5は5項目の型と未知フィールドを検証し、従来方針どおり不正値を既定値へ正規化する。
- 新規対局・ルーム作成UIで切替可能なのは今回実装した「特殊形ダブル役満」だけ。残る4設定のUIとゲーム動作は後続Issueに残す。
- 特殊役満の判定は次のとおり。
  - 四暗刻単騎：通常の四暗刻成立条件を通過した和了候補のうち、待ちが単騎の場合だけ2倍。
  - 国士無双十三面待ち：和了牌を除いた直前13枚が么九牌・字牌の全13種類を1枚ずつ含む場合だけ2倍。
  - 純正九蓮宝燈：和了牌を除いた直前13枚が同一色の`1112345678999`の場合だけ2倍。完成後の14枚だけで純正判定しない。
  - 大四喜：風牌4種類すべての刻子・槓子が成立した場合だけ2倍。小四喜は1倍。
- 対象外の役満は常に1倍。同じ役満を候補内に一度だけ加え、異なる役満の倍率は合計する。候補の役ごとに倍率を持たせるため、後続Issue #39の役満別配賦で参照できる。今回パオ精算は実装していない。
- 既存の役満点数計算へ合計倍率を渡す。役別の倍率はオフライン結果・オンラインWorkerの公開結果にも保持し、概要・詳細で役名と「N役満」を表示する。
- iPhoneで通常の対局から再現しにくい形を試せる固定局面を`test.html`に追加。四暗刻単騎、国士十三面／単騎、純正／通常九蓮、大四喜／小四喜をOFF/ONで和了できる。`noindex`の検証ページ内だけに置き、通常対局画面には開発操作を出さない。

## 自動検証

- `npm test`：76テストファイルすべて成功、失敗0。GitHub Actions `verify`では個別テスト1,355件成功。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `git diff --check`：成功。
- 追加テストは物理牌136枚の固定局面整合性、4形のON/OFF、近接する非対象形、和了前13枚と完成後14枚の対照、四暗刻のロン／ツモ条件、同役の重複防止、別役満の2+1加算、親子×ロン／ツモ×1/2/3/5役満の支払い、本場・供託、CPU和了、Worker側の和了・点数確定、オンライン公開倍率、v1〜v4移行、v5保存復元・Worker room保存を確認する。
- 初回全体実行では既存`table.test.ts`の役満概要期待値が倍率表記を含まず失敗。仕様に合わせて期待値を更新し、再実行した全体テストは76/76成功。
- オフライン・オンラインのルール設定、ルーム待機表示、結果表示、iPhone向け固定局面は既存GitHub Actions Browser UIでChromium／WebKit両方を実行。run #41414647412では両方のBrowser UI jobsがsuccessし、320/375/390/414/768/1280pxの共通viewport checks、検証ページ11シナリオ（うちIssue #37固定局面7件）、OFF/ON結果詳細、320/375/390/430pxでの表示、通常ページからの隔離もpassした。
- Codex Cloud内のChromiumはリポジトリの既知Crashpad/seccomp制約（`SO_PASSCRED`で`EPERM`、起動時`SIGTRAP`）によりローカルBrowser UI未実施。既存の手順に従い、Chromium／WebKit UI結果はGitHub Actionsで確認する。
- Actionsの途中runでは、#41406338539のv5設定assertion、#41406856160の旧役満概要期待値、#41407683377のfixture操作順、#41409337230・#41411625972・#41412958830のBrowser UI結果ダイアログ待ちが失敗した。期待値・fixture選択・描画完了待ちを修正して再実行した。#41408970652は並行してmainが進んだためrelease-freshnessが公開を拒否し、そのSHAでは公開されていない。最終run #41414647412ではverify、両Browser UI engine、matrix audit、freshness、Worker／Pages公開とproduction-testがすべてsuccess。
- Worker・Pages deployment gateを迂回した公開は行っていない。最終Pages deployment actionのSHAは`4b2c1bf4adb8150fcabbcd001a76f76ca9b946f4`。

## iPhone Safari実機確認チェックリスト

公開後にユーザー本人が確認する。Browser UIとNodeテストの結果とは別に記録する。

1. 通常の新規対局画面に「特殊形ダブル役満」が表示され、既定値がOFF。
2. OFF/ONを切り替え、対局開始後の確定設定が表示される。
3. オフライン対局開始時の設定が保存され、次の新規対局でも復元される。
4. 対局中の読み取り専用ルール確認に、現在のON/OFFが表示される。
5. オンラインルーム作成のホスト設定と待機画面の読み取り専用表示が一致する。
6. オンライン再接続、ホスト移行、再戦後もWorkerが確定した設定が維持される。
7. [固定局面検証ページ](https://ak-sekine.github.io/heibon-mahjong/test.html?debug=issue37)で四暗刻単騎、国士十三面／単騎、純正／通常九蓮、大四喜／小四喜を再現し、和了結果の役名・個別倍率・合計倍率・点数を確認する。
8. 同ページで設定OFFにした対象4形が各1役満となり、ONでは対象形だけ2役満となる。近接する国士単騎・通常九蓮・小四喜はONでも1役満。

未報告の項目は未確認として残し、NodeテストやActionsの成功から実機確認済みとは判断しない。確認結果が揃った後に受け入れ条件と照合し、Issue #37のClose可否を判断する。

## 後続Issueへの影響

- #38 人和：型・既定値・正規化・保存・Worker同期の共通基盤を利用。人和の判定と表示UIは未実装。
- #39 パオ：同一和了候補の役名ごとに`yakuman: 1 | 2`を保持する。責任払いの金額配賦・本場処理は未実装。
- #40 複数ロン・三家和：`multipleRon`と`tripleRonAbortiveDraw`の既定値、v5互換・Worker同期基盤を利用。複数ロン設定、頭ハネ、三家和流局は未実装。
