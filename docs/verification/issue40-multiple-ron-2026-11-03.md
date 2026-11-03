# 複数ロン・頭ハネ・三家和 — Issue #40、2026-11-03

対象は [Issue #40](https://github.com/ak-sekine/heibon-mahjong/issues/40) の確定仕様です。設計の基礎は [Issue #19](issue19-unimplemented-rules-2026-11-02.md)、途中流局精算は完了済みIssue #18、GameRules v5はIssue #37、パオ精算はIssue #39の実装を使います。2026-11-03のiPhone Safari実機結果（OK 3件、NG 0件、未確認6件）を自動検証と照合し、未確認事項を残してcompletedでCloseと判断しました。

## 実装

- `GameRules` schema v5を維持。複数ロンは初期値ON、三家和流局は初期値OFFです。v1〜v4と旧snapshotはこの値で補います。
- オフライン新規対局、前回設定の保存、読み取り専用ルール確認、オンラインルームのホスト設定共有に2項目を接続しました。
- ロン確定は共通の `resolveRonDeclarations()` を使用します。実際に有効なyesを回答した席だけで結果を決めます。複数ロンOFF時は候補順に依存せず、放銃者から下家→対面→上家の順で最初の宣言者を選びます。
- 同じロン窓で3人全員がyesを回答し三家和設定がONなら、複数ロン設定にかかわらず途中流局します。CPUの自動yesも回答集合に入り、Workerは人間の回答完了または30秒期限後に一度だけ確定します。pass・timeout・候補だけの状態はyesになりません。
- 三家和は既存の途中流局精算へ接続し、点棒移動・罰符・供託取得なし、既存供託持越し、親維持、本場+1、局数据置です。東風戦・半荘戦の最終予定局でも三家和だけで対局終了しません。
- リーチ宣言牌への三家和では `pendingRiichi` を解除して1,000点を引かず、既存供託を維持します。ロンは四風連打判定より先に確定します。槍槓は同じ設定表を使い、回答中は槓を成立させず、ロン成立なら加槓・嶺上処理を行いません。既存の暗槓槍槓合法性判定は変更していません。
- 各ロン和了の個別支払い、本場、供託取得、Issue #39の責任払いを維持し、頭ハネ除外者には支払いません。三家和では和了・パオ精算はありません。
- オフライン・オンラインの局結果に「三家和」を表示し、供託持越しも表示します。

## 判定表

| 複数ロン | 三家和流局 | 2人の有効yes | 3人の有効yes |
| --- | --- | --- | --- |
| OFF | OFF | 頭ハネ | 頭ハネ |
| OFF | ON | 頭ハネ | 三家和流局 |
| ON | OFF | 2人和了 | 3人和了 |
| ON | ON | 2人和了 | 三家和流局 |

有効yesが1人だけなら4設定すべて通常ロンです。候補3人中2人yes・1人passは、三家和設定がONでも三家和になりません。

## 自動検証

- `npm test`: **79件成功、0件失敗**（79テストファイル）。
- `tests/issue40-multiple-ron.test.ts`: **29件成功、0件失敗**。設定4通り×1・2・3宣言、全放銃席からの頭ハネ優先、宣言なし・無効宣言・pass、四風連打、最終予定局、三家和精算、pending riichi、槍槓、パオ複数ロン精算、WorkerのCPU回答・人間回答順・復元・timeoutを確認しました。
- `npm run build`: 成功（TypeScript型チェックとVite本番build）。
- `npm run typecheck:worker`: 成功。
- GitHub Actions run [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355) は全ジョブsuccessです。`verify`・Worker型チェック・Pages build・browser matrix audit・release freshnessが成功しました。
- Browser UIはChromium **37シナリオ実行**、WebKit **26シナリオ実行**で、全件success・失敗0・timeout 0でした。オフライン設定UIは両エンジンで成功し、オンライン待機画面の回帰も両エンジンで成功しました。
- Worker Deploy、production-test、Pages build、Pages Deployもsuccessです。production-testは `two-human-game-host-cpu-handoff-reconnect`、`disconnect-reconnect`、`host-handoff-one-human-three-cpu`、`four-humans-zero-cpu`、`three-humans-one-cpu` の5シナリオすべて成功しました。
- Codex環境でのローカルブラウザー起動・検証は未実施です。Chromium／WebKitの結果は上記GitHub Actionsで確認しました。

## iPhone Safari実機確認結果（2026-11-03、ユーザー本人報告）

実機報告は **OK 3件、NG 0件、未確認6件**。未確認の特殊局面を実機で再現・確認したとは扱わない。端末機種、iOSバージョン、確認時刻は報告されていないため補完しない。

| # | 実機結果 | 確認項目 | 自動検証との照合 |
| --- | --- | --- | --- |
| 1 | **OK** | 複数ロンON・三家和OFFの初期値、個別変更・保存・復元 | GameRules v1〜v5と保存のテスト、Chromium/WebKitのオフライン設定UI回帰 |
| 2 | **OK** | 対局中のルール確認に両設定が正しく表示される | ルール確認UIのBrowser UI回帰。実機では表示をOKと報告 |
| 3 | **未確認** | 複数ロンONで複数和了、OFFで頭ハネ | 設定4組合せ×宣言1〜3人、全放銃者での頭ハネ順・非宣言者除外・精算の固定テスト |
| 4 | **未確認** | 三家和で点棒・供託・親・本場・局進行が正しい | 途中流局精算、供託維持、親維持、本場+1、最終予定局継続の固定テスト |
| 5 | **未確認** | 1人passまたはtimeoutでは三家和にならない | 3候補中2人yes/1人pass、Worker timeout・全員未回答の固定テスト |
| 6 | **未確認** | リーチ宣言牌への三家和で1,000点を引かない | pendingRiichi解除、点棒不変・既存供託維持の固定テスト |
| 7 | **未確認** | 四風連打条件の打牌では有効ロンを優先 | 四風連打と単独ロン・三家和の競合を扱う固定テスト |
| 8 | **未確認** | 槍槓のロン回答中に槓が先行成立しない | 加槓を保留し、槍槓ロン／三家和時に槓未成立となる固定テスト。全槓種の実機検証ではない |
| 9 | **OK** | オンライン回答順変更・再接続後も結果が一致する | Workerの回答順入替、部分回答JSON復元、確定結果復元、遅延操作拒否の固定テスト。実機報告とは区別 |

### 未確認事項・検証範囲

- 項目3〜8は**実機未確認**のまま保持する。自動テストの成功を実機OKに置き換えない。
- 固定局面テストはロン判定、三家和精算、リーチ宣言牌、四風連打、加槓保留、Worker回答・timeoutを対象とする。実機の全画面幅・通信状態・槓種を網羅するものではない。
- 項目9はユーザー本人がOKと報告した範囲であり、あらゆる回答順・再接続タイミングを実機で網羅したとはみなさない。
- 自動検証は実装SHA fc638eaec20c3f6f121a9245c2359a37ffd76866 の既存Actions [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)に基づく。今回の文書更新ではゲームコード・テストコードの変更や新たな実機検証は行わない。

## Close判定

- GitHubから取得したActions job一覧では verify、Chromium、WebKit、browser-ui-matrix-audit、release-freshness、Worker deploy、production-test、Pages build/deployがsuccess。意図的なskippedジョブをsuccessに数えない。
- Issue #40固定局面29件と全79テストファイルの成功は既存の検証記録に記載。各未確認項目に対応するテストケースの存在をテストコードから確認した。
- 2026-11-03のiPhone Safari実機結果は **OK 3件／NG 0件／未確認6件**。ユーザー未報告の個別条件は補完しない。
- 主要な受入仕様の実装・自動検証・公開と、報告された実機OKを総合し、**Issue #40はcompletedとしてClose可能**と判定する。特殊局面6項目は引き続き実機未確認として明示する。

## 公開記録

- 実装commit: `fc638eaec20c3f6f121a9245c2359a37ffd76866`（`main`へpush済み）。
- Actions run: [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)（全ジョブsuccess）。
- Worker: `https://heibon-mahjong-online.ak-sekine.workers.dev` — deploy成功、production-test成功、公開SHA `fc638eaec20c3f6f121a9245c2359a37ffd76866`。
- GitHub Pages: `https://ak-sekine.github.io/heibon-mahjong/` — build・deploy成功、公開SHA `fc638eaec20c3f6f121a9245c2359a37ffd76866`。
- Issue #40: completedとしてClose（実機OK 3件、NG 0件、未確認6件を記録）。
