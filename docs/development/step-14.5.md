# Step 14.5 — 操作欄のソースコード共通化

**実施日:** 2026-10-21
**対象:** オフライン・オンライン対局の操作欄
**状態:** 実装・ローカル検証完了。最初のmain Actionsで既存Browser UI assertionが新しい非手番表示方針と合わず失敗したため修正し、再検証中。履歴は[検証記録](../verification/step14.5/README.md)を参照。iPhone Safari実機は未確認。

## 目的と変更前の重複

操作欄のHTMLテンプレートは共通でしたが、DOMの状態更新とイベント登録は別々でした。オフラインでは`rendering/table.ts`の`renderSelection()`と`main.ts`の個別イベント登録が、オンラインでは`OnlineGameController.renderActions()`と同クラス内のイベント登録が操作ボタンを扱っていました。結果表示のボタン表示や局進行ボタンにも別の更新箇所がありました。

Step 14.5では、同じ表示になるだけの条件分岐統合ではなく、表示状態、DOM更新、イベント委譲を1つの`ActionPanel`実装へ集めました。モードごとの状態変換とゲーム操作は引き続き分離しています。

## ソース構造

| 層 | 実装 | 責務 |
| --- | --- | --- |
| 共通UI | [`src/ui/action-panel.ts`](../../src/ui/action-panel.ts) | 共通テンプレートの複製、全ボタンの表示・有効状態・文言、状態文、ロン対象、チー・ポン・カン選択肢、結果操作、クリック委譲、ロン時のフォーカス、選択肢フォーカス維持 |
| オフライン状態アダプター | [`src/rendering/local-action-panel-state.ts`](../../src/rendering/local-action-panel-state.ts) | `MatchState`と既存の合法操作関数から共通`ActionPanelState`を生成 |
| オンライン状態アダプター | [`src/online/action-panel-state.ts`](../../src/online/action-panel-state.ts) | `PlayerGameView`とサーバーが返す自分用の合法操作情報から同じ型を生成。相手の非公開手牌やクライアント側のゲーム規則は参照しない |
| オフライン操作ハンドラー | [`src/main.ts`](../../src/main.ts) | 共通イベントを既存`GameController`の打牌、和了、鳴き、カン、局進行、結果表示へ委譲 |
| オンライン操作ハンドラー | [`src/online/game-controller.ts`](../../src/online/game-controller.ts) | 共通イベントを既存WebSocket送信へ委譲。送信待ち、サーバー応答、判断期限、再接続、ホスト権限を維持 |

両モードは`ActionPanelState`へ状態を渡し、表示ルールとDOM更新は同一のクラスを通ります。ボタンのIDは既存CSS・ページ互換性のため残していますが、表示条件を分けるものではありません。

## 表示・操作ルール

- 自分の打牌手番では「打牌する」を表示し、牌未選択または処理中は無効にします。リーチ中はラベルを「ツモ切り」にします。
- リーチは選択牌で宣言可能な場合、ツモ和了・九種九牌・カンは合法な場合だけ表示します。
- ロンと見逃しは合法なロン判断窓で表示します。チー・ポン・大明カンの選択肢と見送りは判断窓・合法候補に従います。
- 暗カン・加カンの候補、キャンセル、次局、結果表示、結果終了後の戻り操作も共通状態として描画します。
- オンラインの操作送信中は該当操作を無効にします。回答済みの判断窓と期限切れでは再送を無効化し、期限表示とサーバー確定待ちを表示します。次局はホストだけが操作でき、全人間席の接続状態も有効条件に含めます。
- 選択肢内容が変化しないカウントダウン更新では選択肢DOMを再生成せず、キーボードフォーカスを保ちます。

## ゲームロジックと安全境界

オフラインは`GameController`がローカル`GameState`を更新します。オンラインはサーバーが状態を決定し、クライアントは`PlayerGameView.self`が提供する`discardableTileIds`、`riichiTileIds`、`canTsumo`、`canRon`、`kanOptions`、`callOptions`、`decision`などから表示状態を作ります。ActionPanelはゲーム状態を変更せず、通信も行いません。サーバー側の合法操作判定と権限検証は既存のままです。

`rendering/table.ts`の`renderSelection()`から操作欄のDOM更新を除去し、牌ボタンの`aria-pressed`と選択不可状態だけを残しました。局結果表示は`renderMatch()`と`ResultDialog`が担当し、結果を開くボタンや次局ボタンのDOM状態・イベントはActionPanelが所有します。

## 検証

単体テストは[`tests/action-panel.test.ts`](../../tests/action-panel.test.ts)と[`tests/action-panel-state.test.ts`](../../tests/action-panel-state.test.ts)に追加しました。通常手番、牌選択前後、リーチ・ツモ・カンの可否、ロン・鳴き判断、処理中、局終了、サーバー送信待ち・期限切れ、両モード間の状態一致を確認します。

`npm test`は52/52成功、`npm run build`は成功、Browser UI Pythonシナリオの構文解析と`git diff --check`も成功しました。初回検証で見つかった失敗と修正回数、計測値は[検証・処理時間記録](../verification/step14.5/README.md)を参照してください。GitHub Actionsはmain反映後に確認し、結果は最終報告に記録します。

ActionsのBrowser UIシナリオは既存シナリオを維持し、共通パネル、表示切替、イベント委譲、送信中・期限切れ、判断・局結果操作、320・375・390・430px、相手の非公開物理IDがDOMに現れないことを追加確認します。実際のオンライン通信とサーバー側権限検証は既存のWorker・本番通信検証を引き続き使用します。iPhone Safari実機は別途未確認です。

工程別の時刻計測には[Step 14.5処理時間記録](../verification/codex-performance/step14-5-action-panel.md)を参照してください。
