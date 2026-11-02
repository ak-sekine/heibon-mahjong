# Issue #38 — 人和・固定満貫の検証記録

## 対象

- Issue: [#38 人和（初期OFF・固定満貫・高点法）](https://github.com/ak-sekine/heibon-mahjong/issues/38)
- 実装基準: main `b1da15aa36f96a66ca08d7b2a4ad3a614cbdc469`（実装開始時）
- 仕様根拠: [Issue #19確定記録](issue19-unimplemented-rules-2026-11-02.md)末尾の2026-11-02 closeout、およびIssue #38本文

## 実装内容

- 既存GameRules schema v5の`renhou: 'off' | 'mangan'`を使い、初期値OFFとv1〜v4のOFF移行を維持。
- オフライン／オンラインの共通ルール編集と確認表示に人和を追加。対局開始時snapshot、localStorage、Workerのroom rules、再接続・次局・再戦は既存v5経路を利用。
- 第一自摸前は河の枚数だけでなく`discardHistory`、`drawnTile`、現在ロン窓、全局の`callsMade`・`kanCount`・副露状態から確認。物理牌の136枚一意性と現在河の最新捨て牌も確認。
- 人和は役候補と翻数を共有せず、0翻・ドラ翻0の固定満貫候補として生成。役・ドラを含む通常候補の和了点が8,000点を超えるときだけ通常候補を採用。点数比較から本場・供託を除外し、その後に既存精算を適用。
- 通常ロン候補、形判定、フリテン、pass、timeout、複数候補の受付は既存経路を維持。CPUとWorkerも共通`evaluateWin()`結果を使う。
- 役名は「人和」、点数区分は「満貫」。オフラインとオンラインの概要・詳細は人和を翻数やドラへ加算しない。

## 自動検証

2026-11-02にCodex Cloudで実行:

- 関連: `tests/issue38-renhou.test.ts` 9件、`tests/online-game.test.ts` 25テスト（Issue #38 Worker cases含む）、`tests/rules.test.ts`、`tests/ron.test.ts`、`tests/step13-11.test.ts`、`tests/issue37-double-yakuman.test.ts`が成功。
- 全体: `npm test`成功。77テストファイル、失敗0件。
- build / TypeScript: `npm run build`成功（`tsc --noEmit`とVite build）。`npm run typecheck:worker`成功。
- Browser UI用の`browser-offline-rules.py`と`browser-online-waiting-room.py`のPython構文検査成功。Codex CloudではChromium/WebKitを起動していません。
- `git diff --check`成功。

固定局面テストでは、親の初打と後続席の打牌、子／親、初自摸前後、鳴き・槓5種、各種フリテン、形不成立、人和OFF、役なし・満貫未満・同点・満貫超過・役満、ドラ、本場・供託、CPU自動ロン、Worker確定、改変したクライアント点数、pass／timeout、rules v1〜v5を確認しました。

## GitHub Actionsと公開

- Actions run [#563](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41546258846) はsuccess。runの`head_sha`は実装コミット`6c7a84ac0f38e791c7847270f04d455f659ed125`。
- `verify`（`npm test`、Worker typecheck、Pages build）、Chromium Browser UI、WebKit Browser UI、Browser UI matrix audit、release-freshnessがすべてsuccess。
- `deploy-worker`とproduction testがsuccess。Workerの成功デプロイSHA記録ステップもsuccess。
- `pages-build`と`pages-deploy`がsuccess。Pagesの成功デプロイSHA記録ステップもsuccess。
- Worker・Pages両方の成功公開SHAは`6c7a84ac0f38e791c7847270f04d455f659ed125`で、Actions runの実装SHAと一致。
- Pages／Workerの公開ジョブ成功とSHA記録は確認済み。公開先への独立したHTTP応答検査は未実施。Codex Cloud内でChromium／WebKitは起動せず、Browser UI結果はGitHub Actionsで確認。

## iPhone Safari実機確認

- 状態: **ユーザー未確認**。自動テスト、Chromium、WebKitの結果を実機確認成功として扱いません。
- Issue #38はOpenのまま維持。
- ユーザー確認チェックリスト:
  1. 新規オフライン対局とオンラインルーム作成で人和が初期OFF。
  2. 人和ONが確定ルールに表示され、キャンセル後や別ルームで誤って切り替わらない。
  3. 子の初自摸前に通常ロン・役なしロンが成立し、結果が「人和」「満貫」「8,000点」になる。
  4. 人和を有効にした人間／CPU混在オンライン対局で、Worker確定後に同じ役名・点数が見える。
  5. 人和OFF、親のロン、初自摸後、鳴き・槓後、フリテンでは人和が成立しない。
  6. 和了結果概要と局結果で人和・満貫・ドラ翻が一致し、本場・供託が通常どおり反映される。
  7. 設定・確認表示・結果表示に横はみ出しや押せないボタンがない。
