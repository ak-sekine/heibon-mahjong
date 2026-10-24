# Heibon Mahjong テスト環境

## 対象

- `test.html`を通常対局と分離したViteマルチページの検証エントリーとして追加。
- 固定局面から九種九牌（自分／CPU1／CPU2／CPU3）を宣言し、公開範囲・結果表示・次局での公開解除を確認。
- テスト配牌は通常の牌山生成・王牌予約・配牌を再利用し、対象者を親にして合法な第一ツモ状態を作成。
- CPUケースは既存のCPU自動ターン処理を使用。オンラインWorkerの状態・配牌には接続しない。

## 自動検証

- `npm test`：56件成功。
- `npm run build`：TypeScriptチェックとVite本番ビルド成功。`dist/test.html`を生成。
- `npm run typecheck:worker`：成功。
- `git diff --check`：成功。
- シナリオ単体テストで全136枚、物理牌ID一意性、各牌種4枚、王牌14枚、九種九牌成立、決定的な再生成を確認。
- GitHub Actions Browser UI verification（[run `40068681865`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40068681865)）：commit `ea0a39ff61dc84d440444df8a392137524b09bba`で成功。ChromiumとWebKitで4シナリオ、卓・結果画面の14枚と牌順、結果の再表示、次局での公開解除、320px・375px・390px・430px幅、通常版へのテスト操作非混入、既存カン検証ページを確認。
- GitHub Actions Deploy to GitHub Pages and Cloudflare Workers（[run `40068681818`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40068681818)）：同commitで全ジョブ成功。npm test、Worker型チェック、Pages build、ブラウザー検証、Workerデプロイ、既存のオンライン本番テスト、Pagesデプロイを完了。
- 初回のブラウザー実行では新規検証スクリプトのボタンID、テスト順、Playwright引数の誤りが見つかった。修正後の上記実行は成功。
- ブラウザーテストスクリプトの`py_compile`：成功。
- iPhone Safari実機の確認は未実施。

## シナリオ

各ケースで宣言前の伏せ牌、九種九牌ボタンまたはCPU自動宣言、宣言者ID、卓上と結果画面の14枚、萬子・筒子・索子・字牌順、他家の非公開、結果の再表示、次局での公開解除を確認する。

- 九種九牌（自分）
- 九種九牌（CPU1）
- 九種九牌（CPU2）
- 九種九牌（CPU3）
