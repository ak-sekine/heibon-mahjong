# Issue #17 — 喰いタンON/OFF

対象Issue: [#17](https://github.com/ak-sekine/heibon-mahjong/issues/17)。実装、既存検証、今回の仕様決定、未実施の実機確認を分けて記録します。

## 確定した仕様

- Issue #17で採用するのは喰いタンON/OFFです。既存の初期値ONを維持し、オフライン・オンラインのルール設定、保存、Worker同期、和了判定、CPU判断を使います。
- 後付けありは固定です。後付け禁止の設定や、それを理由に副露・和了を制限する判定は追加しません。
- 片和了禁止は採用しません。和了牌ごとに通常の役判定を行い、役が成立する牌では和了できます。役が成立しない牌は従来どおり和了できず、フリテン等の既存条件も適用されます。
- 後付け禁止・片和了禁止というローカルルールの存在は否定しません。判定基準の曖昧さと実装・検証コストを考慮し、HEIBON MAHJONGでは採用しません。

## 実装状況

- 喰いタン実装コミット: `4fe2da7dcce420ada6d9dbbbca3bbf5fa6bad281`。
- 検証・公開対象コミット: `46b98dfa3090d8e5b9f5ff5df3a715c708f79ad6`。
- `GameRules` schema v3で喰いタンを共通設定に追加し、初期値はONです。旧schema v1/v2、保存version 1/2、ルールJSONのない旧ルームも従来どおりONになります。
- OFFでは副露断么九を役から除き、門前断么九は維持します。副露手に別の役があれば、その役・翻数・点数で判定します。役なし・ドラのみの和了はできません。
- CPUはOFFで断么九だけを理由に副露せず、役牌など別役を狙う既存判断を維持します。
- コード調査では、後付け禁止／片和了禁止の設定、設定UI、専用ブロック判定は見つかりませんでした。ルール確認の「後付け」は固定値として表示され、完成手牌に役がある場合に和了できます。既存コードの変更は不要です。

## 自動テスト・GitHub Actions

- 喰いタン実装時の自動テスト: `npm test` 74 files、失敗0、skip 0。喰いタンON/OFFの役判定、和了可否、翻数・点数、CPU副露判断を含みます。
- CPU判断の該当assertion: [`tests/calls.test.ts`](../../tests/calls.test.ts) の `CPU call policy suppresses an otherwise pointless open-tanyao pon when kuitan is OFF` は、同じポン候補がONなら選択され、OFFなら選択されないことを検証します。同ファイルの `CPU yakuhai pon uses only own/public information and is deterministic` は喰いタンOFFの状態で役牌ポンが実行されることを検証します。前者は「断么九のみを目的とするポンをしない」、後者は「役牌など別役を狙うポンを維持する」根拠です。
- 和了・フリテンの該当assertion: [`tests/calls-scoring.test.ts`](../../tests/calls-scoring.test.ts) はロン／ツモ双方で、喰いタンONなら副露断么九のみの手が和了でき、OFFなら和了できず、別役のある手では喰いタンOFFでも和了し得点が断么九分だけ変わることを検証します。`tests/ron.test.ts` と `tests/riichi-furiten.test.ts` は役なし・ドラのみのロン拒否、河フリテン、一時・永久フリテン、複数待ちのフリテン、フリテン中もツモは可能という既存制限を検証します。
- 片和了に関しては、和了牌ごとに通常の役判定へ渡す既存処理と、待ち形・役候補を扱うテストがあります。ただし、同一の複数待ちについて「一方の和了牌だけで役が成立する」専用の固定ケースは確認できていません。この細目の自動テスト根拠は未確認です。片和了禁止の実装・制限は追加せず、役のない牌を和了不可とする既存判定とフリテン各テストを維持する範囲への影響に限られます。
- 実装時の `npm run build`、`npm run typecheck:worker` も成功しました。
- GitHub Actions [実装検証・Deploy run 41308997688](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41308997688) はoverall `success`、対象SHAは `46b98dfa3090d8e5b9f5ff5df3a715c708f79ad6` です。verify、Chromium／WebKit Browser UI、Deploy gate、Worker／Pages公開、本番オンラインスモークテストが成功し、WorkerとPagesのdeployment SHAも対象SHAと一致します。
- GitHub Actions [文書更新run 41314834110](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41314834110) はoverall `success`、対象SHAは `5f264f39f3ebdfb79be8ce7d711b73aae8a205d6` です。docs-checkは成功しました。文書のみの変更としてverify、Browser UI、Deploy gate、Worker／Pages公開のjobはskipされており、今回それらを再実行した結果ではありません。
- それ以前の検証記録コミット `79a58ef86f8141b41c03f26805a15546378532a6` については当時のコメントで文書検査成功が報告されていましたが、そのrun IDは未確認のままです。上記run 41314834110は別の対象SHAとしてActionsから直接確認しました。
- 今回も文書のみを変更し、ゲームテスト・ビルドは再実行しません。`git diff --check` と文書相対リンク確認を行います。

## iPhone Safari実機確認

2026-11-02、ユーザー本人からiPhone Safari実機確認結果の報告がありました。Chromium／WebKit自動確認とは別の結果として記録します。機種、iOSバージョン、確認時刻は報告されていません。

| # | 確認内容 | 実機結果 |
|---|---|---|
| 1 | オフライン・オンラインの喰いタン設定と初期値ON | OK |
| 2 | オフラインでOFFの維持とルール確認 | OK |
| 3 | オンラインでOFFの同期・再接続・次局・再戦等 | OK |
| 4 | 喰いタンON/OFFの和了判定 | OK |
| 5 | CPUの喰いタンOFF時の副露判断 | 未確認 |
| 6 | 片和了と既存フリテン条件 | 未確認 |

集計: OK 4件、NG 0件、未確認 2件。項目5・6は実機確認済みとは扱いません。CPU判断は前節の自動テストで対象条件を確認しています。項目6は一般的な役なし拒否・フリテン維持の自動テストと既存判定を確認していますが、複数待ちの一方だけで役が成立する専用テストは未確認です。この未確認範囲は新たな和了制限の追加を意味せず、片和了禁止を採用しない確定仕様にも変更はありません。

## 判定

喰いタンON/OFFの実装、自動テストと実装時Actions、実機での設定・同期・和了判定4項目、CPU判断の自動テスト根拠、役なし拒否と既存フリテン制限の根拠を確認しました。後付けありは固定し、後付け禁止・片和了禁止は実装対象外です。上記の実機未確認2項目と片和了の専用テスト未確認範囲を明記したうえで、Issue #17をcompletedとしてCloseします。
