# 開発用「牌表示確認」の削除 — GitHub Issue #3

- 実施日：2026-10-28
- Issue：[#3 開発用「牌表示確認」機能を削除する](https://github.com/ak-sekine/heibon-mahjong/issues/3)
- 対象コミット：[`c76c1dcc6d83165ed51cc650ecb2dbd19d562374`](https://github.com/ak-sekine/heibon-mahjong/commit/c76c1dcc6d83165ed51cc650ecb2dbd19d562374)
- 反映先：`main`

## 調査結果と変更

Issue本文にはメニュー項目とありますが、作業開始時の現行実装に「牌表示確認」というメニュー項目はありませんでした。実際の機能は、通常ページとカン検証ページの下部にある「開発用：全34種類と赤5を見る」カタログです。`src/main.ts` が牌種・赤5の牌SVGとラベルを生成し、`src/style.css` がカタログ専用表示を定義していました。この現行実装に合わせ、両ページのカタログUI、生成処理、専用CSSと不要なimportを削除しました。メニューから開く別画面やダイアログ、カタログ専用の状態管理・イベント処理はありませんでした。

変更ファイル：

- `index.html`、`kan-test.html`：カタログHTMLを削除
- `src/main.ts`：カタログ生成と専用importを削除
- `src/style.css`：`.catalog`、`#tile-gallery`、カタログ表示用ルールを削除
- `README.md`：卓の下に全牌一覧があるという案内を削除
- `tests/tile-preview-removal.test.ts`：両ページにカタログがなく、共通牌描画が残っていることを検査
- `tests/browser-test-page.py`：通常ページのメニューと通常・カン検証ページにカタログがないことを検査
- `docs/verification/README.md`、本記録：検証記録へのリンクと実行結果

`docs/ROADMAP.md` には牌カタログの項目がないため変更していません。独立した現行仕様項目もないため `docs/SPEC.md` は変更していません。河テストやカン検証機能は今回の削除対象ではありません。

## 維持した共通処理

牌モデル、`src/rendering/tile-svg.ts` のSVG生成と牌ラベル、通常対局の手牌・ツモ牌・河・副露・ドラ・結果表示、オンライン表示で使う描画処理は変更していません。専用の一覧生成だけを取り除きました。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功：64/64テスト。初回実行時は `step14-0-1.test.ts` が1度失敗しましたが、単独実行と全体の再実行で成功し、原因を特定できる再現はありませんでした。 |
| `npm run build` | 成功 |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI verification | 成功：GitHub Actions run [40625953927](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40625953927)、対象 SHA `c76c1dcc6d83165ed51cc650ecb2dbd19d562374`。Chromium／WebKit の既存 UI 回帰と追加したページ・メニューの不在確認が完了しました。 |
| Deploy workflow | 成功：run [40625954085](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40625954085)、同じ対象 SHA。verify、Browser UI、Worker deploy、本番通信テスト、Pages build、Pages deploy がすべて成功しました。 |

Browser UI では、通常ページにカタログとメニュー項目がないこと、カン検証ページにカタログがないこと、既存の卓・牌表示・局結果・CPU・オフライン・オンライン回帰シナリオを確認しました。ローカルの Chromium はリポジトリ記録済みの Codex Cloud起動制限により再試行せず、GitHub Actions の Browser UI verification を使用しました。

## 実機確認と未確認事項

- iPhone Safari実機：**実機未確認**。GitHub ActionsのChromium/WebKit結果とは区別します。

## 2026-10-28 追加調査：残存表示

追加報告された表示を調査したところ、最初の削除で対象ページを取り違えていました。`index.html` と `kan-test.html` からは既に削除済みでしたが、Vite の [`vite.config.ts`](../../vite.config.ts) は公開される `test.html` もビルド対象にしており、ここにカタログの `<details>` が残っていました。`test.html` は通常版からリンクされていない公開テスト環境ですが、URLを直接開くと表示され、`dist/test.html` にも出力されていました。HTMLの残存であり、TypeScriptの動的生成、専用CSS、またはキャッシュ由来ではありません。`src/verification/test-page.ts` にカタログ生成処理はありません。

`test.html` からマークアップを削除しました。単体テストは Vite の全 HTML entry（通常版、カン検証、テスト環境）を検査するよう拡張し、Browser UI も `test.html` を開いた直後にカタログがないことを検査します。共通牌描画と通常対局・カン検証は変更していません。

最新 `main` と本番状況：開始時の `git fetch origin` は通常実行でプロキシ接続に失敗しましたが、承認付き再実行は成功し、`origin/main` と開始時HEADはともに `70a03adab51ecb70aee3ac86362093bcaf924e48`、behind/ahead は `0/0` でした。同SHAの GitHub Pages deploy workflow run [40628586473](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40628586473) は成功です。公開URLへの直接HTTP取得は、この実行環境から HTTP 403（Envoy）で拒否され、配信HTMLのキャッシュヘッダーと本文は確認できませんでした。

今回の追加入力の検証結果・コミット・Browser UI run・push後の状態は、この節に追記します。iPhone Safari実機の再確認は未実施であり、Issue #3 はOpenのままです。
