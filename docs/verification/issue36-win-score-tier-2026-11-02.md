# 和了結果の点数区分 — Issue #36、2026-11-02

## 変更

- 共通の和了概要に計算済みの `scoreTier` を渡し、満貫未満は従来どおり翻数・符数、満貫から三倍満は翻数と区分、数え役満・役満系は区分のみを表示します。
- 区分名は既存の `yakumanCount` と `yakumanMultiplierName()` を使います。数え役満は `kazoe-yakuman` を使い、翻数から区分を再判定しません。
- オンラインの「獲得点数」も共通の区分名を使います。符の内訳、役名、ドラ合計、精算点数・支払いは維持し、Issue #37で決定した「合計：ダブル役満」などの合計ラベルも変更していません。
- 点数計算、役判定、ローカルルール、通信スキーマ、Workerの対局進行は変更していません。

## 変更ファイル

- `src/rendering/round-win-summary.ts`
- `src/rendering/yakuman-display-name.ts`
- `src/rendering/table.ts`
- `src/online/result-content.ts`
- `tests/round-win-summary.test.ts`
- `tests/table.test.ts`
- `tests/online-game.test.ts`
- `tests/browser-round-end-ui.py`
- `tests/browser-step13-6.py`
- `tests/browser-step13-7.py`
- `tests/browser-step13-9.py`
- `tests/browser_score_labels.py`
- `docs/SPEC.md`
- 本検証記録

## 表示仕様

| 計算結果 | 和了概要 |
| --- | --- |
| 3翻40符 | 3翻 40符 |
| 4翻30符 | 4翻 30符 |
| 3翻70符、4翻40符 | 3翻 満貫、4翻 満貫 |
| 5翻 | 5翻 満貫 |
| 6〜7翻 | 翻数＋跳満 |
| 8〜10翻 | 翻数＋倍満 |
| 11〜12翻 | 翻数＋三倍満 |
| 数え役満 | 数え役満 |
| 通常役満・複合役満 | 役満倍率名（役満、ダブル役満、トリプル役満など） |

点数は従来の勝者別計算・精算値をそのまま表示します。詳細画面の符と符の内訳は残しています。

## 自動検証

- Codex Cloud: `npm test` — 76 test files pass、0 fail。
- Codex Cloud: `npm run build` — TypeScript checkとVite build success。
- Codex Cloud: `npm run typecheck:worker` — success。
- Codex Cloud: Browser UIスクリプトの `py_compile` — success。Chromiumは既知の実行環境制約があるためローカル起動していません。
- GitHub Actions run [#557、commit `a8e0c295`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41481268891): verifyとWebKitがsuccessし、Chromiumのround-end UIもsuccessしました。後続の `browser-step13-6.py` が旧「翻数・符数」期待値で失敗しました。表示仕様変更に合わせてstep 13.6／13.7／13.9の期待値を更新しました。
- GitHub Actions run [#558、commit `99944ed716b0f949070e361759d5443267b808f6`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41483482522): **success**。verifyは自動テスト1,358件（pass 1,358、fail 0）、Worker型チェック、buildがsuccess。Browser UIはChromium・WebKitともsuccessし、matrix auditもsuccess。
- run #558のBrowser UIでは、既存の `browser-round-end-ui.py` が320pxを含む各幅で結果概要、長い役名・ドラ合計の横はみ出し、点数の配置、「局の結果」詳細への遷移を確認しました。Chromiumのround-end UIは94.445秒、WebKitは199.764秒でpassしました。Chromiumのstep 13.6、13.7、13.9もpassしました。

## 公開結果

- Deploy gate、release freshness: success（run #558）。
- Worker deploy: success。公開URLは <https://heibon-mahjong-online.ak-sekine.workers.dev>。production test（HTTPS、ルーム、WebSocket、再接続、認証、プライバシー）success。
- Pages buildとdeploy: success。Actionsが報告した公開先は <https://ak-sekine.github.io/heibon-mahjong/>。
- Worker／Pagesそれぞれの deployment-state `recorded_sha` は `99944ed716b0f949070e361759d5443267b808f6` です。実装コミット `a8e0c295c15d5fe5527a8bdb17746f88ab9e9b1b` とUIテスト期待値修正 `99944ed716b0f949070e361759d5443267b808f6` をmainへ直接pushしました。PRは作成していません。

## iPhone Safari実機確認（2026-11-03）

ユーザー本人からiPhone Safariでの確認結果の報告を受領。**OK 6件、NG 0件、未確認 1件**。端末機種、iOSバージョン、確認時刻は未報告のため補完しません。

| # | 報告された確認項目 | 実機結果 |
| --- | --- | --- |
| 1 | 満貫未満では翻数・符数が従来どおり表示される | OK |
| 2 | 満貫・跳満・倍満・三倍満では区分が表示され、符数が省略される | OK |
| 3 | 数え役満・通常役満・複合役満では翻数・符数が省略される | **未確認** |
| 4 | 親子・ロン・ツモで点数表示に問題がない | OK |
| 5 | 長い役名やドラ合計が重ならず表示される | OK |
| 6 | 「局の結果」で符の内訳を確認でき、卓へ戻れる | OK |
| 7 | オンラインでも同じ点数区分が表示される | OK |

### 自動検証との照合と残る未確認範囲

- `tests/round-win-summary.test.ts` の共通表示テストに、満貫未満、3翻70符・4翻30符／40符の満貫境界、満貫・跳満・倍満・三倍満、数え役満、単独役満、ダブル役満、複合3倍役満の期待値が定義されています。数え役満と役満系の表示文字列についてはコード・単体テストの根拠がありますが、**今回のiPhone Safari実機では未確認**です。
- 3翻70符・4翻30符／40符など個々の満貫境界局面は、今回の実機報告で個別に再現したとの報告がありません。実機の「満貫未満」「満貫以上」のOKを個別境界条件の実機OKには読み替えません。
- GitHub Actions [run #558](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41483482522) ではverify、Chromium、WebKit、matrix audit、release freshness、Worker deploy、production test、Pages build／deployのジョブがsuccess。自動テスト1,358件の成功、320pxを含むBrowser UIの検証内容は上記「自動検証」節に記録済みです。これらを実機結果と混同しません。
- iPhone Safariの端末幅320px相当や個別の役満系局面の表示は、今回の実機報告では未確認のままです。

### Close判定

**Issue #36の実装・検証は完了条件を満たすため、`completed`としてCloseする。** ユーザー報告の実機OK 6件・未確認1件と、未確認部分を補完する表示テスト・Chromium／WebKitの検証成功を総合した判定です。役満系のiPhone Safari実機確認ができたとは記載しません。

本更新は検証文書の追記であり、アプリ実装・テストの再実行は行っていません。文書更新後のGitHub Actions結果は別途確認が必要です。
