# Issue #24: 全ボタンの共通配色・状態表現

実装日: 2026-10-30
対象コミット: `77e741266547f098ad5df357415b10de4c776259`
Browser UI期待値修正: `499ebc84c4e29593423051f052665f66e7a00eae`
Browser disabled文字色期待値修正: `2a44e96025947a2161260b10fbf9d62048a83c8e`
Browser busy／disabled取得順修正: `94b4182159fb4c1acba3ec320ff2423c8689b683`
Browser spinner ring assertion修正: `e665fb175e31c22d429d12982fcec767abb20f82`
診断ログ閉じる既存320px寸法のbaseline記録: `88739a59bea09c1602e5a3d92c0fa61c39c83fad`
診断ログclose後focus復帰待機: `94b6939ba7b476384eb22c68e4fc543f7354d1d0`
Issue: [#24](https://github.com/ak-sekine/heibon-mahjong/issues/24)（Openのまま）
設計: [Issue #9 button role color design](../development/issue-9-button-role-color-design.md)

## 変更概要

Issue #9で棚卸しした56種類の操作に役割クラスを付け、CSSカスタムプロパティと共通状態規則を導入しました。メニュー、ダイアログ、待機室、対局操作、手牌、`test.html`、`kan-test.html` と検証ページの「通常対局に戻る」リンクを含みます。既存のID、`data-panel-part`、通信ペイロード、ゲームルールは変更していません。

Issue #9資料の調査基準は`aeeefe2`でした。実装開始時の最新`origin/main`は`93d56998d72cdd2594403fead0e11199fb7d5020`で、調査基準以降にIssue #8の鳴きビューポート修正が加わっていました。今回の差分はこの修正を維持し、独立した原因調査や修正を含めていません。

既存コードではルール設定確認、診断ログ消去、ルーム退出、ルーム終了に既に確認がありました。二重確認を追加せず、その確認文と影響説明を維持しました。ルーム退出時には、対局中の席がCPUへ引き継がれて対局が続行する場合を確認文に追記しています。

## 適用した分類

| 分類 | 背景 / 文字 | 適用内容 |
|---|---|---|
| A 主操作 | `#F8DC91` / `#154E3C` | 開始、確定、打牌、和了、合法な鳴き・カン候補、手牌選択、次局など |
| B 補助操作 | `#F8F7F2` / `#185640` | メニュー、戻る、閉じる、表示、コピー、キャンセルなど |
| C 見送り | `#DCE9E2` / `#185640` | 「見送る」「見逃す」。キャンセルとは区別 |
| D1 限定的な危険操作 | `#FFE7E1` / `#71382E` | 診断ログ消去、ルーム退出 |
| D2 重大な危険操作 | `#9B3028` / `#FFFFFF` | ルーム終了、進行中の対局を破棄する新規対局 |
| 無効 | `#9DA27C` / `#20352C` | native `disabled`。個別opacityを除去 |

ポン、チー、大明カン、暗カン、加カンの合法候補は全てAです。候補間に色による優先順位を設けていません。

56種類の集計はA 29、B 21、C 2、D1 2、D2 1、状態依存1（未開始・終了後A／進行中D2）です。状態依存の新規対局ボタンはAとD2のどちらか一方で表示されます。

### 状態と危険操作

- 状態優先順位は処理中 ＞ 無効 ＞ 押下・選択 ＞ 通常です。役割色は`aria-busy="true"`の間維持し、進行アイコン、`aria-busy`、既存のステータス文、native `disabled`とpending guardを併用します。
- 押下色・focus-visibleリングはサイズや位置を変えないCSS表現です。手牌選択は`aria-pressed`、背景、枠線で示し、既存の8px上移動を維持します。
- `#confirm-new-game`は対局未開始・終了後にA「新しい対局を開始」、進行中はD2「現在の対局を終了して開始」。進行中の確認には局面・点数を破棄し復元できないことを記載します。
- `returnToLocalGame`は終了・中断済みオンライン局面のDOMと表示を片付け、ローカル側をクリアして画面を戻します。`leaveRoom`／`closeRoom`を呼ばず、WaitingRoomのsessionも変更しないためBとしました。ルーム参加状態は維持されます。

## 変更ファイル

- `index.html`、`test.html`、`kan-test.html`
- `src/style.css`、`src/main.ts`、`src/ui/action-panel.ts`、`src/ui/new-game-dialog.ts`
- `src/rendering/table.ts`、`src/online/game-controller.ts`、`src/online/waiting-room.ts`
- `tests/button-roles.test.ts`、`tests/action-panel.test.ts`、`tests/new-game-dialog.test.ts`
- `tests/browser-button-roles.py`、`tests/run-browser-regressions.py`
- 既存Browser UIテストのメニュー配色・disabled文字色の期待値
- `docs/development/issue-9-button-role-color-design.md`（D1のコントラスト計算値を再計算値に訂正）

共通規則は色、境界、focus、押下、busy表示だけを担当します。既存CSSの幅、高さ、flex、折返し、ダイアログ配置、スクロールは維持しています。

## 自動テスト・build

| 検証 | 結果 |
|---|---|
| `npm test` | 成功。Node test runnerは69件、失敗0件を報告 |
| `npm run build` | 成功。TypeScript no-emitとVite production build |
| Browser UI Pythonスクリプト構文検査 | 成功 |
| `git diff --check` | 成功 |

役割分類、危険操作、新規対局A/D2切替、動的候補、処理中のbusy属性と復帰、ローカル・オンライン双方の手牌クラスを単体/DOMテストに含めています。Browser UIテストはChromiumとWebKitの両方でmanifestに登録しました。

## Browser UI

GitHub Actions `Deploy to GitHub Pages and Cloudflare Workers` run [41074039994](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41074039994) では、7シナリオ成功後、オンライン待機室のメニュー配色テストが旧来の透明背景期待で失敗しました。実装色に合わせて期待値のみ修正したコミット `499ebc84c4e29593423051f052665f66e7a00eae` をpushしました。続くrun [41074869643](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41074869643) はChromium 6件・WebKit 5件が成功した後、無効ボタン文字色について旧来の通常色期待で失敗しました。共通無効色に合わせた期待値のみ修正したコミット `2a44e96025947a2161260b10fbf9d62048a83c8e` をpushしました。run [41075893276](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41075893276) はChromium 34件・WebKit 20件が成功した後、disabledの確認色を`aria-busy`適用後に取得するテスト手順の誤りで失敗しました。disabledのcomputed styleをbusy属性付与前に採取する修正コミット `94b4182159fb4c1acba3ec320ff2423c8689b683` をpushしました。そのコミットでは、busyスピナーの空contentを表示なしと誤判定するassertionも確認したため、幅・高さ・2pxリング境界・animationを確認する修正コミット `e665fb175e31c22d429d12982fcec767abb20f82` をpushしました。run [41080251951](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41080251951) は診断ログ閉じるボタンが320px幅で60px高になり失敗しました。Issue #24開始時のmain `93d5699` に同じ `min-width:64px; min-height:44px; padding:8px 12px` があり、配色変更ではなく既存のIssue #10レイアウト範囲です。今回の変更では修正せず、狭い幅での44〜60pxの既存範囲を許容するようにテストを更新し、baseline記録コミット `88739a59bea09c1602e5a3d92c0fa61c39c83fad` をpushしました。続くrun [41084368009](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41084368009) は54件成功後、診断ログcloseイベントのfocus復帰より前にassertしたテストタイミングで失敗しました。既存のclose handlerによるfocus復帰を待つ修正コミット `94b6939ba7b476384eb22c68e4fc543f7354d1d0` をpushしました。run [41087399963](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41087399963) はChromium34件・WebKit20件が成功後、役割検査が375px時の既存診断ログ閉じるボタン64×60pxを検出しました。44px固定というテスト仮定を修正し、320〜430pxでは既存44〜60px寸法を許容、1280pxでは44pxを確認します。アプリCSSは変えていません。修正後のActions runでChromium35件・WebKit21件を再確認します。manifestは56件です。

追加した`browser-button-roles.py`は以下を5サイズ（320×568、375×667、390×844、430×844、1280×800）で確認します。

- role別computed background/文字/境界、disabledとbusyの優先、処理アイコン
- キーボード`:focus-visible`、押下色と矩形寸法不変
- メニュー、新規対局確認、診断ログの閉じる・フォーカス復帰
- 手牌選択時の8px移動、幅・手牌領域・scrollHeightの不変、disabled時の灰緑優先
- 検証画面のボタン配置と横スクロール

Codex Cloud内では既知のブラウザー起動seccomp制限のため、Browser UIをローカル起動していません。最終CIの件数はActions完了後に追記します。

## コントラスト検証

sRGB相対輝度で配色トークンを再計算しました。本文とUI境界の参考目標は4.5:1と3:1です。色計算はページ全体のアクセシビリティ適合を意味しません。

| 前景 / 背景 | 比率 |
|---|---:|
| A文字 `#154E3C` / A `#F8DC91` | 7.15:1 |
| A文字 / A押下 `#E9C66A` | 5.83:1 |
| B文字 `#185640` / B `#F8F7F2` | 8.01:1 |
| B文字 / B押下 `#E4E5D8` | 6.75:1 |
| C文字 `#185640` / C `#DCE9E2` | 6.87:1 |
| C文字 / C押下 `#C5D8CE` | 5.76:1 |
| D1文字 `#71382E` / D1 `#FFE7E1` | 7.70:1 |
| D1文字 / D1押下 `#F2C8BE` | 5.97:1 |
| D2白文字・白境界 / D2 `#9B3028` | 7.38:1 |
| 無効文字・境界 `#20352C` / 無効 `#9DA27C` | 4.91:1 |
| focus cyan `#82DCFF` / アプリ緑 `#185640` | 5.58:1 |
| 無効面 `#9DA27C` / アプリ緑 `#185640` | 3.23:1 |

D2とアプリ緑の面同士の差は約1.16:1に留まるため、白境界と対象・影響の確認文を使います。白や淡色面でのcyan focus ringは内側の濃緑リングと併用します。

## 実機確認・未確認事項

iPhone Safari、Android Chromeの実機確認は**ユーザー確認前のため未実施**です。Chromium/WebKit自動結果と実機確認を混同しません。

ユーザーに確認いただく項目:

- 新規対局確認で、未開始・終了後はA、対局中はD2になり、説明どおりに開始・キャンセルできること
- 手牌の選択枠と8px移動、打牌・リーチ・ツモ、鳴き候補のタップ、タップ後のスクロール位置
- オンライン待機の準備完了／解除、座席確定、ルーム退出・終了、連続タップ、通信遅延・失敗後の再操作
- 診断ログ消去の確認、閉じる1行表示、ダイアログを閉じた後のフォーカス復帰
- 明るさを変えた時の文字・境界・disabled・押下・focusの視認性。VoiceOver/TalkBack読み上げ

**実機検証状態: 未実施。** Issue #24はCloseしていません。最終レビューと実機確認後にCloseを判断します。
