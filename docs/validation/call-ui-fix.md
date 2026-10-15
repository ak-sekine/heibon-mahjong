# 副露選択UI修正の検証

- 表示用候補だけを牌種・赤牌・副露種別で重複排除。代表候補のIDをそのまま実行する。
- `getCallOptions` の物理牌組み合わせ列挙、CPU選択、副露優先順位、喰い替え、得点処理は変更なし。既存の物理組み合わせ数のテストも維持。
- 通常フローの配置を維持し、副露開始・visualViewport resize/scroll・window resizeで操作領域を自動表示。可視領域のみが縮む場合は副露中だけページ末尾にスクロール余白を追加。

## 成功した検証

- `npm test`（38ファイル、失敗0）
- `npm run build`
- `python tests/browser-call-viewport.py`
  - Chromium、320/375/390/430px幅。
  - 高さ844/564/448px、選択中にさらに80px縮小・復元。
  - レイアウト領域844pxを保ったままvisualViewportだけ484/404/700pxへ変更、offsetTop 0/24/40pxも模擬。
  - 副露開始後、クリック前に候補全体と見送りの可視性・44px以上の高さ・横溢れなし・卓との重なりなしを検証。
  - 重複チー、異なる順子、赤牌選択、重複ポン、候補実行、見送り。
- `python tests/browser-step13-4.py`
  - 既存7画面サイズの副露・副露後打牌・CPU進行・4席副露表示・副露ロン/ツモが成功。
- `git diff --check`

## 既存テストの制約と未検証事項

- `tests/browser-action-controls.py` は86行目の「立直 1翻」期待で失敗。修正前のmain（6b0fe30）を別worktree・別サーバーで実行しても同じ箇所で失敗することを確認。今回の変更に起因しない既存の失敗として記録。通常操作の単体テストと上記副露ブラウザ回帰は成功。
- 実機iPhone Safariは未検証。実アドレスバーの展開・収納アニメーション、実safe-area/home indicator、Safari固有のスクロールイベント順序は実機確認が必要。Chromiumの可視領域模擬を実機確認としては扱わない。
