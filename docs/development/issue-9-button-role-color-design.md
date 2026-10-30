# Issue #9: 全ボタンの役割分類と共通配色ルール

調査日: 2026-10-30

調査基準: `origin/main` `aeeefe283fd69eebe4efbcbbc592b6a06eab0c82`
対象: オフライン・オンラインの製品画面、診断UI、`kan-test.html` と `test.html` の開発・検証画面

## 1. 調査範囲と数え方

### 確認した事実

- Issue #9 はOpen。Issue本文を確認し、コメントは0件だった。
- `index.html` に45個、`kan-test.html` に19個、`test.html` に20個の `<button>` 宣言がある。合計84宣言には、同じゲーム操作テンプレート12個が3ページに繰り返し記述された36宣言を含む。
- 共通テンプレートを1組として、ページ別のボタン位置を数えると60箇所（本体33、カン検証7、総合検証8、共通テンプレート12）。本体ではそのテンプレートをローカル用とオンライン用に複製し、57個の固定DOMボタン（非テンプレート33＋複製24）になる。検証ページを含めた固定DOMボタンは96個（57＋19＋20）。`<template>` 内の元ノードは画面表示数に含めない。
- **役割分類の単位は56種類**。HTMLのIDと共有 `data-panel-part` を基準にし、開発画面で同一IDながら処理が異なる局面ロードを分け、動的な候補5種（ポン、チー、大明カン、暗カン、加カン）と手牌タイル選択を加えた。種類数と表示位置・DOM数は別の値である。
- 実際に同時に表示される数は固定ではない。メニュー・モーダル・結果・待機室の表示条件に加え、手牌タイル数、候補数、ローカル／オンラインの切替で変わる。56種類が常時表示される意味ではない。
- ボタン相当のナビゲーション要素は検証ページのリンク「通常対局に戻る」1箇所。`role="button"` を付けた非button要素や、独自クリック可能なdivは確認できなかった。ルール選択のradio、検証シナリオのselect、役詳細のsummaryはネイティブの別種コントロールとして配色棚卸しから区別した。
- CSSの候補色はソース内の宣言を確認した値。各ブラウザーでの計算済みスタイル・画面色は今回の実行環境で測定していない。

### 関連Issueとの境界

- Issue #8 は鳴き画面の操作不能・スクロール原因調査。`docs/verification/call-scroll-diagnostics-issue8-2026-10-30.md` とROADMAPによればスクロール補正経路の修正・実機再確認は最新mainまでに完了しているが、鳴きボタン不応答の根本原因は未特定でIssueはOpen。今回その原因調査・修正は行わず、候補ボタンの意味分類と回帰確認項目だけを扱う。
- Issue #10 は診断ログの「閉じる」がiPhone Safariで折り返される事象の調査・修正。今回確認したCSSでは `.diagnostic-header` はflex、閉じるボタンには `min-width:64px` がある一方、`white-space:nowrap` や `flex:none` の指定は見当たらない。これだけでIssueの原因を確定せず、修正もしない。
- Issue #12/#13 は対局結果とオンライン連続対局の仕様。将来のボタン表示・遷移に影響し得るが、それらの作業は取り込まない。
- 待機室・鳴き画面の既存スクロールや操作不能の修正は本資料の対象外。
- 既存資料として `docs/ROADMAP.md`、`docs/verification/README.md`、`docs/verification/call-scroll-diagnostics-issue8-2026-10-30.md`、`docs/verification/online-dialog-close-2026-10-26.md`、`docs/verification/codex-performance/online-waiting-dialog.md` と関連画面のBrowser UI記録を参照した。オンライン作成・参加・待機dialogの「閉じる」は過去にiPhone Safariで1行表示を確認済み。今回の診断dialog「閉じる」や全ボタン配色の実機確認を意味しない。

## 2. 全ボタン一覧と分類

分類記号: **A** 主操作、**B** 補助操作、**C** 非実行・見送り、**D1** 影響範囲が限定された危険操作、**D2** 対局・ルーム等への重大な影響。役割分類は提案であり、現行配色の意味を示すものではない。無効・処理中は役割とは別の状態として記録する。

現行色欄の略記は §3 のトークン表を参照。複数要素に共通する色・擬似状態の有無は下の表と次節に記した。

