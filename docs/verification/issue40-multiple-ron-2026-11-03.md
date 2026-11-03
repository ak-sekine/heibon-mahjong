# 複数ロン・頭ハネ・三家和 — Issue #40、2026-11-03

対象は [Issue #40](https://github.com/ak-sekine/heibon-mahjong/issues/40) の確定仕様です。設計の基礎は [Issue #19](issue19-unimplemented-rules-2026-11-02.md)、途中流局精算は完了済みIssue #18、GameRules v5はIssue #37、パオ精算はIssue #39の実装を使います。Issue #40はiPhone Safari実機確認を残すためOpenのままです。

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

## iPhone Safari実機確認

ユーザー本人による実機確認は未実施です。自動検証とは区別します。Issue #40をCloseする前に以下を確認してください。

1. オフライン新規対局の設定で複数ロンがON、三家和流局がOFFで初期表示され、両方を個別に変更して開始できる。
2. 対局中の「ルール確認」で確定した2設定が読み取り専用で表示され、ダイアログ開閉で局進行が変わらない。
3. 複数ロンONで2人ロン・3人ロンが成立し、複数ロンOFFでは下家→対面→上家の頭ハネになる。ロン可能でもpassした席は和了者に含まれない。
4. 三家和流局ONで3人全員が同じロン窓にロン宣言すると「三家和」と表示され、点棒・既存供託は動かず、親維持・本場+1で次の局へ進む。
5. 3候補のうち1人がロンを見送る場合や、オンラインで回答が期限切れになる場合は三家和にならない。
6. リーチ宣言牌への三家和で1,000点が差し引かれず、既存供託が持ち越されることを確認する。
7. 槍槓の回答中に槓が先行せず、ロン成立時に加槓・嶺上処理が発生しない。
8. オンラインで複数人の回答を順序を変えて送っても結果が一致し、再読み込み・再接続後も未完了回答または確定結果が復元される。

## 公開記録

- 実装commit: `fc638eaec20c3f6f121a9245c2359a37ffd76866`（`main`へpush済み）。
- Actions run: [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)（全ジョブsuccess）。
- Worker: `https://heibon-mahjong-online.ak-sekine.workers.dev` — deploy成功、production-test成功、公開SHA `fc638eaec20c3f6f121a9245c2359a37ffd76866`。
- GitHub Pages: `https://ak-sekine.github.io/heibon-mahjong/` — build・deploy成功、公開SHA `fc638eaec20c3f6f121a9245c2359a37ffd76866`。
- Issue #40: Openを維持。
