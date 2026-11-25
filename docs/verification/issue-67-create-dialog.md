# Issue #67 オンラインルーム作成ダイアログ検証

- 基点: `d3bf9a647c4dd0ed8698e0e7cf41c07e15666f7d`。候補・統合・公開対象 SHA: `c823a8311d295453d0b51c79a5627c5fae7e0284`。
- 右上の閉じると専用参照を削除し、既存のスクロール抑止付きフォーカスをキャンセルへ移した。関連ブラウザーテストとボタン分類を更新。共通CSS・他ダイアログ・通信仕様は変更していない。SPECは現行記述と一致。
- ボタン分類の限定テスト成功。`npm test` は通常サンドボックスで Python 子プロセス起動 EPERM により失敗、許可付き実行で1601件成功。`npm run build`、`git diff --check`、変更した Python テストの構文検査成功。
- 候補 CI: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45641028603 成功。main CI・最終 audit: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45643294955 成功。両方とも Chromium・WebKit を含む。
- 本番公開: https://github.com/ak-sekine/heibon-mahjong/actions/runs/45645325439 成功。成果物再利用、Worker、オンライン、Pages、台帳確定、独立した公開後 audit が成功。台帳の本番 SHA は上記と一致し pending は null。
- 受入条件1〜6: 自動検証は成功。iPhone Safariでの表示・操作はユーザーによる実機確認待ちのため最終評価は一部達成。条件7: 自動検証・main CI・公開は成功、実機確認は未実施。自動検証を実機確認の代わりとしない。
- itch.io の手動アップロード・実機確認は未実施。IssueはOpenのまま。候補のコミット後に確定した結果はこの作業ツリー上の追記であり、まだコミットされていない。

## 追加修正：フォーカス枠（実機報告後）

- ユーザー報告：2026-11-26、iPhone Safari縦画面のGitHub Pages版で、作成画面の右上「閉じる」はなくキャンセルに初期フォーカスされるが、その水色の枠の左端・下端が欠けた。スクリーンショットは会話内で提示された。修正後の実機再確認は未実施。
- 原因：フッターの左右・下に余白がなく、フォームの `overflow:hidden` によってボタンから外側に伸びる3pxのoutlineと2pxのoffsetが切られる構造。作成側のフッターに左右・下6pxの余白を追加し、共通スタイルとスクロール制御は維持した。
- 両ボタンの実際のoutline幅・offsetを含む矩形を全祖先のクリッピング境界およびviewportと比較する回帰検証を追加。320×320、縦画面、PCを含み、代表サイズのスクリーンショットをCI成果物に出力する。
- ローカル：ボタン分類・新規対局関連テスト、Python構文検査、`npm test`（許可付き、1601件）、`npm run build`、`git diff --check` 成功。ブラウザーはAGENTS.mdに従いGitHub Actionsで実施。
- 今回の候補・main・公開SHA、CI URL、公開結果：候補push・検証前のため未確定。iPhone Safariによる修正後の実機確認はユーザーが行う。