| # / 種類 | 画面・表示条件 | 表示文字列・状態変化 | 実行処理 / 実装箇所 | 現行CSS・色 | 現行状態 | 提案分類・確認事項 |
|---|---|---|---|---|---|---|
| 1 `#main-menu-toggle` | 全画面のヘッダー | アイコン。aria-label「メニューを開く／閉じる」 | `MainMenu.open/close` — `src/ui/main-menu.ts` | `.main-menu-toggle`: dark-green/cream; アイコン yellow | `aria-expanded` とhiddenメニューを切替。cyan focus | B。ナビゲーション。アイコンに開閉状態を示す形状・ariaを維持 |
| 2 `#new-game` | メニュー。オンライン対局中はメニュー項目から使わない | 「オフラインで新規対局」 | `NewGameDialog` で確認ダイアログを開く — `src/ui/new-game-dialog.ts` | `.main-menu-items button`: 透明、green文字。hover淡色 | disabled規則はあるが、このボタンの現在の無効化は確認できない | A。新規開始の入口。オンライン作成・参加と同格の主導線として扱う案 |
| 3 `#menu-offline-rules` | オフライン対局中のみ | 「ルール確認」 | `src/main.ts` listener → `openReadOnlyRules` | メニュー共通（透明/green） | hidden条件あり。結果なし | B |
| 4 `#river-test-open` | 開発時のみ。通常はhidden | 「河テスト」 | `src/main.ts` のテスト画面遷移 | メニュー共通 | hidden。開発設定に依存 | B。利用者向け主導線ではない |
| 5 `#online-create-open` | メニュー | 「新しくルームを作る」 | `WaitingRoom` constructor listener → 作成ダイアログ | メニュー共通 | 接続先未設定でも入口自体は表示 | A。オンライン参加と並ぶ入口 |
| 6 `#online-join-open` | メニュー | 「ルームに参加する」 | `WaitingRoom` constructor listener → 参加ダイアログ | メニュー共通 | 入力は次のフォームで検査 | A。作成と同じ階層の選択肢 |
| 7 `#menu-room` | ルームセッション中 | 「ルーム操作」 | `WaitingRoom.openRoomDialog` | メニュー共通 | セッション状態に応じてhidden | B |
| 8 `#menu-diagnostics` | 全画面のメニュー | 「診断ログ」 | `initializeDiagnostics` — `src/online/diagnostics.ts` | メニュー共通 | なし | B |
| 9 `#online-create-close` | ルーム作成ダイアログ | 「閉じる」 | `WaitingRoom.closeEntryDialog` | `.online-dialog .online-dialog-close`: white/green | ダイアログclose時にメニューへfocus復帰 | B。画面を閉じるだけでルーム退出ではない |
| 10 `#online-create-rules` | ルーム作成ダイアログ | 「ルール設定」 | `RuleSettingsDialog.open` — `src/ui/rule-settings.ts` | `#online-create-rules`: dark-green/white | なし | B |
| 11 `#online-create` | 作成フォーム | 「ルームを作成」 | submit listener → `WaitingRoom.createRoom` | `.online-dialog button`: yellow/green | 初期disabled。`updateFormAvailability` が入力・送信中・接続状態で更新 | A。無効時のopacity共通化が必要 |
| 12 `#diagnostic-close` | 診断ログdialog | 「閉じる」 | `initializeDiagnostics`: dialog.close | `#diagnostic-dialog button`: yellow/green | ESCも閉じる。閉じたらメニューへfocus復帰 | B。折返しはIssue #10の調査範囲 |
| 13 `#diagnostic-copy` | 診断ログdialog | 「コピー」 | `copyText` → clipboard / fallback | 診断ボタン共通: yellow/green | 非同期結果をstatusに表示。連続クリック防止は見当たらない | B。成功・失敗を文字でも通知 |
| 14 `#diagnostic-clear` | 診断ログdialog | 「クリア」 | confirm後に `log.clear()` | 診断ボタン共通: yellow/green | `window.confirm`で確認 | D1。現在は他の診断ボタンと同色 |
| 15 `#online-join-close` | ルーム参加ダイアログ | 「閉じる」 | `WaitingRoom.closeEntryDialog` | online close共通: white/green | close後focus復帰 | B |
| 16 `#online-join` | 参加フォーム | 「参加する」 | submit listener → `WaitingRoom.joinRoom` | online dialog共通: yellow/green | 初期disabled。表示名・コード・送信中・接続条件で更新 | A |
| 17 `#online-close` | オンライン待機dialog | 「閉じる」 | `WaitingRoom.closeDialog` | online close共通: white/green | dialogを閉じる。退出処理ではない | B。#online-leaveとの意味を視覚的に分ける |
| 18 `#online-copy-code` | 待機室のルーム情報表示時 | 「コピー」 | `WaitingRoom.copyRoomCode` | yellow/green。`#online-copy-code` が幅・字サイズを上書き | 結果メッセージあり。重複呼出しの見た目上の抑止なし | B。完了フィードバックを保つ |
| 19 `#online-confirm-rules` | 待機室 | 「ルール確認」 | `openReadOnlyRules` | `#online-confirm-rules`: dark-green/white | readonly dialogを開く | B |
| 20 `#online-ready` | 待機中に本人の席が確定 | 「準備完了」⇄「準備を解除」 | `WaitingRoom.toggleReady` → `sendAction` | `#online-actions button`: yellow/green | 接続なし・pending時disabled。送信中は `cursor:wait`、opacity 0.6 | A。ラベルと準備状態表示を併用。両方の状態を確認 |
| 21 `#online-finalize` | ホスト、待機中 | 「座席を確定」 | `sendAction({type:'finalize-seats'})` | online actions共通: yellow/green | 全人間が接続・準備済みでない、socketなし、pending時disabled | A。全員準備完了を理由テキストでも説明するか要判断 |
| 22 `#online-start-game` | ホスト、座席確定後 | 「オンライン対局を開始」 | `sendGameAction({type:'start-game'})` | online actions共通: yellow/green | 人間全員の接続・socket・pendingでdisabled。既存CSS `opacity:.55` も適用 | A。既存のdisable opacity規則が重複 |
| 23 `#online-reconnect` | セッションはあるが接続が再接続待ち | 「再接続」 | listener → `WaitingRoom.connect` | online actions共通: yellow/green | socket OPEN後hidden。pending時の扱いはrender状態依存 | A。主操作として再接続中を明示 |
| 24 `#online-leave` | セッションあり、ルームclosedでない | 「ルームを退出」 | `WaitingRoom.leaveRoom` | `#online-leave,#online-close-room`: white/red文字、薄赤border | pending・socketなし時disabled | D1。参加者本人が退出しCPU引継ぎ等が起こり得る。#online-closeとは影響差あり |
| 25 `#online-close-room` | ホスト、room未終了。対局進行中は対局終了後まで隠れる | 「ルームを終了」 | `WaitingRoom.closeRoom` | leaveと同じwhite/red文字 | pending・socketなし時disabled | D2。ルーム全体に影響するため強い危険表現・確認が妥当。現在はleaveと同色 |
| 26 `pass-call` | 自分が鳴き判断の対象 | 「見送る」 | action panel → local `GameController.passCalls` / online `sendDecision(pass-call)` | `.control-action-button`: yellow/green | legal window以外hidden、pending/期限切れ等でdisabled | C。鳴き実行ではない明確な見送り。通常キャンセルとは区別 |
| 27 `cancel-kan` | 自分の暗カン／加カン候補一覧を開いた時 | 「キャンセル」 | `ActionPanel.onClick` → 候補選択を閉じる | action button共通: yellow/green | 選択状態のみを閉じ、局面を進めない | B。pass-callと同色にしない |
| 28 `ron` | ロン判断窓、ロン可能時 | 「ロン和了」 | local controller / online `sendDecision(declare-ron)` | action button共通: yellow/green | 窓・期限・進行中状態に応じる | A |
| 29 `pass-ron` | ロン判断窓 | 「見逃す」 | local `passRon` / online `sendDecision(pass-ron)` | action button共通: yellow/green | ロン可能・未回答・未期限切れ時だけ有効 | C。見逃しは戦術上の意思決定。キャンセルではない |
| 30 `discard` | 自分の手番 | オフライン「打牌する」等。オンライン「打牌する」⇄「ツモ切り」 | local `GameController.confirm`; online `OnlineGameController.handleAction` | action button共通: yellow/green | 牌未選択・他手番・action pending時disabled/hidden | A。手牌タイル選択は別の選択状態 |
| 31 `riichi` | 宣言可能な牌を選んだ自分の手番 | 「リーチ」 | local `GameController.declareRiichi`; online action送信 | action button共通: yellow/green | 候補牌・手番・pending条件 | A |
| 32 `kan-toggle` | 自分の手番にカン候補がある | 「カン」 | 候補パネル開閉（local `localKanChoicesOpen` / online controller） | action button共通: yellow/green | 候補なし・pendingでhidden/disabled | A。押すと確定せず候補を選ぶ導入操作 |
| 33 `tsumo` | ツモ可能な自分の手番 | 「ツモ和了」 | local / online tsumo action | action button共通: yellow/green | 条件不成立/pending時hidden/disabled | A |
| 34 `kyuushu` | 九種九牌成立可能な局面 | 「九種九牌」 | local / online abortive draw | action button共通: yellow/green | 条件不成立/pending時hidden/disabled | A。実行前の意味を操作説明でも確認 |
| 35 `show-result` | 局結果が利用可能 | 「結果を見る」 | `ResultDialog.open` | action/result共通: yellow/green | 見られない間hidden | B。閲覧のみで局を進めない |
| 36 `next-round` | 局終了後、次局へ進める状態 | 「次の局へ」⇄オンライン「他のプレイヤーを待っています…」 | local `nextRound`; online `send(next-round)` | action/result共通: yellow/green | ready済み・pending時disabled/label変化 | A。オンラインは待機中ラベルが処理状態の手掛かり |
| 37 `return-local` | オンラインmatch-ended/aborted | 「ローカル卓へ戻る」 | online `returnToLocalGame` | action/result共通: yellow/green | 終了・中断時のみ表示 | B案。終了後の表示切替。ルームセッションへの影響は要確認 |
| 38 動的 `select-call` | 鳴き候補が1つ以上ある時 | 「ポン」「チー」「大明カン」＋牌画像、候補ごとに牌が変わる | `ActionPanel.renderOptions`; click → local `GameController.call` / online `send` | `.control-option-button`: yellow/green | 選択肢別enabled。pending等でdisabled | A。複数候補が同等の合法手なら全候補A。見送りはC |
| 39 動的 `select-kan` | 暗カン／加カン候補がある時 | 「暗カン」「加カン」＋牌画像、候補で牌が変わる | `ActionPanel.renderOptions`; click → local/online kan action | `.control-option-button`: yellow/green | 候補別enabled、pendingでdisabled | A。複数候補すべて同じ主操作階層 |
| 40 動的 `tile-choice` | 自分の手牌が表示される | 牌の図柄とaria-label。選択時に牌を上へ8px移動 | local `renderSelf/tileButton`, `GameController.select`; online `renderHandButton`, click delegation | `.tile-choice`: transparent。pressedにyellow background/outline | disabled、`aria-pressed`; online `.selected`も付与 | A（手牌から捨て牌を選ぶ主操作の選択段階）。牌の形・移動とoutlineを維持 |
| 41 `#view-table` | 局結果dialog | 「卓を見る」 | `ResultDialog.close` | result button共通後に `#result-dialog #view-table`: dark-green/white | focus時result dialog規則。close後結果ボタンへfocus | B。共通B色へ移行する候補 |
| 42 `#result-new-game` | オフラインの対局終了結果 | 「新しい対局」 | `NewGameDialog` を開く | result button共通: yellow/green | `match-ended` 以外hidden | A入口。次の確認で既存ゲーム状態は消えるため遷移を明記 |
| 43 `#new-game-rules` | 新規対局確認dialog | 「ルール設定」 | `RuleSettingsDialog.open` | `.rule-settings-open`: dark-green/white | なし | B |
| 44 `#cancel-new-game` | 新規対局確認dialog | 「キャンセル」 | `NewGameDialog.cancel` | `#new-game-dialog button`: dark-green/white | close後triggerへfocus | B。既存の局を継続 |
| 45 `#confirm-new-game` | 新規対局確認dialog | 「新しい対局を開始」 | close後 `newGame` callback | `#new-game-dialog #confirm-new-game`: yellow/green | dialog open時のみ処理 | **A/D2 状態依存**。未対局時はA、進行中の局を破棄する時はD2候補。質問文は状態に応じて変化するがボタン色は現状固定。表示条件・役割を一緒に判断する |
| 46 `#cancel-rule-settings` | ルール設定dialog | 「キャンセル」 | `RuleSettingsDialog.cancel`。draftを破棄 | `.online-dialog button`: yellow/green（dialogは`.online-dialog` class）。専用のB色overrideなし | dialog close、確定値は維持 | B。confirmと同色になる現状不整合 |
| 47 `#confirm-rule-settings` | ルール設定dialog | 「設定を確定」 | `RuleSettingsDialog` listener → commit・summary更新 | `.online-dialog button` と `.rule-settings-actions #confirm-rule-settings`: yellow/green | dialog open時に有効 | A。cancel側との色差を導入する候補 |
| 48 `#online-rules-close` | read-onlyルールdialog | 「閉じる」 | `openReadOnlyRules` が設定する `onclick` → dialog.close | `.online-dialog .online-dialog-close`: white/green | close時triggerへfocus | B |
| 49 `#load-scenario`（kan-test） | カン実機検証ページ | 「固定局面からやり直す」 | `src/verification/test-page.ts` scenario load | `src/verification/style.css` `.kan-lab button`:配色の上書きなし、アプリCSSを継承 | hidden解除されるケースあり | A、開発・検証画面専用 |
| 50 `#start-cpu-kan` | カン検証ページ、CPU加カンfixtureを使う時 | 「CPUの加カンを開始」 | `src/verification/test-page.ts` | `.kan-lab button`は寸法規則のみ | 初期hidden | A、検証専用 |
| 51 `#load-scenario`（test） | 総合テストページ | 「テスト開始」 | `src/verification/test-page.ts` → `startScenario` | `.test-actions button` 寸法規則。色は共通アプリCSSから継承 | シナリオ入力条件はselect側 | A、49とは文言・処理が異なるため別種類 |
| 52 `#repeat-scenario` | 総合テストページ、シナリオ開始後 | 「同じシナリオを再実行」 | `src/verification/test-page.ts` | `.test-actions button` | 表示条件はページ状態 | A、検証専用 |
| 53 `#start-river-test` | 総合テストページ | 「選択した局面から開始」 | `src/verification/test-page.ts` river scenario | `.test-actions button` | count select値で処理が変化 | A、検証専用 |
| 54 検証ページ `#new-game` / `#view-table` / `#result-new-game` / `#cancel-new-game` / `#confirm-new-game` | `kan-test.html` と `test.html` に各ボタンあり | 本体と同じ文字列・状態条件 | 本体と同じ `NewGameDialog` / `ResultDialog` | 本体と同じID規則。検証ページでは `.kan-lab` / `.test-actions` 以外の包括色規則も適用 | 条件に応じてhidden。結果 | **独立種類に重ねて数えない**。追加表示箇所各ページ5つ。別CSSの漏れを後続検証 |
| 55 検証ページ action template（12種類） | 各検証ページにlocal用panelが1組 | §26–37のラベル・状態 | 同じ `ActionPanel` と local handler | `src/style.css` の同じclass | 同じ状態条件 | 表示箇所追加: 各ページ12 slots。種類数は追加しない |
| 56 `kan-test.html` の「通常対局に戻る」`<a>` | カン検証ページ | 「通常対局に戻る」 | 通常画面へのページ遷移 | `src/verification/style.css` のリンクルール。現行色は同ファイル・アプリCSSの継承を含め未測定 | ブラウザー標準リンク状態 | B相当のナビゲーション。ボタン共通classに含めずリンク要件を別途決める |

