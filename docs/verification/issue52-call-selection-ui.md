# Issue #52 鳴き選択UIの検証

実施日: 2026-11-07

対象Issue: [#52 鳴き選択UIをダイアログから卓上ボタンに変更](https://github.com/ak-sekine/heibon-mahjong/issues/52)

## 初回実装時の記録

- オフラインとオンラインで共有する `ActionPanel` に種類選択、牌候補、戻る操作を配置し、鳴き専用ダイアログを削除した。
- 初回実装では種類選択後に候補を表示していました。2026-11-07の後続修正で、候補1件は種類ボタン押下で即確定する仕様に変更しています（末尾の最終確認を参照）。
- 候補は幅に応じて列数が変わる Grid とし、操作パネルの下端に固定して候補行を上方向に増やす。狭い画面で候補数が高さを超える場合は候補一覧内をスクロールさせ、戻る／見送るを操作領域に残す。
- ゲーム状態遷移、合法性判定、オンライン送信と同期は既存の選択イベント経路を使う。

## 初回実装時の自動検証

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 tests passed |
| `npm run build` | 成功: TypeScript・Vite build・PWA shell build |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI regression selection / Python syntax | 成功 |
| Chromium Playwright UI | 成功: [GitHub Actions run #707](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42325846848)、commit `a896b3f034631f952ede6984e0709b7c97a9926991` |
| WebKit Playwright UI | 成功: [GitHub Actions run #707](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42325846848)、commit `a896b3f034631f952ede6984e0709b7c97a9926991` |
| iPhone Safari 実機 | 未確認。公開後に実機確認が必要 |

Browser UI の鳴き選択シナリオは、複数候補・単一候補・複数鳴き種・カン・ロン・戻る・見送り、候補列数と上方向の伸長を、375×634、320×568、375×844、844×390、1280×900 の viewport で確認する。オンラインの同期・タイムアウト・再接続は既存のオンライン対局 Browser UI シナリオで確認する。

GitHub Actions run #707 は全体成功。regression test、Worker 型チェック、Pages/itch build、Chromium / WebKit Browser UI、browser-ui matrix audit、Worker deploy、production test、Pages build/deploy がすべて成功した。対象 commit SHA は `a896b3f034631f952ede6984e0709b7c97a9926991`。

Playwright の Chromium / WebKit 結果は iPhone Safari 実機確認とは区別する。iPhone Safari 実機確認が完了するまで Issue #52 は Open のままにする。

上記の未確認記載は初回実装時点の履歴です。後続の修正・検証経緯は下記に追記し、履歴は削除していません。

## 追加修正 — iPhone Safari実機指摘、2026-11-07

### 指摘と原因

ユーザー本人の2026-11-07のiPhone Safari確認で、鳴きメニューが通常操作パネルより画面下端に離れて表示されること、牌候補選択画面にも「見送る」が残ることが報告されました。実機確認の報告範囲はこの2点です。

CSSを調べると、モバイルでは `.discard-controls:has(.call-controls:not([hidden]))` を `position:fixed` と `bottom:...` でviewport下端に固定し、PCでは `.call-controls` を絶対配置して親の `bottom:0` に寄せていました。種類選択と候補選択で基準を揃える制御もなく、通常の卓直下レイアウトから分離されていました。さらに `--call-viewport-inset` を `main` の下paddingへ加算し、表示時に画面下部の余白を増やしていました。

### 修正

- 通常の打牌などを含む `.discard-controls` 自体の配置を保ち、モバイルでは鳴きパネルを操作領域の上端、すなわち卓直後に配置します。種類選択と候補選択でパネルの基準・高さをそろえ、PCの右側操作欄では下端に合わせます。viewport下端への固定を削除し、`main` に加算していた鳴き用viewport insetも除去しました。
- 短い画面で鳴き操作を卓直後に収める必要がある場合に限り、鳴き判断中の卓の高さ上限を縮めます。幅600px以上・高さ650px以下では操作ボタンを横一列にして `100dvh - 188px`、同幅で高さ651〜960pxでは `100dvh - 288px`、幅600px未満・高さ600px以下では `100dvh - 268px` を使います。通常の対局中の卓寸法は既存のレスポンシブ設定を維持します。
- 牌候補一覧は鳴きパネルの上端から上向きに展開する絶対配置にし、`max-height`、内部スクロール、overscroll containmentを設定しました。候補の行数はページの通常フローに影響しません。
- 牌候補選択では「戻る」だけを残し、「見送る」を隠します。「戻る」は種類選択へ戻して「見送る」を再表示し、鳴き判断イベントを発生させません。種類選択画面の見送り、候補が1つでも選択前には候補を明示する既存動作、時間切れ処理は維持します。

### 今回の自動検証

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 test files passed |
| `npm run build` | 成功: TypeScript・Vite build・PWA shell build |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI Python syntax | 成功: 鳴き選択、卓レイアウト、オンライン対局の関連3スクリプトをcompile確認 |
| Chromium / WebKit Browser UI | 成功: [GitHub Actions run #716](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42339185029)、commit `dba31fd9eb0f0e6e5b408c0f1082120374fd5a00` |
| GitHub Actions | 成功: verify、Chromium／WebKit、browser-ui matrix audit、release freshness、Worker deploy、production test、Pages build／deploy |
| 修正後のiPhone Safari実機 | 未確認。ユーザー本人による再確認が必要 |

Browser UIでは通常時の打牌パネル配置が変わらないこと、卓直後の鳴きパネル、候補画面の「見送る」非表示と「戻る」による状態復帰、5件のチー候補の複数行表示、単一候補表示と選択前の未確定状態、320×568／375×634／375×844／844×390／667×375／1280×900 viewportを追加確認します。オンラインシナリオでは種類・候補選択、戻る、候補選択中のタイムアウトを確認します。実機の2指摘はユーザー報告に基づくもので、修正後の実機確認は未実施です。

### Actions再検証の経緯

- Deploy run [#711](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42334177990)、commit `029e7e54fd34052d6ed29100c6c4dd068828cdb9` は `verify`、回帰テスト、Worker型チェック、Pages／itch buildが成功しました。ChromiumとWebKitは両方とも `tests/browser-call-decision-dialog.py` の844×390 viewportで失敗し、候補画面の「戻る」が `y=374`、高さ44pxとなって画面下端から28pxはみ出すことを検出しました。browser-ui matrix auditも両エンジンの失敗を検出したため、deploy jobは実行されていません。
- この結果を受け、幅600px以上・高さ850px以下では卓の高さ上限を `100dvh - 128px` とし、通常操作欄を画面内に残す余裕を広げました。変更後は `npm test`（85 test files成功）、`npm run build`、`npm run typecheck:worker`、`git diff --check`、関連Browser UI Python構文確認が成功しています。
- Deploy run [#712](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42334971322)、commit `5bbdef376119df6119eedc5e0596de1e80c6f074` は `verify` と `docs-check` が成功しました。Chromium／WebKitとも844×390の候補画面まで通過し、「戻る」も表示範囲内でしたが、1280×900で通常操作欄と鳴き操作欄の親要素の上端を比較する既存回帰assertionが失敗しました。PCのグリッドでは状態ごとに親要素の高さが変わり、下端は共通のままです。Browser UI matrix auditも両エンジンの失敗を検出し、deploy jobは実行されていません。
- Deploy run [#713](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42335426664)、commit `72d45aa4a6283ed0f163d5f516bcbfd7a180ee19` は `verify` と `docs-check` が成功しましたが、Chromium／WebKitとも375×634で、通常操作中と鳴き判断中の `.discard-controls` 上端は卓直後の同じ位置でも、高さが159pxから14pxへ変わるため下端比較が失敗しました。これは鳴きパネルを可変高さの親下端に結び付けると種類画面の位置が変わることを示します。両Browser UIとmatrix auditは失敗し、deploy jobは実行されていません。
- この結果を受け、モバイルの鳴きパネルを操作領域の上端（卓直後）へ固定し、2段階でパネルの高さを保ちます。600〜959px幅の短い横画面では種類・見送り／候補・戻るを一列の操作帯に収め、卓はその上限内に縮めます。PCでは従来どおり操作欄の下端へ結び付けます。変更後のローカル検証は `npm test`（85 test files成功）、`npm run build`、`npm run typecheck:worker`、`git diff --check`、関連Browser UI Python構文確認が成功しています。Chromium／WebKitとActionsの再検証は次のrun後に追記します。iPhone Safari実機の修正後確認は引き続き未実施です。
- Deploy run [#714](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42336729385)、commit `7d9c5a7e0583fcc96bd952f3a9595a90fe520592` は `verify` と `docs-check` が成功しました。Chromium／WebKitとも375×634と320×568を通過し、375×844でBrowser UIの卓直後間隔assertionが失敗しました。実測は卓下端491px、鳴きパネル上端500pxで、通常レイアウトの8px gapと親枠線1pxの合計9pxです。操作パネルは画面内にあり、表示のはみ出しではなく許容幅の不足でした。両Browser UIとmatrix auditは失敗し、deploy jobは実行されていません。
- 間隔の値を直接推測しないよう、モバイルでは鳴きパネル上端を通常操作領域の上端と比較し、通常操作領域の方が卓直後にあることも併せて確認します。Chromium／WebKitの修正後結果は次のActions run後に追記します。iPhone Safari実機の修正後確認は引き続き未実施です。
- Deploy run [#715](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42337185737)、commit `705d2f2b1f620fa5d437116bd2bbd37dcbe3d1f4` は `verify` と `docs-check` が成功しました。Chromium／WebKitとも鳴き選択Browser UIは既存5 viewportで成功しましたが、続く卓レイアウト回帰で667×375の通常プレイ時の卓が187px幅、牌幅11.5pxとなり失敗しました。短画面向け縮小ルールが鳴き判断のない通常プレイにも適用されていたことが原因です。Browser UI matrix auditは失敗を検出し、deploy jobは実行されていません。
- run #715を受け、通常プレイ時は既存の短い横画面向け卓サイズに戻し、卓の追加縮小を鳴き判断中に限定しました。鳴き選択Browser UIへ667×375を追加し、通常状態と鳴き中の配置を分けて検証します。この修正版のChromium／WebKitとActions結果は次の実行後に追記します。実機の修正後確認は引き続き未実施です。
- Deploy run [#716](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42339185029)、commit `dba31fd9eb0f0e6e5b408c0f1082120374fd5a00` は全job成功です。ChromiumとWebKitは追加した667×375を含む鳴き選択6 viewport、候補画面の「見送る」非表示、種類画面への戻り、単一／複数候補、候補選択時の画面スクロールなしを確認しました。既存オンラインBrowser UIでは種類・候補選択、戻る、候補中の時間切れも成功しました。`verify`、browser-ui matrix audit、release freshness、Worker deploy、production test、Pages build、Pages deployが成功し、Worker／Pagesの記録SHAはどちらも `dba31fd9eb0f0e6e5b408c0f1082120374fd5a00` です。Issue #52はOpenのままです。修正後のiPhone Safari実機確認は未実施です。

## 追加修正 — 2026-11-07 iPhone Safari再確認指摘

### 指摘

2026-11-07のiPhone Safari実機確認で、種類選択時に「チー」と「見送る」が縦並びになること、チー候補の枠が「戻る」の操作パネルから分離して見え、戻るの上に大きな空白ができることが報告されました。これは今回の実機確認でのユーザー報告です。修正後の実機確認はまだ行っていません。

### 原因と修正

- 種類ボタンと見送りは別々のFlexコンテナにあり、鳴き種類が1つでも見送りが専用の下段に配置されていました。種類ボタンと見送りを同じCSS Gridの項目として配置し、2項目なら同じ行、3種類以上ならグリッド幅に応じて並べます。44px以上のタップ領域を保ちます。
- `.call-controls` には `min-height:136px` があり、候補一覧は `position:absolute` で独立の背景・枠線・余白を持っていました。候補枠と「戻る」が同じ外観に見えず、候補一覧の上方向の伸長も親パネルに反映されませんでした。別の下端基準へ移した試行では、絶対配置の親 `.discard-controls` が14pxまで縮み、鳴きパネルが卓と重なりました。
- 種類選択は親操作領域の上端、つまり卓直後から始まり、内容の高さだけを使います。候補画面では候補一覧と「戻る」を同じ `.call-controls` Grid内に置き、パネル下端を親上端から118px（短い横画面では74px）に固定します。候補が1行を超えると、下端を保ったまま上へ広がります。PCの右側操作欄では下端を親に合わせます。候補の列幅は84px以上で画面幅に応じて折り返し、3候補が収まる画面では3列にします。候補部分だけに高さ上限と内部スクロールを設定し、ページ全体の意図しないスクロールを防ぎます。
- `ActionPanel` の状態遷移、合法性判定、鳴き確定、戻る、見送り、タイムアウト、オンライン同期には手を加えていません。共通テンプレートとCSSを使い、オンライン／オフラインの表示を共通化しています。

### 今回の検証

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 tests passed |
| `npm run build` | 成功: TypeScript・Vite・PWA shell build |
| `npm run typecheck:worker` | 成功 |
| Browser UI Python構文 | 成功: 鳴き選択、卓レイアウト、オンライン対局、共通ActionPanelの関連4スクリプト |
| Chromium／WebKit Browser UI | 成功: [GitHub Actions run #724](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42345971656)、commit `312b917bf272bfeb07e5e112797c7d7119ec154d` |
| GitHub Actions | 成功: verify、Chromium／WebKit、browser-ui matrix audit、release freshness、Worker deploy、production test、Pages build／deploy |
| iPhone Safari実機 | 未確認。実機で再確認が必要 |

`tests/browser-call-decision-dialog.py` では種類画面の2ボタン行、候補1・2・3・複数候補、共通パネル内のDOM所属、候補枠の独立した境界線・背景がないこと、候補と戻るの間隔、複数行時にパネル上端が上がり下端が維持されること、候補部分だけのスクロールを測定します。320×568、375×634、375×844、844×390、667×375、1280×900をChromiumとWebKitで検証します。既存のオンライン対局Browser UIで戻る・見送り・鳴き確定・時間切れ、共有ActionPanel、通常打牌操作を引き続き確認します。

Issue #52は、ユーザーによるiPhone Safari実機再確認が完了するまでOpenのままにします。

### 今回のActions再検証

- run [#722](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42344690057)、commit `7232f41f1426fc383bd6537606a416ae82700728` では `docs-check`、`verify` とbuild／型チェックが成功しましたが、Browser UIの診断assertionが鳴き種類ボタン数に「見送る」も含めて失敗しました。320px幅の実測では種類ボタンと見送りは同じ行に各147×44pxで並んでいました。テストを種類ボタンだけ数えるよう修正しました。
- run [#723](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42345023631)、commit `57224c98f00141fe01a72d54411de6a198281a7d` では、WebKitが種類画面のパネル位置assertionに失敗しました。`.discard-controls` が絶対配置の鳴きパネルによって高さ14pxまで縮み、76pxの下端基準が卓の直後からずれていました。ChromiumはBrowser UI本体の前段のstandalone itch smokeで、CPUの九種九牌後に `wall-exhausted` となる初期局に当たり、打牌待ちの確認へ進めませんでした。
- 上記を受け、種類画面を操作領域の上端に固定し、内容高のみで表示するよう変更しました。候補画面は候補数にかかわらず下端基準を固定し、候補行が増えると上へ広がるようにし、候補画面どうしで下端が維持されるassertionを追加しました。
- run [#724](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42345971656)、commit `312b917bf272bfeb07e5e112797c7d7119ec154d` は全job成功です。ChromiumとWebKitのBrowser UIで種類画面、候補1／2／3個、複数行候補、共通枠のDOM構造・座標、戻る、見送り、卓位置、320px／縦横画面／PCを確認しました。オンライン対局の時間切れ・戻る・鳴き操作、既存の通常対局シナリオも成功しました。事前／事後standalone itch smoke、matrix audit、release freshness、Worker deploy、production test、Pages build／deployもすべて成功しました。修正後のiPhone Safari実機確認は引き続き未実施です。

## 追加修正 — 種類別の単一候補を即確定、2026-11-07

### 変更

- 共通 `ActionPanel` で、押された種類に一致する実行可能な表示候補だけを数えます。1件ならその候補IDを既存の `select-call` イベントへ渡して確定し、候補画面・「戻る」・追加確認を出しません。2件以上なら従来どおりその種類の候補選択へ進みます。候補情報そのものを並び順から推測せず、候補オブジェクトのIDを使います。
- ローカルとオンラインは同じ `ActionPanel`／`select-call` 経路を使います。確定前は候補を自動選択せず、クリック後は共通の送信待ちロックを使って二重タップを拒否します。オンラインでは既存の送信中／サーバー判断待ち状態と期限処理を維持し、通信プロトコル・ゲーム判定は変更しません。種類選択以外の暗カン・加カン・ロン処理も変更しません。
- 単一候補のチー・ポン・大明カン、同一種類の複数候補、チーとポンの同時候補、戻る・見送り、オンライン応答待ち・期限切れ・再接続後の候補選択を自動検証へ追加しました。既存の候補UIレイアウトと複数候補検証を保っています。

### 検証結果

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 test files passed |
| `npm run build` | 成功 |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI Python構文 | 成功: 鳴き選択、オンライン対局、共通ActionPanel、キーボード、関連するカン回帰6スクリプト |
| Chromium／WebKit Browser UI | 成功: [GitHub Actions run #728](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42357093260)、対象SHA `68aa7e542acc020a0a3a9eba0f8af8c400e8def3` |
| GitHub Actions | 成功: verify／npm test／Worker型チェック／Pages・itch build、Chromium／WebKit Browser UI、browser-ui matrix audit、release freshness、Worker deploy、本番通信テスト、Pages build／deploy。Worker／Pages成功SHAは `68aa7e542acc020a0a3a9eba0f8af8c400e8def3` |
| iPhone Safari実機 | 未確認。実機確認までIssue #52をOpenのまま維持 |

種類別即確定の主なシナリオは `tests/browser-call-decision-dialog.py` と `tests/browser-online-waiting-room.py`、ActionPanel単体は `tests/action-panel.test.ts` です。カン・ロンや配置・候補枠・上方向展開の既存シナリオも維持し、全体回帰で確認します。

### Actionsの実行履歴

- Deploy run [#727](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42356707763)、実装commit `afd86a23c08dcb9ed25558159211ca2e3719761d` ではverifyとChromiumが成功しましたが、両ブラウザーの回帰suite中にWebKitが追加したポン局面fixtureで `RangeError: Need thirteen` を検出しました。fixtureの手牌が12枚だったため、13枚になるよう追加修正commit `68aa7e542acc020a0a3a9eba0f8af8c400e8def3` をpushしました。
- Deploy run [#728](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42357093260)、対象SHA `68aa7e542acc020a0a3a9eba0f8af8c400e8def3` は全job成功です。Chromium／WebKitのBrowser UI、matrix audit、release freshness、Worker deploy、本番通信テスト、Pages build／deployまでsuccessし、Worker／Pagesを同SHAで公開しました。
- Issue #52はOpenのままです。修正後のiPhone Safari実機確認はユーザーの確認待ちです。

## 最終仕様と確認結果 — 2026-11-07

### 最終仕様

- 鳴き判断はモーダル／ダイアログを使わず、卓を表示したままの共通 `ActionPanel` 上で操作します。種類選択ボタンと「見送る」は同じ領域で横並びにします。
- 種類を押したとき、その種類の有効候補が1件なら候補画面を挟まず即確定します。2件以上なら、押した種類の候補だけを表示して選択します。複数種類が可能でも、押していない種類は確定しません。
- 候補一覧と「戻る」は同じ操作枠に表示し、候補が複数行になると枠の下端を保って上方向へ展開します。高さが足りないときは候補一覧内だけをスクロールします。
- 「見送る」は種類選択画面だけに表示し、候補画面では隠します。「戻る」は未回答のまま種類選択へ戻し、「見送る」を再表示します。
- オフライン／オンラインは共通の `ActionPanel` と選択イベント経路を使います。オンラインのタイムアウト・再接続ではサーバー状態と同期します。

### iPhone Safari 実機報告

2026-11-07、ユーザー本人から次の8項目すべてOKとの報告がありました。NG 0件、報告された8項目の未確認0件です。

| No. | 確認項目 | 結果 |
|---|---|---|
| 1 | ポン候補1件で「ポン」を押すと即確定する | OK |
| 2 | チー候補1件で「チー」を押すと即確定する | OK |
| 3 | チー候補2件以上では牌候補が表示される | OK |
| 4 | 牌候補画面から「戻る」で種類選択に戻れる | OK |
| 5 | チー・ポンなど複数種類がある場合、押した種類だけが確定する | OK |
| 6 | 「見送る」が正常に動作する | OK |
| 7 | ボタンの横並び、表示位置、スクロールに問題がない | OK |
| 8 | オンライン対局・タイムアウト・再接続後も正常に動作する | OK |

確認者はユーザー本人です。報告されていない端末機種、iOS詳細バージョン、確認時刻、画面幅、画面方向は記録していません。この報告を横画面・PC実機・アクセシビリティの個別確認済みとは扱いません。

### 自動検証との照合

| 検証 | 結果 |
|---|---|
| 実装・公開 Deploy workflow | [run #728](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42357093260)、対象SHA `68aa7e542acc020a0a3a9eba0f8af8c400e8def3`。実際のrun情報でSHA一致、status `completed`、conclusion `success` を確認 |
| `verify` | success。報告済みの `npm test`、`npm run build`、`npm run typecheck:worker` を含む |
| Chromium / WebKit Browser UI | success |
| browser-ui matrix audit / release freshness | success |
| Worker deploy / production test / Pages build / Pages deploy | success |
| 文書更新workflow | [run #729](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42358352307)、head SHA `031669f33066a17902a2f7b1f5854a675c954005`、status `completed`、conclusion `success`。`docs-check` success。文書のみの変更によりコード検証・Browser UI・deploy系jobはskip |

run #728のActions API job一覧では、`docs-check`、`detect-changes`、`verify`、Chromium、WebKit、matrix audit、release freshness、Worker deploy、production test、Pages build、Pages deployがsuccessでした。run #729では`docs-check`と変更検出がsuccessし、文書のみの変更に対応する未実行jobはskipでした。これらは自動検証・公開結果であり、iPhone Safari実機報告とは別に記録します。

Browser UIの自動検証は320×568、375×634、375×844、844×390、667×375、1280×900等のviewportを含み、候補レイアウト・上方向展開・戻る・画面スクロールなし、アクセシブル名などを確認しています。これらのviewport結果をiPhone Safari横画面やPC実機の検証済みとはみなしません。

### 受入条件と残る確認

- 鳴きダイアログなし、種類ボタンの横並び、候補と「戻る」の同一枠、候補の上方向展開、候補1件の即確定、候補2件以上の選択、種類画面だけの「見送る」、オフライン／オンライン共通経路は、上記Actionsと実機報告で確認しました。
- 候補はネイティブの`button`要素で、`aria-label`と`:focus-visible`スタイルを実装しています。Actionsでもアクセシブル名を確認しています。一方、候補間のTab移動・フォーカス表示をBrowser UIで個別に操作確認した結果はなく、ここではソース確認と自動検査を実機確認とは区別します。
- 実機報告では画面方向が特定されていません。iPhone Safariの縦／横各方向の確認範囲、PC実機確認、候補選択のキーボード操作は個別に報告されていません。レスポンシブviewportの自動検証結果と混同しません。
- Issue本文の受入条件にはiPhone Safariの縦・横画面確認が残っています。画面方向が特定された実機確認結果がないため、この必須条件は未確認としてIssue #52をOpenに維持し、completedでCloseしていません。候補のキーボードフォーカスも直接検証した記録が揃うまで未確認として扱います。
