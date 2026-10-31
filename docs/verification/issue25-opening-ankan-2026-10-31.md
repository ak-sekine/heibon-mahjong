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
- 実装報告時点のiPhone Safari実機：未実施。後日のユーザー確認結果は本記録末尾に追記し、ChromiumやGitHub Actionsの結果とは区別します。

## 実装報告時に予定した実機確認項目（結果ではありません）

公開後の[カン検証ページ](https://ak-sekine.github.io/heibon-mahjong/kan-test.html)で「親の配牌直後の暗カン」シナリオを選び、次を確認してください。

1. 配牌直後に「カン」が表示され、候補2つを選択できる。
2. キャンセル後に牌を選び、通常打牌できる。
3. シナリオを読み直して候補を選ぶと、暗カンが成立し、嶺上牌を引いてドラ表示が1枚増える。
4. 画面幅320〜390px相当で、操作ボタン・候補・手牌が重ならず、横スクロールなしで操作できる。
5. 通常のオフライン対局で、親に候補がない場合は通常打牌でき、候補がある場合は初回打牌前にカンを選べる。
6. 可能であればオンライン対局でも親の配牌直後に同じ操作候補・結果になることを確認する。

実装報告時点では実機確認待ちのためIssue #25をOpenにしていました。以下にその後の確認結果を追記します。

## iPhone Safari実機確認（2026-10-31）

- 検証ページ：[カン検証ページ](https://ak-sekine.github.io/heibon-mahjong/kan-test.html)
- 実機環境：iPhone Safari
- 確認者：ユーザー本人
- 確認日：2026-10-31
- 結果：カン検証ページは問題なしとの報告。
- この報告はページ全体についての総括です。個別の検証項目に明示的なOK報告はないため、各項目を個別成功として記録しません。端末機種、iOSバージョン、確認時刻も記録対象外です。

通常の対局で親の配牌直後に暗カンする操作は、実機では次のとおり未確認です。

- 通常のオフライン対局：未確認。未確認理由は、対象局面を実機で再現していないためです。
- 通常のオンライン対局：未確認。未確認理由は、対象局面を実機で再現していないためです。
- いずれも未確認を成功扱いにしません。

## 通常対局とカン検証ページの処理経路

- 候補と合法性は `src/game/kan.ts` の `getKanOptions()` に集約されています。配牌由来 `deal` の追加牌は `isTenhouState()` で親の正当な初期局面と検証された場合だけ候補になり、同じ候補関数が通常ツモ・嶺上ツモ後のカンも判定します。
- 通常のオフラインUIは `src/rendering/local-action-panel-state.ts` でこの候補を表示し、`src/main.ts` と `src/ui/controller.ts` の `GameController.kan()` から `declareKan()` へ進みます。カン検証ページは固定シナリオで局面を作りますが、通常の画面・操作と同じ候補・宣言処理を使います。
- オンライン画面は `src/online/game-view.ts` で同じ `getKanOptions()` から自分の候補だけを作ります。サーバーは `src/online/game-engine.ts` から `declareKanForOnline()` を呼び、同じ `getKanOptions()` で要求を再検証します。
- 宣言後はオンラインが参加者間の槍槓判断を待つ一方、オフラインは `declareKan()` 内でローカルの判断処理に進みます。これは対局形態に応じた判断窓の違いで、カン候補の合法性・成立後の `completeKan()` は共通です。Issue対象テストは親の配牌候補、通常打牌、子の第一通常ツモ、カン後処理、オンラインの合法要求と偽造要求拒否を確認しています。
- したがって通常対局と検証ページの間に、今回の親の初手暗カンに関する未解決の重大な候補判定・合法性差異はありません。通常対局での親の初手操作自体は、上記のとおり実機未確認です。

## 自動検証・公開結果

- 既存の実装検証記録：`npm test` は1,301件成功、`npm run build` と `npm run typecheck:worker` は成功。
- GitHub Actions [run 41185324829](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41185324829) は成功。Browser UI、Worker deploy、production test、Pages build、Pages deployの各ジョブの成功を確認しました。Browser UIのiPhone Safari実機確認とは別の自動検証です。
- GitHub Actions runの対象実装コミットは `8dcfd66ccf29de3756cbc4482cb5fd1973faeab2` です。実機報告はユーザー本人による2026-10-31の確認で、Codexによる端末操作ではありません。

上記の完了条件を満たしたため、Issue #25を完了としてCloseします。通常対局における親の初手暗カンは未確認事項として残します。