**分類集計（種類単位、要確認のA/Dは別枠）:** A 29、B 21、C 2、D 3、状態依存 A/D 1。合計56種類。別途、動的候補ボタンの実表示数は0〜候補数、手牌選択ボタンは局面により変化する。

注意: #54/#55は追加の種類ではなく、他行で集計済みの定義の別ページ表示位置である。表示箇所数には含めるが、種類数を重複加算しない。

### 重点操作

| 操作 | 確認事実 | 分類案 |
|---|---|---|
| 準備完了／解除 | 同じ要素の文言がready状態で切替。接続・pending状態はdisabled | A。切替方向はラベルとseat statusの両方で示す |
| 座席を確定 | ホスト限定。全人間の接続・ready成立までdisabled | A。無効理由をテキストでも示すか決める |
| コピー | 待機室に1ボタン、診断に1ボタン。後者は非同期結果statusあり | B。待機室側もコピー成功・失敗を伝える |
| 閉じる | 作成・参加・待機・診断・ルール確認で計5つの本体配置 | B。UIを閉じる操作。退出とは意味も色も分ける |
| ルームを退出 | 接続/pending状態でdisable。参加者自身を退出させる | D1 |
| ルームを終了 | ホストのみ。進行中の対局では通常隠れる | D2。退出より高い影響度。独立した強い視覚・確認を提案 |
| ポン／チー／大明カン | `createOnlineActionPanelState` は全合法候補を生成、`ActionPanel.renderOptions` で候補ボタンを動的に作る | 全てA。同等レベルの合法な実行候補を色で優先順位付けしない |
| 暗カン／加カン | 自分の手番に別候補ボタンを動的生成 | 全てA |
| ロン／見逃す | 同じロン判断グループ内に配置 | ロンA、見逃すC |
| 鳴きの見送る／カン候補のキャンセル | 「見送る」は判断窓へ応答して鳴かない。「キャンセル」は候補一覧を閉じる | 見送るC、キャンセルB。役割・状態とも分ける |

