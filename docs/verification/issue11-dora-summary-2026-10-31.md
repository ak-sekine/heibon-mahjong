# Issue #11 — 和了概要のドラ合計表示（2026-10-31）

## 対象と基準

- Issue: [#11 和了結果概要に通常ドラ・裏ドラ・赤ドラの合計数を表示する](https://github.com/ak-sekine/heibon-mahjong/issues/11)
- 既存調査: `docs/verification/open-issue-investigation-2026-10-31.md` の分類C（実装待ち）を再利用しました。原因調査は繰り返していません。
- 調査対象SHA: `d607dc24e451b0ae1cf4284ccedd9ba0dd54c07b`
- 作業開始時の `main` / 更新後の `origin/main`: `141c59f2c37f2bbdf9f14fcae8d023f696435bb4`
- 調査SHA以降の関連差分: `docs/SPEC.md`、`docs/ROADMAP.md`、検証READMEの更新と、Issue #25関連の`tests/online-game.test.ts`のみでした。ドラ計算、和了概要表示、結果同期の実装変更はありませんでした。

## 実装

共通の`RoundWinSummary`に計算済みの通常・裏・赤ドラ枚数を渡し、その3値を一度ずつ合計して役名行の末尾に表示します。合計が0ならドラ表記を省略します。通常ドラや赤ドラの牌判定は再実装していません。

オフラインは`WinDetails.doraCount`、`uraDoraCount`、`redDoraCount`を渡します。オンラインは既存の`PublicWinSummary.doraCounts`をそのまま共通表示へ渡します。このデータは既にホスト・参加者向け結果に含まれ、JSON保存・復元後も保持されるため、同期形式・Worker・再接続処理は変更していません。裏ドラの有効条件も既存の和了計算結果に従います。

翻数、符数、点数、役判定、ドラ翻、詳細結果画面は変更していません。結果概要は既存の2つの段落を維持し、CSSやボタン配置も変更していません。役名の折り返しは既存の`overflow-wrap:anywhere`に委ねます。

## 変更ファイル

- `src/rendering/round-win-summary.ts` — 3種の枚数を合算し、ドラ0を省略。
- `src/rendering/table.ts` — オフライン結果から計算済みドラ内訳を受け渡し。
- `src/online/result-content.ts` — オンライン結果の既存`doraCounts`を受け渡し。
- `tests/round-win-summary.test.ts` — 通常・裏・赤の単独、組み合わせ、全種、0枚、複数役を追加。
- `tests/table.test.ts` — オフラインの通常ドラ、赤ドラのみ、通常＋赤、通常＋裏＋赤、裏ドラ無効、0枚を確認。描画前後の計算結果不変も確認。
- `tests/online-game.test.ts` — オンライン概要の表示と、結果JSON復元時のドラ内訳保持を確認。
- `tests/browser-round-end-ui.py` — 画面幅ごとの概要文期待値に計算済みドラ合計を追加。
- `docs/SPEC.md` — 2行構成とドラ合計表示を明記。
- `docs/ROADMAP.md` — Issue #11をSafari実機確認待ちとして記載。
- `docs/verification/README.md` — 本記録を追加。

既存の`tests/table.test.ts`にあった「概要の役行にドラが含まれない」という期待値は、Issue #11の表示要件を検査する合計値の期待値へ変更しました。詳細結果側の役リスト・ドラ内訳の期待値は維持しています。

## 自動検証結果

- 関連テスト: `node --test --test-concurrency=1 tests/round-win-summary.test.ts tests/table.test.ts tests/online-game.test.ts` — 3ファイル成功、失敗0、skip 0。
- 全テスト: `npm test` — 71ファイル成功、失敗0、skip 0。
- ビルド: `npm run build` — TypeScript型検査とVite production build成功。
- Browser UI: `HEIBON_CHROMIUM=/usr/bin/chromium HEIBON_SCREENSHOTS=/tmp/heibon-issue11-browser python tests/browser-round-end-ui.py` — Chromiumの6画面幅（320、355、375、390、430、1280px）すべて成功。和了結果概要、長い役名の横はみ出し、結果画面・卓の既存配置を検証しました。
- WebKit Browser UIと`tests/run-browser-regressions.py`全体 — ローカルでは未実施です。WebKitの実行ファイル導入は行っていません。main push後に既存のGitHub Actions Browser UI workflowでの結果を確認します。
- 開発中に新しい固定局面の牌交換テストで牌在庫数の失敗がありました。テストfixtureの牌交換を修正し、関連テスト・全テストで解消を確認しました。アプリ実装由来の未解決失敗はありません。

## 表示例

- 立直、通常ドラ2枚: `立直・ドラ2`
- 立直・一発、通常ドラ3枚と裏ドラ1枚: `立直・一発・ドラ4`
- ドラ0枚: `立直`

同一の赤5が通常ドラ条件も満たす場合は、既存計算の通常ドラ枚数と赤ドラ枚数の両方を合算します。ドラを役として追加したり、翻数を再加算したりしません。

## 残る確認事項

- iPhone Safari実機は未確認です。公開後、縦向きの狭い幅で2行構成、長い役名とドラ表示の折り返し、ダイアログ内への収まり、下部ボタンとの非重複、通常・裏・赤ドラ表示を確認してください。
- オンライン本番サーバーでのホスト・参加者端末間と切断後再接続の実機操作は今回行っていません。既存公開結果型、JSON復元単体テスト、Browser UIのオンライン回帰に留まります。
- WebKitローカル結果はありません。GitHub ActionsのChromium／WebKit結果はpush後に別途確認します。

Issue #11はiPhone Safari実機確認待ちのためOpenのままにします。
