# Issue #52 オンラインチー候補の再表示診断

2026-11-22 に Codex が、[Issue #63 の Environments CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44983368595/job/137088923405) で起きた候補取得タイムアウトを調べるため、1440×900 のオンライン `chi` ケースに診断を追加した。同じ SHA の[単独 Browser UI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44983368528/job/137088795670)と[限定診断](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44985517149/job/137095281401)では再表示と送信 1 回が成功している。タイムアウトの根本原因は未確定。

既存の `candidate-geometry-current-<browser>.json` の対象行に `chiReopenDiagnostic` を保存する。座標・ヒット先と受信イベントを照合し、候補の追加・削除件数、パネル表示、判断状態、送信回数を時系列で参照できる。監視は該当の操作領域の DOM に限り、最大 128 件・90 秒で停止する。対象要素は構造上の役割だけで識別し、対局状態は数値と真偽値に限定する。候補確定後の送信記録はアクション種別と revision のみ保存する。

候補取得のタイムアウト時は `await-reopened-candidate` と例外種別を保存する。操作欄の失敗画像 `<browser>-1440x900-online-chi-diagnostic-failure.png` は卓と候補牌画像をマスクする。JSON は既存の `candidate-frame-*` と `browser-ui-*`、失敗画像は `browser-ui-*` に含まれる。診断の取得エラーは診断内に記録し、既存のテストエラーを再送出する。

ローカルでは Python と観測スクリプトの構文、テスト選択 19 件を検証した。テスト用の代替ページで、制御したタイムアウトからイベント・DOM JSON とマスク付き画像の保存処理に到達し、観測の取得が例外を投げた場合も最初の例外が維持されることを確認した。この検証は WebKit でのゲーム不具合の再現を含まない。