## 3. 現行CSSと色の不整合

### 確認した現状

- 主操作色として多くの箇所で `#ffda7d` 背景、`#154e3c` 文字、`#fff5d7` border を使用。場所別に `.control-action-button`、`.control-option-button`、`#result-dialog button`、`#diagnostic-dialog button`、`.online-dialog button` が独立している。
- disabled色は `.control-action-button:disabled` のみ `#d4e5db`。メニューはopacity `.55`、optionは`.6`、オンラインdialogは`.52`、オンラインactionsは`.6`、開始ボタンには`.55`がある。意味・明度が一致しない。
- `:active` 共通規則は見当たらない。キーボード `:focus-visible` は主に `#82dcff` だが、offsetは2pxと内側-3pxが混在し、適用範囲もばらつく。
- 選択表示は主に牌ボタンだけ。`.tile-choice[aria-pressed="true"]` はyellow背景、outline、8px上移動。オンラインでは`.selected`も付ける。通常のaction button全体に共通の選択状態表現はない。
- 処理中はオンライン待機ボタンをdisabledにし、cursor:wait/opacityで表す。対局action panelはaction status文を更新してボタンdisabledを反映する。共通busy表現・spinnerはない。
- オンラインの退出と終了はともに白背景・赤文字 `#71382e`・薄赤border `#e8b3a6`。影響範囲が異なる操作でも同じ強さの配色。
- 「閉じる」はオンラインdialogで `white-space:nowrap`, `flex:none`, `min-width:44px` があるが、diagnostic headerの閉じるボタンは同じ共通ルールを持たない（Issue #10の調査対象）。
- 新規対局確認dialogはcancelがdark green、confirmがyellow。ただし進行中対局の破棄確認と、初回開始時でconfirmの危険度が異なる。
- ルール設定dialogの「キャンセル」の明示的なbutton背景規則は見当たらず、要素UA色や上位規則を含む実適用色は未測定。現行色は「未確認」と扱う。

