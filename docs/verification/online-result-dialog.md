# オンライン対局の結果ダイアログ

確認日: 2026-10-22

## 原因と修正

オンラインの「結果を見る」は、結果概要への `scrollIntoView()` だけを呼んでいた。オンライン結果は `PlayerGameView.result` としてサーバーから受信していたが、既存の共通ダイアログはオフライン `MatchState` の更新だけを受け取っていたため、オンライン側から開けなかった。

オンラインでも同じ `ResultDialog` を使い、受信した公開ビューだけから和了手牌・副露・役・翻符・ドラ・点数・支払い・点数変動を描画する。流局、途中流局、流し満貫、対局終了も表示する。表示の開閉はダイアログ内に留め、ゲーム状態やサーバー操作を変更しない。オフラインの結果表示は従来の描画経路を維持する。

## 検証

- `npm test`: 53ファイル成功、53成功・0失敗。
- `npm run build`: 成功。
- `git diff --check`: 成功。
- `tests/browser-online-waiting-room.py` の Python 構文確認: 成功。
- `Browser UI verification` [run 39718729070](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39718729070): commit `517f55c1dcf2ef6c6cf3752ccf05b6b6dd80a13e` で成功。
- `tests/browser-online-waiting-room.py` は実ボタンのクリックから共通ダイアログを検査する。自ツモ、他者ロン・ツモ、自ロン、流局、対局終了について、結果詳細・閉じる・再表示・ゲーム状態不変・追加アクションなし・非公開牌IDの非表示を確認し、ホスト席とゲスト席のビューを通す。375×667と320×568のChromium画面寸法で成功。
- [Deploy run 39718729112](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39718729112) はテスト、Worker型検査、ビルド、ブラウザー検証、本番Worker検証、Pages build/deployすべて成功。公開先は https://ak-sekine.github.io/heibon-mahjong/。
- iPhone Safari実機は未確認。GitHub ActionsのChromium画面寸法検証とSafari実機検証は別扱いとする。
