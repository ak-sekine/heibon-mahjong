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

2026-11-03、ユーザー本人がiPhone Safariで確認しました。端末機種、iOSバージョン、確認時刻の報告はありません。

| 確認項目 | 実機結果 |
| --- | --- |
| オフラインのルール設定 | 未確認 |
| オンラインのルール設定 | OK |
| 設定の保存・確認 | OK |
| 通常対局への影響 | OK |
| 人和の成立と表示 | 未確認 |
| 高点法と不成立条件 | 未確認 |
| オンラインの結果・再接続 | OK |
| 画面レイアウト | OK |

**合計: OK 5件、NG 0件、未確認 3件。** 未確認はOKへ読み替えません。とくに「オンラインの結果・再接続」のOKは、人和が成立する局面そのものを実機で再現・確認した報告ではありません。人和の成立・表示、高点法、不成立条件はこの実機確認では未確認です。

## 受け入れ条件と自動検証の照合

上記の実機結果とは別に、実装SHA `6c7a84ac0f38e791c7847270f04d455f659ed125`に対する既存自動検証で、次の固定局面を確認済みです。

- `tests/issue38-renhou.test.ts`（9 tests）: 子の第一自摸前の役なしロンが8,000点の固定満貫になること、子以外・自身の第一自摸後・鳴き／槓後・フリテン・不正形・ロン窓外・設定OFFで人和候補にならないこと、通常ロンの制約を維持すること。
- 同テスト: 通常役の得点が8,000点未満または同点なら人和、ドラを含む通常得点が8,000点を超える場合は通常得点、役満も通常得点を採ること。人和は0翻・ドラ翻0で、本場・供託は比較後に通常精算へ反映すること。
- 同テスト: CPUが同じ合法な人和候補を自動ロンすること。旧GameRules v1〜v4は人和OFFへ移行し、v5は選択値を保存・復元すること。
- `tests/online-game.test.ts`（25 tests、うちIssue #38 Worker casesを含む）: Workerが確定済みroom rulesを使って候補・8,000点・役名を再計算し、クライアントが送った改変点数を採用しないこと。人間／CPU混在のロン窓でpass・timeout後もCPU人和ロンが成立し、保存状態の復元・再接続後も人和ルールと複数の成立候補を保持すること。

これらの固定局面テストとActionsの自動検証がIssueの受け入れ条件を支えます。一方、3件の実機未確認は未確認のまま記録しています。ブラウザー自動テストやオンライン結果・再接続の実機OKを、人和成立局面そのもののiPhone Safari実機確認とは扱いません。

## 完了判定

自動検証に失敗はなく、Issue #38の実装・自動検証・公開SHAの一致を確認しました。実機確認は8項目中5件OK、NG 0件、未確認3件ですが、未確認の人和局面に対応する受け入れ条件は固定局面自動テストで確認できるため、Issue #38をcompletedとしてCloseします。未確認3件は引き続き実機未確認として区別します。