### 要判断事項

1. 主要メニューのオフライン開始・ルーム作成・参加を全てAにする提案を採用するか。画面内の同等な開始経路は同じ強さにするのが一貫する一方、黄色の面積が増えるため実画面でレビューする。
2. `#confirm-new-game` を対局中だけD2に変えるか。現在の文言は同じだが確認文が状態で変化する。状態により色・アイコン・補足をどう変えるか決める。
3. 「ルームを退出」D1、「ルームを終了」D2の確認dialogをそれぞれ必要とするか。現在のサーバー側確認・退出影響との整合を実装時に見る。
4. 「ローカル卓へ戻る」がオンラインルームの参加状態を変えるか、結果表示の切替だけかを `returnToLocalGame` と最新仕様で確認してB/Dを決める。
5. `#diagnostic-clear` は確認dialogがあるためD1を推奨するが、診断ログの消去を危険色で表示する必要性を決める。
6. `test.html` / `kan-test.html` の開発専用ボタンにも製品用トークンを適用するか。検証の識別色が必要なら別トークンにする。

## 4. 提案する共通配色とコントラスト

### トークン案

ページの既存green背景 `#185640` と緑文字を保つ。通常文字はWCAG 2.2の通常サイズ4.5:1、コントロール境界・状態識別は3:1を目標にする。比率はsRGB相対輝度による計算、結果は小数第2位に丸めた。

