# itch.io版 viewport・スクロール仕様監査 — 2026-11-15

## 目的と判定の読み方

2026-11-15にユーザーが確定したitch.io版の最小viewport 320×568 CSS px、ページ全体スクロール禁止、卓より操作可能性を優先する仕様と、`origin/develop` の設計・実装・テストを照合しました。確定仕様は[現在の仕様書](../SPEC.md#itchio版のviewportサイズと操作可能性)へ記録しました。ここでの文書追加は実装完了を示しません。

判定は次の意味です。

- **確認済みの矛盾**：設計・テストの明示的な要件、またはソース上の寸法制約が確定仕様と両立しません。実ブラウザー上の発生を意味しない場合は、その限界を併記します。
- **矛盾の可能性があるが実測未確認**：実装の構造上リスクがあり、対象状態・viewportでの描画測定がありません。
- **整合している**：対象仕様に合う処理・検査を確認しました。別条件の達成まで意味しません。
- **確認できない**：記録・テスト・実装から判断できる根拠がありません。

## 設計・実装履歴の監査

| 分類 | 対象ファイル・箇所 | 現行の内容・根拠 | 確定仕様との関係 | 必要な対応 |
| --- | --- | --- | --- | --- |
| 設計 | [Issue #32 responsive記録](issue32-responsive-layout-2026-11-03.md#採用したレスポンシブ設計) 24–31行、[`legacy-preface.md`](../development/legacy-preface.md) 81–87行 | 当初はスマホ・タブレット・PCで共通レイアウトを使い、短い画面では卓をviewport高に合わせる一方、操作欄は通常フローに残してページを縦スクロールする方針でした。旧記録では320×568はページ全体を下へスクロールして操作し、375×547もスクロールして打牌する一方、390×844等では縦scrollなしと記録しています。理由は卓の幾何・牌サイズ・可読性を維持し、必要な操作へ到達させることです。 | **確認済みの矛盾（旧itch viewport仕様）**。新仕様では320×568はサポート境界であり、ページ全体のスクロールを操作条件にできません。後続の`step-08.3.1.md:21–28`には当時の320×568全操作が画面内に収まった測定もありますが、現在のissue32実装の証拠ではありません。 | 過去の記録は当時の設計として保持します。itch用の寸法計算を変更し、Pagesのスクロール許容は別途維持・回帰確認します。 |
| 計画 | [`ROADMAP.md`](../ROADMAP.md) 20、183行 | Issue #32はPC実機11/11報告後も追加確認待ちでOpen、Issue #46は実機・Draft確認待ちでOpenと記録しています。どちらの行も新しい320×568下限・ゲームページscroll禁止・達成済み判定を定義していません。 | **今回の確定仕様と直接矛盾する記載は確認しませんでした**。ROADMAPの実機・公開残件は今回のviewport仕様とは別です。 | ROADMAPのIssue状態は今回変更しません。後続の実装・受入検証後にIssueの進捗だけを別途更新し、仕様確定を実装完了として扱いません。 |
| 設計 | [Issue #32 responsive記録](issue32-responsive-layout-2026-11-03.md#調査で確認した実装と問題) 17–21行 | 端末別固定寸法よりCSS変数・Container Query・`dvh`を採用し、可変Safari UIとsafe areaを考慮。操作パネル・卓情報はオフライン／オンライン共通です。 | **整合している**設計意図はありますが、CSS pxの下限、横幅・高さの独立条件、itch iframe基準の定義は当時未確定でした。 | 共通コンポーネントを維持しつつ、itch版の必須viewportを明示します。 |
| 設計 | [Issue #32 PC卓仕様](../SPEC.md#手牌河副露結果表示) 111行、Issue #32の2026-11-08 PCレイアウト記録 | PC卓を高さから計算するが450px下限を優先し、通常操作・結果領域を120px予約。短い画面・長い結果ではページスクロールを許可し、状態遷移だけでは卓を縮めません。 | **確認済みの矛盾**。この設計のままではitch版の「操作可能性優先・ページスクロール禁止」と衝突します。 | itch版では操作に必要な領域を確保してから卓を縮小できる設計にします。450pxはitch版の必須下限として使えません。Pagesの従来動作はこの依頼だけで変更しません。 |
| 設計 | [Issue #32 candidate-anchor記録](issue32-candidate-anchor-2026-11-09.md#共通設計) 20–27行 | 通常操作欄の実測下端と高さを候補表示前に保存し、候補領域を下端固定で上へ展開。候補一覧だけ内部スクロールし、「戻る」を保持。 | **部分的に整合**。内部スクロールと戻るの保持は確定仕様に合います。一方、保存した通常操作欄の下端が最初からviewport外なら、同じ下端への固定だけでは表示領域内へ戻りません。 | 候補を開く前の通常操作欄、種類選択ボタン、通常状態ボタンもviewport内か検証します。可視領域変更後も必要な操作を残します。 |
| 設計 | [Issue #32 candidate-anchor記録](issue32-candidate-anchor-2026-11-09.md#959px幅の手動スクロール検査の基準表示) 123–127行 | 959×900の通常操作欄は当初から「例外的な手動スクロール」ケースとして、候補を測る前にページを動かす検査準備にしました。短い画面で操作ボタンへスクロールする設計も過去記録にあります。 | **確認済みの矛盾（設計・検査前提）**。itch版ではスクロール後だけの候補・戻る成功を受入条件にできません。959px幅は対象幅ではなく、今回の下限サイズに関する対象viewportではありませんが、操作前提の設計判断を示します。 | 操作可能性を初期表示から測る検査へ分離します。古い記録は書き換えません。 |
| 設計 | [Issue #46 itch手順](issue46-itch-html5-2026-11-05.md#itchio-draftの作成確認手順) 50–60行 | PC版は「Click to launch in fullscreen」を推奨、モバイルもfullscreen起動とするitchの説明を根拠にしています。固定サイズのEmbed in pageは調整が必要と記録。iPhoneのiframe内起動報告と実行Origin記録があります。 | **矛盾なし／達成未確認**。fullscreenは固定寸法を保証せず、要求仕様は実際にゲームが利用するiframe viewportを基準にします。以前のユーザー報告は具体的なiframe幅・高さを示していません。 | Draftで実際に観測したviewport CSS pxを記録し、測定していない値を実測値としません。通常ページ埋め込みをサポートするかは実測後に確認します。 |
| 設計 | [Issue #47環境分離記録](../development/issue-47-environments.md#決定) 16–26行、[運用手順](../operations/environments.md#通常開発と昇格) 36–42行 | `main` / `develop`のPagesとWorkerを分離し、itch modeは独立して維持。ブランチ分離は環境・成果物・公開を切り分ける設計です。 | **整合している**。Issue #47は画面レイアウトや最小viewportを決める設計ではありません。 | layout変更がPages／itch両ビルドに共有されるかを変更単位で確認します。 |
| 実装 | [共通PCレイアウト](../../src/style.css) 706–735行 | 960px以上は卓・点数・操作を縦並びにします。`--pc-board-size`は動的高から44、76、24、safe area、120px操作予算を引き、さらに`max(450px, …)`を適用。操作欄は通常108px以上です。 | **確認済みの矛盾（寸法規則）**。960×600ではCSS式の残り高はsafe area 0でも約320pxですが、450pxの下限が適用されます。高さ制約だけで使える分より卓を大きくするため、サポート仕様と両立しません。これはCSS式の計算であり、当該viewportを実行して測ったはみ出し結果ではありません。 | 卓の下限を操作領域の可視性より優先しないよう変更します。必要な操作高さを実状態から評価し、正方形の卓を幅・高さの残余に合わせます。 |
| 実装 | [共通main・操作パネルCSS](../../src/style.css) 10–12、45–70、163–167行 | `body`にスクロール禁止はなく、`main`は`min-height:100dvh`とsafe-area padding。操作欄はフロー内、操作ボタンは折り返し、候補一覧は内部縦スクロール、親はoverflow制御。短い高向けにgap・paddingを縮めます。 | **矛盾の可能性があるが実測未確認**。`min-height`は画面高以内への収容を保証せず、必要な子要素が増える状態でページ高が伸び得ます。内部候補スクロールの構造は**整合**します。 | ページ全体のscrollWidth／scrollHeightと実際のボタン矩形・hit testを各対応viewportと状態で確認します。|
| 実装 | [モバイル・短高卓CSS](../../src/style.css) 361–379、582–603行 | 幅600px未満かつ高さ600px以下の通常卓は`100dvh - 268px`を幅上限にします。600–959px幅・高さ850px以下は卓幅をviewport高から計算します。 | **矛盾の可能性があるが実測未確認**。高さによる卓縮小は一部に存在しますが、操作領域の実高、全局面、全viewportを残余へ収める証拠ではありません。状態別の特別調整もあり、全状態での操作可能性は確認できません。 | 必要領域を含む計算に統一するか、状態別制約を個々に監査します。新しい卓最小寸法・牌可読性の数値は実測後に別途決定します。 |
| 実装 | [ActionPanelのviewport listener](../../src/ui/action-panel.ts) 227–233、[候補のアンカー計算](../../src/ui/action-panel.ts) 543–612 | window/visualViewportのresize・scrollで候補パネルを再配置。候補前のroot下端・高さを保持し、viewportが変化した場合だけvisible viewportに合わせて最小補正します。通常操作欄自体の再配置・卓縮小計算はこの処理の責務ではありません。 | **部分的に整合**。候補パネル追従と内部スクロールは合いますが、通常欄が初めから画面外の状態や、縦だけのresizeで全操作欄が見えることは保証しません。 | 候補表示前／表示中／戻った後に通常欄と候補・戻るを別々に確認します。399→375→399の復元も含めます。 |
| 実装 | [CandidateSelectionのfocus処理](../../src/ui/candidate-selection.ts) 72–115 | focusに`preventScroll`を使い、WebKitが文書を移動した場合に現在のscroll位置を戻します。 | **整合している**のは、focusによる自動ページ移動を避ける意図です。以前に必要なボタンが画面外でも操作できる保証にはなりません。 | 回帰確認し、成功の根拠をボタンを初期表示位置でhit-testした結果に置きます。 |
| 実装 | [call viewport処理](../../src/ui/call-viewport.ts) 14–28、[呼び出し](../../src/main.ts) 204、247行 | 新規対局開始・次局開始時にscrollYが0でないと`window.scrollTo(0,0)`を行い、診断ログで意図的scrollとして分類します。候補中のユーザー手動スクロールも観測します。 | **矛盾の可能性があるが実測未確認**。操作を画面内へ見せるためのscrollIntoViewではなく、開始／次局時にページ位置を先頭へ戻す処理です。ただしitch仕様のページ全体スクロール禁止では不要なページ移動になり得るため、開始・次局経路で評価が必要です。 | itchサポート範囲では通常scrollY=0を維持できるか確認し、ページ移動を操作成立の前提にしない実装にします。Pagesへの既存診断・動作影響は分けて判断します。 |
| 実装 | [index.html viewport](../../index.html) 1–6、[vite.config.ts](../../vite.config.ts) 16–36、[package-itch.mjs](../../scripts/package-itch.mjs) 42–68 | HTMLは`width=device-width, initial-scale=1, viewport-fit=cover`。itch buildは同じ`index.html`を使い、PWAタグを削る一方、CSSを別レイアウトとして複製しているとは確認できません。itch entryは`index.html`だけです。 | **確認できない**。`innerWidth` / `innerHeight`等を使う実装はiframe内viewportを参照する想定ですが、itch実iframeの高さ・幅を検査した証拠はありません。 | itch用レイアウト条件がiframeの利用可能なCSS viewportに基づくことを、模擬iframeとDraft実機の両方で分けて確認します。 |

## テスト・検証記録の監査

| 分類 | 対象ファイル・箇所 | 現行の内容・根拠 | 確定仕様との関係 | 必要な対応 |
| --- | --- | --- | --- | --- |
| テスト | [mobile table layout](../../tests/browser-mobile-table-layout.py) 7–9、171–180、246–260行 | 320×568、通常縦画面、横向き・タブレット等を実行。打牌前後に`scroll_into_view_if_needed()`し、回転後も操作欄をスクロールしてから表示・hit testを確認。 | **確認済みの検査不足**。横幅overflowの検査はありますが、320×568でscroll前の操作欄／scrollYを記録せず、ゲームページ全体の縦overflow・操作前scrollYを禁止する検査ではありません。横向きviewportは高さ568未満でitch対象外です。 | 今回は変更しません。将来、Pagesの既存仕様を維持したままitch用必須テストと対象を分けます。 |
| テスト | [candidate geometry](../../tests/browser-candidate-geometry.py) 18–19、170–220、299–394行 | 幅320×568等でローカル／オンラインの打牌・鳴き・カン候補・戻る、候補内スクロール、可視viewport resize・復元を測り、scrollY・通常欄・hit testを確認。視覚テスト前にPlaywrightの自動scrollIntoViewを避ける処理あり。`375×560`も行列に含む。 | 操作欄・候補パネルの検査は**整合する部分**があります。一方`375×560`の成功必須は将来のitch必須サイズ外です。現在のdevelopに関するIssue #47コメント（2026-11-14）は、WebKitのこのviewport・オンラインmixed-kan resize後に共通root幅と候補panel幅がずれる失敗を記録しています。これは非サポートviewportの既存失敗であり、今回のサポート仕様の不達を示しません。 | 既存CIを無効化・skipせず維持。将来、下限未満の結果をitchサポート合否に使わないようテスト分類を整理します。 |
| テスト | [PC table layout](../../tests/browser-pc-table-layout.py) 9、64–95、295–313、[candidate-anchor記録](issue32-candidate-anchor-2026-11-09.md#959px幅の手動スクロール検査の基準表示) | 1280×720等で初期の点数・卓・操作ボタン、卓正方形、hit test、局結果ボタンを確認し、スクロール前に見せるチェックもあります。長文結果で次局操作が画面外なら文書scroll pathを要求し、scroll後に操作します。matrixに960×600はありません。 | **混在**。通常PCの初期表示検査は合います。長文結果のpage scroll successはitch仕様に合わず、標準matrixは960×600を検証しません。 | 長文本文を画面内専用領域へ収めるか卓を縮小し、ゲームページscrollを使わないitch検証を追加する。変更時はPages回帰を維持します。 |
| テスト | [browser action controls](../../tests/browser-action-controls.py) 10、34–58行／[browser match](../../tests/browser-match.py) 9、100–114行 | どちらも320×568境界と375×547を含みます。幅960px未満では操作欄をscrollIntoViewしてから初期geometryを確認し、action-controlsは低高時のpage-scroll後操作も許容します。 | **確認済みの検査不足**。375×547は仕様対象外なので成功を要求しません。320×568はサポート境界ですが、操作欄を先にscrollIntoViewする検査順のため、初期表示での操作可能性を証明しません。 | テストは変更せず保持。後続の棚卸しでPages・汎用回帰とitch受入条件を分けます。 |
| テスト | [call test](../../tests/browser-call-test.py) 391–420行 | 1280×550ではページ高overflowと、`#kan`をscrollIntoView後の成功を要求。959×900シナリオでも表示外なら通常操作欄を手動scrollしてから候補を測ります。`call-test.html`は専用検証entryです。 | 1280×550は対象外であり、スクロール後の成功はitch必須要件ではありません。959×900はサイズ上サポート範囲内でも、別検証entryの例外的なscroll設計で、itch packageの適合証拠ではありません。 | CIはそのまま。後続整理時にitch必須suiteから除外し、Pages／内部検証用テストとして扱うか決めます。 |
| テスト | [kan page](../../tests/browser-kan-page.py) 8–9、128–136行 | 375×547を含み、さらに高さを`max(380,height-120)`へ変えてカン候補・戻るを操作します。 | **確認済みの矛盾（テスト対象サイズ）**。いずれもサポート下限未満です。検証entryはitch packageに含まれません。 | テストを今回変更しません。itch版必須成功の証明に使わないことを整理します。 |
| テスト | [round-end UI](../../tests/browser-round-end-ui.py) 13–15、[dialog scroll](../../tests/browser-dialog-scroll.py) 7行 | WebKitでは320×480と375×547、dialog scrollでは320×480・1280×420を使います。結果・ダイアログ・内部scrollの確認が主目的です。 | itch最小viewportの検証とは**確認済みの対象外**です。ダイアログ内部scrollテスト自体は、内部scrollを許容する仕様と目的上は両立しますが、この小さいviewportの成功をitchに要求しません。 | ファイル・品質ゲートは維持。後続のテスト整理では内部ダイアログ機能テストとitchサポートレイアウト検証を分けます。 |
| テスト | [PWA layout](../../tests/browser-pwa.py) 132、162–193行 | 320×568、375×560、375×635、390×844、430×844でPages版のPWA通知・卓・操作欄のレイアウト不変と横overflowを確認します。 | **Pages版テストとして維持**。375×560はitch仕様では対象外ですが、Pagesの既存スクロール／PWA仕様を今回変更しないため、このケースだけを理由に削除・skipしません。全体縦scroll禁止・itch iframe操作の証明ではありません。 | Pages回帰として維持し、itchの適合根拠には使用しません。 |
| テスト | [itch package smoke](../../tests/browser-itch-package.py) 279–329、391–400行 | standalone itch buildを390×844で開き、対局・打牌を進めた後1280×800にresize。横scrollWidthやpackage/PWA分離、対局進行を確認します。診断は`iframe内実行: いいえ`をassertします。 | **確認済みの不足**。itch bundleの単体smokeではあるが実際のiframeではなく、最小320×568、399×635、960×600、縦scroll禁止、全操作局面の操作可能性を証明しません。 | 将来、itch buildをサポートviewportのiframe内に置くテストを加え、画面全体のscroll寸法と実操作hit testを測ります。real Draftサイズの測定は別途ユーザー実機で行います。 |
| テスト | [Issue #32 verification](issue32-candidate-anchor-2026-11-09.md) 35–50、98–119行 | 当時の11 viewportでローカル／オンライン候補位置・下端、内部scroll、戻る、scrollY、visualViewport変化を記録。例として375×634の操作欄は初回検査でbottom=649と画面外に出て、後続padding修正を行った履歴を明記します。 | 過去の「操作欄が画面外だった」問題とその修正履歴は保持。375×634での修正後結果は当時のテスト証拠であり、399×635の初回起動・サイズ変更や現行itch iframeの実測とは異なります。 | 記録を改変せず、399×635の3条件と320×568を新しい必須検証計画に加えます。 |
| 検証記録 | [Issue #46 itch HTML5記録](issue46-itch-html5-2026-11-05.md) 55–60、308–317、[itch smoke](../../tests/browser-itch-package.py) 314行 | fullscreen推奨、ユーザーiPhoneでiframe内起動・`html-classic.itch.zone` Origin報告があります。過去の実機報告はviewportの実寸値を含みません。現行standalone smokeはiframeではないとassertします。Issue #46はOpen。 | **確認できない**。実際のiframe幅・高さ、320×568以上での起動か、全画面scrollの有無は記録されていません。 | real DraftでゲームiframeのCSS px寸法・起動状態・操作結果を測り、実機報告と自動検証を分けて記録します。 |
| 検証記録 | [Issue #47 environment record](../verification/issue-47-environments.md) とIssue #47の2026-11-14コメント | developのPhase 5公開候補でBrowser UIのWebKit itch smokeが失敗し、公開関連jobは実行されず、追加の限定修正後もBrowser UIは失敗したとの記録があります。最新のコメントではstandalone smoke各3回とChromium全Browser UIの成功、WebKitの`browser-candidate-geometry.py` 375×560 online mixed-kan resize失敗を分けています。 | 375×560の失敗はサポート対象外で、320×568以上の仕様不達を示すものではありません。CI失敗はその時点のCIを失敗のまま扱う必要があり、**無効化・緩和の理由になりません**。Phase 5は本依頼でも禁止です。 | Issue #47の残るCI・環境受入条件は別作業で扱います。今回はworkflow・公開操作・Issue stateを変更しません。 |

### 対象外viewportを含む既存テスト一覧

下記viewportはitch.io版の新しい必須レイアウト検証から除外します。以下のテストは今回変更しておらず、除外は成功を要求しないという意味で、削除・skip・CI無効化を意味しません。

| 既存viewport | テスト・箇所 | 使用目的・後続整理 |
| --- | --- | --- |
| 375×560 | `browser-candidate-geometry.py:18`、`browser-pwa.py:132` | 候補geometryは操作位置・resizeを必須assert。PWAはPagesの既存layout比較として維持。 |
| 375×547 | `browser-action-controls.py:10`、`browser-match.py:9`、`browser-kan-page.py:8`、`browser-deposit-lifecycle.py:9`、`browser-cpu-riichi.py:12`、`browser-step13-5.py:10`、`browser-step13-5-5.py:11`、`browser-step13-5-4.py:13`、`browser-step13-5-3.py:13`、`browser-step13-5-2.py:8`、`browser-step13-4.py:10`、`browser-step13-3.py:9`、`browser-step13-3-regression.py:11`、`browser-step13-3-1.py:9`、`browser-shanten.py:8`、`browser-riichi.py:10` | 歴史的なsmoke・ゲーム／操作回帰のviewport行列。action-controls/matchはページscroll後操作もassertします。全テストの成功をitchレイアウト保証に読み替えません。 |
| 320×480、375×547、844×390 | `browser-round-end-ui.py:15` (WebKit 320×480・375×547)、`:791` (高さ320へ変更)、`browser-dialog-scroll.py:7`、`browser-offline-rules.py:188` | 小さい・横向きviewportでの結果・ダイアログ・ルールUI履歴。`browser-round-end-ui.py:791`は幅320、355、375、390、430、1280pxで高さ320pxにします。内部scrollテストはその用途で維持。 |
| 320×360、390×320 | `browser-online-waiting-room.py:1018`、`1842`、`1912`、`2735`、`2779` | 待機室／ダイアログ専用シナリオ。itch全体viewportの受入条件とはしません。 |
| 1280×550、1280×420、1280×400 | `browser-call-test.py:392`、`browser-dialog-scroll.py:7`、`browser-call-decision-dialog.py:363` | 短いPC高の検証。特にcall-testはスクロールしてカンボタンへ到達する前提。 |
| 横向きの667×375、844×390、ほか幅320px以上・高さ568px未満の組合せ | `browser-mobile-table-layout.py:8`、`browser-online-dialog-layout.py:12–14`、`browser-online-waiting-room.py:1660`、`browser-offline-rules.py:188` 等 | Issue #32のPages／過去の回転対応検証として履歴を維持。今回のitch最小サポート範囲には含めません。 |
| 高さを`height-120`／320px等にしたviewport | `browser-kan-page.py:133`、`browser-cpu-tsumo.py:106`、`browser-check.py:265,327,412`、`browser-ron.py:116,188`、`browser-scoring.py:94`、`dora-layout-check.py:113`、`browser-round-end-ui.py:791`、`browser-online-waiting-room.py:1842` 等 | 局面・ダイアログ用の二次的viewport。サポート下限未満になった後の画面収容・操作は保証対象外です。 |

コード上で320×500、319×568の具体的な行列は確認しませんでした。これは今回それらを新規テストへ加える理由にはなりません。375×547を含む歴史的な対局smokeは前の行に列挙しました。加えて`browser-online-waiting-room.py`の844×390、待機room／dialog用の320×360・390×320等、`browser-call-decision-dialog.py:363`の1280×400、およびviewport高を下げる前記テストの動的ケースが見つかりました。上表は主要画面・レイアウト関連とコード検索で確認した下限未満の例であり、全Browser UIの全assertを個別に実行した監査ではありません。

## 必須テスト計画（追加・変更は別作業）

最低限、次のviewportをitch.io版の必須行列にします。これは提案する検証対象であり、今回の実装結果や達成済みを示しません。

| viewport | 検証上の意味 |
| --- | --- |
| 320×568 | 最小境界。画面内操作とページ全体scrollなしを必須確認 |
| 375×635 | スマホの低い表示領域 |
| 399×635 | 今回のはみ出し報告に対応 |
| 390×844 | 通常スマホ |
| 960×600 | 低いPC window、450px卓下限との競合境界 |
| 1280×720 | 標準PC |

各対象サイズの初回起動、サポート範囲内リサイズ、高さだけの変更、オンライン／オフラインでの通常打牌・鳴き・ロン・カン・局結果・次局を通じて、必要ボタンのviewport内矩形・hit test、document scrollX/Y・scrollWidth/Heightを確認します。399×635は初回起動、375→399への変更、399→375への復元を別シナリオにし、320×568を境界条件として扱います。長い候補・ダイアログは内部scrollと戻る／閉じる／確定操作を確認します。

itch package smokeとPages PWA Browser UIを別の入口・合否として扱います。ローカルBrowser UIでiframeを模擬する場合も、それはiframe内ゲームviewportを検証した自動テストであり、実際のitch.io表示枠の実測とは記載しません。実Draftのiframe実効CSS pxとFullscreen／Mobile Friendly状態は別途実測します。

## 監査結果一覧

| 分類 | 対象ファイル・箇所 | 現行の内容 | 確定仕様との関係 | 必要な対応 |
| --- | --- | --- | --- | --- |
| 設計 | `docs/verification/issue32-responsive-layout-2026-11-03.md:27–31`、`docs/SPEC.md:111` | 短いviewportはページ縦scrollを許容。卓縮小より可読性・450px下限を優先する履歴。 | **確認済みの矛盾**。Pagesでは既存方針維持、itchでは対象範囲内に適用不可。 | itch用の卓縮小と操作領域確保の計算を別途設計。 |
| 設計 | `docs/verification/issue32-candidate-anchor-2026-11-09.md:20–27,123–127` | 候補は操作欄下端を保存。例外viewportの候補確認前に手動scrollする検査例。 | 候補の内部scrollは**整合**。操作欄が画面内で始まる保証はない。 | 通常操作欄を先に画面内へ収めてから候補anchorを保存。 |
| 設計 | `docs/verification/issue46-itch-html5-2026-11-05.md:55–60,308–317` | fullscreenを推奨。iPhone iframe内報告はあるがiframeサイズは記録なし。 | fullscreen前提はサイズ保証ではない。**確認できない**。 | 実際のiframe viewportを別途実測。 |
| 実装 | `src/style.css:709–735` | PC卓の高さ計算に450px floor、操作108px。 | 960×600で式上の残り高約320pxに対し450pxを強制し、**確認済みの寸法矛盾**。ブラウザー上の実測はしていない。 | floorを操作可能性より優先しない設計へ変更。 |
| 実装 | `src/style.css:10–12,45–70,163–167` | documentは通常scroll可能。操作欄はフロー内、候補一覧だけ内部scroll。 | 候補一覧の内部scrollは**整合**。ゲーム全体の縦収容は**未確認**。 | 対応サイズ・状態で縦横overflowとhit testを計測。 |
| 実装 | `src/ui/action-panel.ts:227–233,543–612`; `src/ui/call-viewport.ts:14–28`; `src/ui/candidate-selection.ts:101–115`; `src/main.ts:198–205,242–250` | 候補はwindow／visualViewport変化に追従し、focus時はscrollを防止・復元します。一方、新規対局・次局は現在scrollYが0でなければ`scrollTo(0,0)`します。 | 候補処理は一部**整合**。新規対局・次局時の文書位置移動が操作の前提か、サポートviewportで発生するかは**実測未確認**。 | itch経路でscrollYを0に保ち、リサイズ時も通常欄・候補・戻るが初期表示内か計測。サポートサイズで状態遷移時に文書移動するなら解消する。 |
| 実装 | `index.html:5`; `vite.config.ts:16–36`; `scripts/package-itch.mjs:42–68` | HTMLにdevice-width／viewport-fit metaがあり、itch buildは同じ`index.html` entryを使いPWA link等を除いてpackageします。別のitch専用layout分岐は確認できません。 | iframe内の実効viewportをCSS layoutがどう扱うかは**確認できない**。共通実装を使う関係は確認済みです。 | 模擬iframe検証と実Draft実測を行い、共有layout変更はPagesへの影響も検証。 |
| テスト | `tests/browser-mobile-table-layout.py:7–9,171–180,246–260`; `tests/browser-action-controls.py:10,34–58`; `tests/browser-match.py:9,100–114` | mobile-table-layoutの行列には境界の320×568があり、打牌前にdiscardを`scroll_into_view_if_needed()`し、主に横overflow・打牌後の状態を検査します。action-controls／matchも320×568と375×547を含み、960px未満では初期geometry前に操作欄をscrollIntoViewします。 | **確認済みの検査不足**。375×547は対象外なので成功を要求しません。サポート境界の320×568も先にページscrollする可能性がある検査順で、scroll前の初期操作可能性を証明しません。横向きの667×375・844×390は対象外です。 | テストは変更せず保持。将来、Pages／汎用回帰とitch受入条件を分け、itch側では初期scrollYと通常操作欄をscroll前に検査します。 |
| テスト | `tests/browser-candidate-geometry.py:18–19`; `tests/browser-pc-table-layout.py:9,295–313` | 候補状態・オンライン／オフラインの検査はある。375×560が候補matrixに含まれ、960×600がPC matrixにない。 | 下限未満成功はitchに**不要**。960×600の必須確認は不足。 | CIを緩和せず、6つのサポートviewport向けitch行列を追加する別作業。 |
| テスト | `tests/browser-itch-package.py:279–329,391–400` | standalone itch package、390×844開始、後で1280×800へresize。iframe内でないことを明示。 | itch package smokeだがiframe・最小境界・縦scroll・全状態を証明しない。 | itch固有のiframe viewport行列を別途設計。 |
| テスト | `tests/browser-pwa.py:132,162–193` | 375×560を含むPages PWA配置検査。 | Pages回帰として維持。itch適合証拠ではない。 | Pages仕様・ゲートは変更しない。 |
| 検証記録 | `docs/verification/issue32-candidate-anchor-2026-11-09.md:58–60,98–119`; Issue #47 2026-11-14コメント | 375×634の当時の初回操作欄はviewport外だった履歴と余白修正。最新の375×560 WebKit failureはmixed-kan resize幅ずれ。 | どちらも399×635実Draft測定ではない。375×560失敗はitch対象外。 | 履歴は保持し、対応範囲内の初期起動・resizeを新規測定。 |

## 優先順位と残作業

1. **itch版のページscroll依存を外す**：PCの450px下限・短い画面のpage scrollを扱い、ヘッダー・点数・必要操作・余白を先に確保した残りへ正方形の卓を収めます。標準PCだけでなく960×600と320×568が境界です。
2. **操作領域を全状態で再計算・配置する**：通常打牌、鳴き種類、候補／戻る、ロン／ツモ／カン、局結果／次局。候補anchor下端を保つ機能だけでは、anchor自体が画面外の問題を解決しません。
3. **初回起動・resize・復元を実装検証する**：399×635初回、375→399、399→375、縦高だけ変更を別に扱い、オフライン／オンライン双方で確認します。必要ならissue 32の共通CSS・layout modeへの変更がPages版にも及ぶ影響を検証します。
4. **itch固有のBrowser UI検証を設計する**：iframe内のCSS viewport、縦横document overflow、操作要素矩形・hit test、scrollY不変、状態遷移を確認します。実際のitch表示サイズは実Draftで別途計測します。
5. **下限未満テストの棚卸しを別作業で行う**：今回のテストコードは不変。既存の必須CIは維持し、各サイズの成功をitchのサポート条件へ読み替えないよう、Pages／汎用UI／itch受入行列を分ける整理を提案します。テストの削除・skip・ゲート緩和はこの変更に含めません。

卓の実用最小寸法・牌の可読性に数値を置くには、対応viewportで卓を縮小して測定した後の追加設計が必要です。今回の監査はその数値を推測していません。

## 監査範囲の限界・Issue状態

- 本作業ではCSS/HTML/TypeScript、テスト、workflowを実行・変更していません。実ブラウザーで320×568、375×635、399×635、390×844、960×600、1280×720を測定していません。
- 実際のitch.io iframeのCSS px幅・高さ、Fullscreen起動後のviewport、横スクロール／縦スクロール、個別状態でのボタン操作は**未確認**です。ユーザーの既存itch起動報告にないサイズ値を実測として追加していません。
- `docs/verification/issue32-responsive-layout-2026-11-03.md`、`issue32-candidate-anchor-2026-11-09.md`、`issue46-itch-html5-2026-11-05.md`等の過去記録は削除・改変していません。
- GitHubから読み取り確認したIssue #32、#46、#47はOpenです。Issue本文・コメントを更新せず、Closeしていません。Phase 5公開操作は行っていません。
