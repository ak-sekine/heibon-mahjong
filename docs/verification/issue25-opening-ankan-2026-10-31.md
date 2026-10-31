# Issue #25：配牌直後・第一ツモ直後の暗カン

実施日：2026-10-31

作業開始時の `main` / `origin/main`：`f6749c3973acff6773c0af6a44ed905428eaacff`
Issue：[#25 配牌直後・最初のツモ直後に暗槓できない問題の調査と修正](https://github.com/ak-sekine/heibon-mahjong/issues/25)

## 原因と修正

`getKanOptions()` がツモ牌の取得元を `live-wall` / `rinshan` に限定していたため、親の配牌追加牌 `deal` を使った最初の暗カンが候補から除外されていました。Issue調査コメントは仕様とコードの不一致を確認済みでした。

配牌元が `deal` の場合は親の正当な初期局面 `isTenhouState()` を検証して候補に加えました。既存の候補選択、槍槓判断、カン成立、嶺上牌、ドラ、四開槓の処理を使用します。オンラインの表示候補とサーバー要求検証は同じ `getKanOptions()` に基づきます。

## ローカル自動検証

- `npm test`：1,301件成功、失敗・skipなし。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `git diff --check`：成功。
- Issue #25対象テスト：113件成功。親の初期14枚に候補あり／なし、親が東以外の席、複数候補、通常打牌、子の第一通常ツモ、暗カン後の嶺上牌とドラ、連続カン、四槓散了、九種九牌、リーチ後制限、オンラインの偽造要求拒否を確認。
- Browser UI：初回run [41182711028](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41182711028) は新シナリオのHTML選択肢不足でタイムアウトしました。次のrun [41184029065](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41184029065) では暗槓操作を通過し、後続テストが古い選択肢数6個を期待して失敗したため、7個に同期しました。最終run [41185324829](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41185324829)（commit `8dcfd66ccf29de3756cbc4482cb5fd1973faeab2`）は成功。暗槓UIはChromiumの320px・390px幅で10操作レイアウト成功、固定検証ページ回帰はChromiumとWebKitで成功しました。run内のWorkerデプロイ、本番テスト、Pages build、Pages deployも成功しました。
- iPhone Safari実機：未実施。ChromiumやGitHub Actionsの結果とは区別します。

## iPhone Safariでユーザーが確認する項目

公開後の[カン検証ページ](https://ak-sekine.github.io/heibon-mahjong/kan-test.html)で「親の配牌直後の暗カン」シナリオを選び、次を確認してください。

1. 配牌直後に「カン」が表示され、候補2つを選択できる。
2. キャンセル後に牌を選び、通常打牌できる。
3. シナリオを読み直して候補を選ぶと、暗カンが成立し、嶺上牌を引いてドラ表示が1枚増える。
4. 画面幅320〜390px相当で、操作ボタン・候補・手牌が重ならず、横スクロールなしで操作できる。
5. 通常のオフライン対局で、親に候補がない場合は通常打牌でき、候補がある場合は初回打牌前にカンを選べる。
6. 可能であればオンライン対局でも親の配牌直後に同じ操作候補・結果になることを確認する。

Issue #25は上記の実機確認が終わるまでOpenのままです。