| 役割／状態 | 背景 | 文字 | 境界・非色手掛かり |
|---|---|---|---|
| A 主操作・通常 | `#F8DC91` | `#154E3C` | 2px `#154E3C` border案。ラベルと動作を維持 |
| A 押下 | `#E9C66A` | `#154E3C` | 1px内側shadowまたは押込み。サイズ・位置は動かさない |
| B 補助・通常 | `#F8F7F2` | `#185640` | 2px `#185640` border案 |
| B 押下 | `#E4E5D8` | `#185640` | 押込み。サイズ・位置は維持 |
| C 見送り・通常 | `#DCE9E2` | `#185640` | 2px `#185640` border案。必要なら横線/「見送る」文字を保つ |
| C 押下 | `#C5D8CE` | `#185640` | 押込み。Bより緑味のあるsurfaceを維持 |
| D1 限定影響・通常 | `#FFE7E1` | `#71382E` | 2px `#71382E` border。退出など影響を補足する言葉 |
| D1 押下 | `#F2C8BE` | `#71382E` | 押込み。確認が必要な場面は文面を併用 |
| D2 重大操作 | `#9B3028` | `#FFFFFF` | 2px white border（隣接するred・dark-green両方に対し明瞭）。確認文・危険アイコンを併用 |
| 無効（全役割共通） | `#9DA27C` | `#20352C` | 役割色を塗り替える。disabled属性と理由文、操作不能のカーソル |
| 選択 | 元の役割色を維持 | 元の文字色 | 3px `#123F32` inset indicatorとcheck/`aria-pressed=true`。選択でレイアウトを動かさない |
| focus-visible | 元の役割色を維持 | 元の文字色 | 外側3px `#82DCFF` outline＋内側1–2px `#123F32` ring。色以外にoutline形状で識別 |
| 処理中 | 元の役割色を一時維持、操作はdisabled | 十分なコントラストの役割文字色 | spinner/進行アイコンと文言（「送信中…」「確認中…」）、`aria-busy`。表示幅を予約 |

押下・選択・focusの追加装飾はボタン寸法を変えず、layout shiftを起こさない。無効色にも通常文字の目標4.5:1を適用した案であり、disabled文字はWCAGコントラスト要件の例外になり得ることとは別に、読みやすさの目標としている。

### コントラスト計算

| 前景／境界 | 背景 | 比率 | 目標・結果 |
|---|---|---:|---|
| `#154E3C` text | A `#F8DC91` | **7.15:1** | 4.5以上、合格 |
| `#154E3C` text | A pressed `#E9C66A` | **5.83:1** | 合格 |
| `#185640` text | B `#F8F7F2` | **8.01:1** | 合格 |
| `#185640` text | B pressed `#E4E5D8` | **6.75:1** | 合格 |
| `#185640` text | C `#DCE9E2` | **6.87:1** | 合格 |
| `#185640` text | C pressed `#C5D8CE` | **5.76:1** | 合格 |
| `#71382E` text | D1 `#FFE7E1` | **8.13:1** | 合格 |
| `#71382E` text | D1 pressed `#F2C8BE` | **6.30:1** | 合格 |
| `#FFFFFF` text | D2 `#9B3028` | **7.38:1** | 合格 |
| `#20352C` text | disabled `#9DA27C` | **4.91:1** | 合格 |
| UI area A `#F8DC91` | app background `#185640` | **6.40:1** | 3以上、合格 |
| UI area B `#F8F7F2` | app background `#185640` | **8.01:1** | 合格 |
| UI area C `#DCE9E2` | app background `#185640` | **6.87:1** | 合格 |
| UI area D1 `#FFE7E1` | app background `#185640` | **7.27:1** | 合格 |
| D2 white border `#FFFFFF` | D2 fill `#9B3028` | **7.38:1** | 合格 |
| D2 white border `#FFFFFF` | app background `#185640` | **8.59:1** | 合格 |
| disabled area `#9DA27C` | app background `#185640` | **3.23:1** | 合格、余裕は小さい |
| focus cyan `#82DCFF` | app background `#185640` | **5.58:1** | 合格 |

D2の塗りと緑背景だけの差は1.16:1のため、白い境界線を必須にする。focus cyanは白や淡色ボタン面だけに隣接すると差が小さいため、dark inner ringと重ねる。WCAGのページ全体適合判定や実機視認性をこの色計算だけで主張しない。

## 5. 状態別仕様

| 状態 | 提案 |
|---|---|
| 通常 | 役割ごとのsurface・文字・境界を固定。隣接する選択肢のうち同等の合法操作は同じroleにする。 |
| 押下 | 色面を1段変える。`transform`でボタン位置を動かさず、pointer captureや画面スクロール挙動も変更しない。 |
| 選択 | `aria-pressed` または選択グループとしての意味を明確にし、チェック・枠線・アイコンを足す。色と牌の8px移動だけに依存しない。 |
| 無効 | native `disabled` を優先し、全roleで共通の灰緑色へ。現在の個別opacityを重ねない。状態説明はlive/statusテキスト等で補う。 |
| 処理中 | 二重送信防止のためnative disabledと既存pending guardを維持。進行アイコン、短い動詞＋状態の文字列、固定幅領域で示し、役割色は維持する。通信失敗/timeout後に操作可能へ戻ることも検証する。 |
| キーボードfocus | `:focus-visible` の二重リングを共通適用。dialog表示後のfocus、閉じた時の復帰、Enter/Space操作を保つ。 |

## 6. 共通化の実装方針（将来案）

実装承認後、次のclassとCSS custom propertiesを導入する案。classは色と役割だけを担い、レイアウト固有classを残す。

