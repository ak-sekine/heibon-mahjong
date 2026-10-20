# Step 14.3 検証

## ローカル検証

2026-10-20に最終ソースに対して実行しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。49テストファイル、49成功、失敗0件 |
| `npm run build` | 成功。TypeScript型検査とVite production build |
| Python構文解析 | 成功。既存Browser UI用Pythonスクリプト38件 |
| `git diff --check` / staged diff check | tracked差分および全41 staged filesで成功。初回staged checkが開発ノートの末尾空白2件を検出し、1回修正後に成功 |
| Worker typecheck | Workerを変更していないため実行対象外 |

最終検証コマンドの開始・終了時刻、実行回数、終了コードは[処理時間記録](../codex-performance/ui-unification.md)を参照してください。テスト出力の一度の取得がツール上限で切り詰められたため、成功コードを保持した一度の最終再実行を記録しています。

## Browser UI verification

既存の[Browser UI verification workflow](../../../.github/workflows/browser-ui.yml)に次の実測比較を追加し、main push後のActionsで確認します。Codex Cloud内ではChromiumを起動しません。

- オンラインとオフラインの局サマリー、4席ラベル、卓、中央局・牌山・ドラ、河、操作領域、状態メッセージ、打牌ボタンの位置と寸法を320・375・390・430・1280pxで比較します。
- 4席回転、リーチ宣言牌、1・6・7・18枚の河について、牌SVGの位置・間隔・重なりを測定します。
- 右上メニューのコンパクトな見た目、44px以上のタップ領域、ルーム操作の利用条件、外側クリック・Escape・項目選択とフォーカス操作を確認します。
- オンラインCPU1・CPU2の表示名と席風を分け、ビューアー席の回転後も名前が維持されることを確認します。
- 他家の非公開牌IDがオンラインDOMに露出しないことを既存テストで確認します。

Actions run、対象SHA、Job別結果、失敗原因、再実行数は実行後にここへ追記します。iPhone Safari実機での確認は未実施です。
