# Step 13.5.2 検証記録

開始コミット：`8623d9675c223df4b36a177e45f2ebf9bc155224`（リモートmainと一致）。

## 実装範囲

- `index.html` / `kan-test.html`：同じ卓の席構成、非公開手牌の領域、中央の局情報。
- `src/rendering/table.ts`：GameStateからのCPU裏面枚数表示と宣言状態。既存の河・手牌・和了手牌の公開条件を維持。
- `src/rendering/melds.ts`：共通の公開面子描画、取得元、数字順、赤牌、加カンの重ね表示、槍槓プレビュー、暗カンの裏面。
- `src/rendering/match.ts`：局・本場・供託の中央表示。
- `src/style.css`：旧卓の配置と副露の縮小・回転ルールを整理し、4方向の卓、河、席、中央、操作領域を再構成。
- ブラウザテストと `tests/table.test.ts`：新しい裏面・寸法・取得元別の重ね表示・数字順・多副露の検証。

ルール・役・符・得点・CPU戦略・136枚管理の実装変更なし。`src/ui/call-viewport.ts`、`src/verification/style.css`、SVG牌の実装は調査後、既存の動作をそのまま利用。

## コマンドと結果

- `npm ci`：成功（16パッケージ）。
- `npm test`：40テストファイル成功。詳細は `npm-test.log`。
- `node --test --test-isolation=none tests/*.test.ts`：979件成功、失敗・skipなし。既存975件＋追加4件。`test-no-isolation.log`。
- `npm run build`：成功。`build.log`。
- `git diff --check`：成功。`diff-check.log`（出力なし）。
- `browser-kan-page.py`、`browser-step13-5.py`、`browser-step13-4.py`、`browser-call-viewport.py`、`browser-check.py`、`browser-riichi.py`、`browser-action-controls.py`、`browser-cpu-riichi.py`、新規 `browser-step13-5-2.py`：各同名ログ。

通常操作の18巡検証は `chooseRandomDiscard` を明示した固定seedを使用。途中の副露・ロン判断は実際の「見送る」「見逃す」で通過する。CPU戦略そのものの回帰は既存の単体・CPU立直ブラウザテストで維持。非公開状態とDOMは同一イベントループ内で取得して比較し、CPU進行との読み取り競合を避ける。

開発中の自動リロードはページの状態とテスト用controller参照を切り離すため、最終ブラウザ検証はHMRを無効にしたVite開発サーバー（4173番、同じbase・ソース）で実行。

## レイアウトと目視確認

Phase 1：4席と非公開手牌の代表画像 `screenshots/phase1.png` を確認。
Phase 2：槍槓プレビューの代表画像 `screenshots/phase2.png` を確認し、中央幅と宣言説明を改善。
Phase 3：320pxのチー・加カン・操作欄を確認し、短い画面の河寸法、CPU席の折り返しを調整。
Phase 4：最終の槍槓宣言、加カン結果、18枚の河、各席4面子、PC卓を確認。CPU裏面と副露は別の列とし、宣言ラベルと牌の重なりを解消。

最終画像は `screenshots/layout/` と各 `screenshots/browser-*/` に保存。初期のphase1/2画像は途中経過であり、最終版は以下を参照。

- [320px・槍槓宣言](screenshots/browser-kan-page/320-pending.png)
- [375×547・河18枚](screenshots/layout/375x547-rivers18.png)
- [375×547・各席4面子](screenshots/layout/375x547-four-melds-each.png)
- [390px・加カン結果](screenshots/browser-step13-5/390x844-kakan-result.png)
- [1280px・中央配置](screenshots/layout/1280x800-rivers18.png)

指定の320×568、375×547、375×667、390×844、414×896、430×844、1280×800で、4席の位置・手牌1行・河18枚までの位置安定・各席4面子・CPU裏面枚数・横スクロールなしを確認。既存のロン・槍槓・副露・カン候補・結果ダイアログ・新局・リセット・可視領域縮小の回帰を維持。短い画面や多数の面子／候補は安全な縦スクロールを使用。

## 実機での確認事項

iPhone Safari実機は未検証。アドレスバー展開／縮小・画面回転、ホームインジケータ、セーフエリア、候補欄へのスクロール、VoiceOverの宣言内容・フォーカス、結果内部スクロール、赤牌や重ね牌の視認性・タップを確認する。ChromiumによるvisualViewport縮小検証は実機検証を代替しない。