```css
:root {
  --button-a-bg: #f8dc91;
  --button-a-fg: #154e3c;
  --button-a-pressed: #e9c66a;
  --button-b-bg: #f8f7f2;
  --button-b-fg: #185640;
  --button-b-pressed: #e4e5d8;
  --button-c-bg: #dce9e2;
  --button-c-fg: #185640;
  --button-c-pressed: #c5d8ce;
  --button-d1-bg: #ffe7e1;
  --button-d1-fg: #71382e;
  --button-d1-pressed: #f2c8be;
  --button-d2-bg: #9b3028;
  --button-d2-fg: #ffffff;
  --button-disabled-bg: #9da27c;
  --button-disabled-fg: #20352c;
  --button-focus: #82dcff;
  --button-focus-inner: #123f32;
}
.ui-button { /* shared font, border-box, touch-action, transition policy */ }
.ui-button--primary {}
.ui-button--secondary {}
.ui-button--defer {}
.ui-button--danger {}
.ui-button--danger-strong {}
.ui-button:disabled,
.ui-button[aria-disabled="true"] {}
.ui-button[aria-busy="true"] {}
```

Proposed compatibility approach:

1. Add tokens and generic state rules without deleting existing selectors. Existing selectors can set old dimensions and `white-space`; role class controls color only. Keep current HTML IDs, `data-panel-part`, diagnostics IDs, and event listeners unchanged.
2. On static HTML controls, add role classes while preserving unique/layout classes (`online-dialog-close`, `control-action-button`, `rule-settings-open`, etc.). On dynamic option and tile buttons, assign semantic classes at creation time in `ActionPanel.renderOptions`, `tileButton`, and `OnlineGameController.renderHandButton`.
3. Remove per-selector color declarations only after the target Browser UI snapshots and computed styles confirm the replacement. Keep dialog geometry/overflow selectors separate from role rules.
4. Avoid a global `button` selector that changes radio/select/summary, tile dimensions, `[hidden]`, `disabled`, `aria-pressed`, or inline style semantics.

## 7. 段階移行計画

1. **トークンの土台:** `src/style.css` に色token、共通focus/disabled/pressed/busyルールを追加。ここでは既存selectorを優先して画面色を変えない互換段階とする。
2. **ダイアログとメニュー:** `index.html` のメニュー・新規対局・ルール設定・オンライン作成/参加・診断・結果・待機室の静的ボタンに役割classを付与。コピー、閉じる、設定、危険操作を含む。
3. **対局パネル:** 共通action templateの12 controlsにroleを割当。`src/ui/action-panel.ts` の生成候補をrole分類し、local/onlineで同じスタイル契約を使う。
4. **牌選択と検証UI:** `src/rendering/table.ts`、`src/online/game-controller.ts` でtile-choiceを追加。`kan-test.html` と `test.html` は同じトークンを使うか開発用別枠か決定後に移す。
5. **旧色宣言を整理:** Browser UI回帰後、selector別の重複色、disabled opacity、focus違いを段階削除。各段階でdiffを小さくし、色以外の寸法値を変えない。

### 変更対象候補（承認後）

| ファイル | 変更候補 |
|---|---|
| `src/style.css` | tokens、role class、共通state、旧色の段階整理 |
| `index.html` | 静的画面・action templateにsemantic classを付与 |
| `src/ui/action-panel.ts` | 動的ポン/チー/カン候補にrole class、処理中/選択のARIA表現 |
| `src/rendering/table.ts` | ローカル牌選択button class/state |
| `src/online/game-controller.ts` | オンライン牌選択button class/state |
| `kan-test.html`, `test.html`, `src/verification/style.css` | 開発画面のボタン配色スコープ。製品スタイルとの共有判断後 |
| `src/ui/new-game-dialog.ts`, `src/online/waiting-room.ts`, `src/online/diagnostics.ts`, `src/ui/rule-settings.ts` | 状態に応じた役割、pending、確認・feedbackの必要が確定した場合のみ |
| `tests/action-panel*.test.ts`, `tests/new-game-dialog.test.ts`, `tests/step14-0-1.test.ts` 等 | DOM class/state・pending二重実行の単体検証を追加する場合 |
| `tests/browser-action-controls.py`, `tests/browser-online-waiting-room.py`, `tests/browser-diagnostics.py`, `tests/browser-online-dialog-layout.py` 等 | 画面・状態・サイズ別のBrowser UI検証 |

## 8. 回帰テスト・実機確認計画

このIssueではテストコードやUIを変更せず、次段階での計画だけを記す。

### 単体・DOM

- 役割判定: A/B/C/D1/D2とactive game時のA/D2切替、同等複数のcall/kan候補がすべてA。
- `ActionPanel.update` のhidden/disabled/label更新、`renderOptions` の動的class、local/onlineの同じ役割。
- `pass-call`は局面応答、`cancel-kan`は候補パネルを閉じる、`pass-ron`はロンを辞退することをそれぞれ維持。
- 診断copy/clear、rule cancel/confirm、待機室ready/finalize/start/leave/closeのpending・エラー解除。
- 連続タップ・pointerdown/click双方で各非冪等操作が二重送信されないこと。既存のrequest guard/idempotencyが保たれること。
- 無効、選択、処理中、focusのclass/ARIA/labelが正しく、disabledボタンにactionが発火しないこと。

### Browser UI

- 既存 `browser-action-controls.py`, `browser-action-panel.py`, `browser-online-waiting-room.py`, `browser-online-dialog-layout.py`, `browser-diagnostics.py`, `browser-offline-rules.py`, `browser-round-end-ui.py`, `browser-kan-page.py`, `browser-river-test-mode.py` を優先する。
- offline/online、menu/modal/result/diagnostics/dev page、各roleと状態の色をcomputed styleで確認。A/B/C/D1/D2/disabled/focusに4.5:1/3:1計算を自動または記録可能にする。
- Viewport 320×568、375×667、390×844、430×844、1280×800。オンライン待機の6重点ボタン、診断dialogの長いbuild info、複数候補とtile handで横幅・折返し・重なりを確認する。
- 画面幅・フォント・ボタンラベルが変化しても処理中表示がレイアウトを動かさず、safe areaとscroll位置が変わらない。
- 既知のスクロール／操作不能問題を直すテストではなく、今回のrole classが既存の動作・配置を壊さないかを見る。Issue #8/#10の原因修正を含めない。

### iPhone Safari / Android Chrome 実機

- iPhone SafariとAndroid Chromeの実端末・OS・ブラウザー版を記録。Chromium/WebKit自動検証結果と実機確認を別記する。
- 太陽光/明るさを変えた状態の役割判別、文字・border・focus ring、VoiceOver/TalkBack読み上げ、外部キーボードfocus。
- 44px以上の主要タップターゲットを維持。牌タイルは卓密度との兼ね合いがあるため、寸法を無断変更せず実機で選択性と誤タップを確認。
- 連続タップ、通信遅延中の二重押し、コピー許可失敗、再接続、disabled解除後の再操作。
- 押下・処理中・選択表示で高さ/幅/折返しが変わらず、スクロール位置が勝手に動かないこと。
- 待機室「準備完了→準備を解除」「座席を確定」「コピー」「閉じる」「退出」「ルーム終了」と鳴き「ポン／チー／カン／ロン／見送る」を端末上で確認。

### 回帰リスク

- 色class追加のselector specificityにより `.online-dialog-close`、`#view-table`、`.rule-settings-open` 等の従来色が残る/意図せず上書きされる。
- `.disabled` の一律化でpending cursorや再接続可否の視認性を失う。
- action panelの共有テンプレート複製にclassを漏らす、またはonline/localの片方だけ状態表現が変わる。
- 選択・押下をtransform/outlineで示す際、牌の卓幅・河・sticky/scroll viewportが動く。寸法変化を避ける。
- D2の濃色がダークgreen周辺に溶けるためborder必須。D1・C・Bが似た淡色となるため、ラベル・形状・アイコンを併用する。
- disabledの灰緑はD2や通常色との差が小さい組合せがあり得る。意味を色だけで示さず、native disabledと文言を併用する。
- `white-space:nowrap`, flex sizing, min-widthを色共通化時に触るとIssue #10の折返し・狭幅レイアウトへ影響する。

## 9. 今回の検証と未実施事項

### 実施

- Issue #9本文・コメント、関連するopen Issue #8/#10/#12/#13を確認。
- 最新 `origin/main` をfetchし、対象SHAを確認。HTML button宣言・テンプレート・動的ボタン生成箇所、関連TypeScriptのlistener/state更新、CSS selector/色を調査。
- 提案色の相対輝度コントラスト比をsRGBのWCAG式で計算。資料の全セルを記載値と照合すること。

### 未実施

- 実画面起動、ブラウザーcomputed style・画面キャプチャでの視認検証、Playwright/Browser UI、単体テスト、build、iPhone Safari/Android Chrome実機確認は未実施。設計・文書のみの依頼であり実装テストは実行していない。
- 診断dialog「閉じる」のIssue #10の根本原因は未確認。既存Issueの修正は未実施。
- 関連IssueのstateはGitHub検索結果とIssue本文を参照した。Issue #9は引き続きOpenにする。

## 10. 実装承認後の推奨順

1. 本資料のA/D2状態依存、D1/D2の危険度、B/Cの区分をレビュー・決定する。
2. token/classのみの互換段階を作り、HTML・動的生成部へ一貫して適用する。
3. unit/DOM → Browser UI → iPhone Safari / Android Chrome実機の順に確認し、レイアウト・スクロール・対局動作の回帰を解消する。
4. 承認された段階ごとに旧色selectorを除去し、Issue #9の実装完了を別途レビューする。

この資料は調査と提案を分離した設計案であり、色変更を承認したものではない。


## 11. 設計レビュー決定事項（2026-10-30）

以下は設計上の決定であり、実装・実機確認済みを意味しない。

1. **新規対局確認**：対局未開始・対局終了後はA「新しい対局を開始」。進行中の対局を破棄する場合はD2「現在の対局を終了して開始」。確認文には進行中の対局が失われることを明記する。実装前に既存状態判定と表示条件を照合する。
2. **危険度**：診断ログのクリア、ルームを退出はD1（淡赤）。ルームを終了、進行中の対局破棄はD2（濃赤）。D2には操作対象と影響を示す確認を設ける。D1についても既存確認処理を点検し必要な確認を設ける。
3. **状態優先順位**：処理中 ＞ 無効 ＞ 押下・選択 ＞ 通常。処理中はnative disabledと既存pending guardを維持しながら役割色を保持し、進行文言・アイコンを表示する。一般の無効状態のみ灰緑色を適用する。disabled規則が処理中の色を上書きしないよう明示的な状態属性とCSS優先順位を設計する。

未確定：ローカル卓へ戻る操作の副作用、検証専用画面への適用範囲、ブラウザーcomputed style・実機視認性。実装は別Issueとし、ここではゲーム本体・CSS・テストを変更しない。
