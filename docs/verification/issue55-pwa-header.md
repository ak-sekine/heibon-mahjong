# Issue #55 PWAヘッダー内更新通知（2026-11-10）

## 範囲と開始状態

暗カン・加カン、ゲーム進行、通信、Workerは変更しない。
作業ブランチwork、未コミット変更なし、未pushコミットなし。
開始HEAD／fetch後origin/main: c646007818baedc2b5bc6f6b0550b824a302f969、behind/ahead 0/0。
origin: https://github.com/ak-sekine/heibon-mahjong.git。
通常のfetchはproxy:8080接続段階で失敗。正規の許可付き同一fetchは成功。

## 変更

従来はmain先頭の通知行が卓を押し下げていた。通知を既存ヘッダー内へ移し、
高さ44px固定・タイトル省略・更新ボタン44px高で収めた。
メニューと卓サイズ、main余白は変更しない。状態説明は視覚的に隠して
aria-describedbyとlive regionを維持する。複数タブのブロック理由はアラートでも表示する。
登録条件、確認承認、延期、controllerchange後の再読み込み、重複生成防止は維持。
itchの登録スキップ、相対パス、ビルド構成は変更なし。

## 自動検証

- npm test: 86件成功、失敗0。
- npm run build: 成功。
- npm run build:itch: Worker URL未設定では既存設定のエラー。CIと同じ
  VITE_ONLINE_API_URL=https://online-mock.invalid指定で成功（本番公開用ZIPではない）。
- Python構文検査・git diff --checkを実施。
- ブラウザーはAGENTS.mdの既知のCloud起動制限に従い既存Deploy内のBrowser UIを使用。
  対象コミットc536da35f0af099d4e28408177411dc38a749904の両エンジンとも成功。

PWAテストは実際のService Worker更新を使用する。320×568、375×560、375×635、
390×844、430×844で通知なし／あり／キャンセル後／ブロック後を実測する。
ヘッダー44px、卓のXY幅高さ・操作パネル矩形・scrollXY不変、横overflowなし、
タイトルとボタン非重複、両ボタン44×44以上、メニュー開閉・更新クリックをassertする。
確認中はブラウザー標準confirmでJS評価が停止するため、その間のDOM実測は行えない。
confirmの発生とdismiss、前後の寸法不変を検証する（確認中の寸法は未実測）。
測定JSONはBrowser UI artifactのpwa-header-chromium.json／pwa-header-webkit.jsonに保存。
既存のオフラインCPU対局、更新失敗復旧、明示承認、複数タブ、再読み込み、キャッシュ削除も維持。

## iPhone Safari実機（2026-11-10の確認依頼時点：すべて未確認）

Safariとホーム画面PWAのそれぞれで、次をユーザー本人が確認する。

1. 通知なしで従来のヘッダー表示となる。
2. 新版検出時のみヘッダー内に「更新あり」が表示される。
3. 卓・操作欄が下がらず、スクロールがジャンプしない。
4. 更新とメニューを別々に操作できる。狭い画面でも重ならない。
5. 更新承認で再読み込みされる。
6. キャンセル・延期後も対局を継続できる。
7. 別タブがある場合は理由が通知され、閉じて再試行できる。

自動WebKit検証は実機確認の代替ではない。Issue #55のCloseは行わない。

## Actionsと実測結果（2026-11-11追記）

[Deploy run 42925490208](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42925490208)
でChromium／WebKitのPWA・Browser UI全件成功、両エンジン監査成功。
itchスモークは両エンジンとも前後各3回成功。既存オンラインBrowser UIと本番オンライン検証も成功。
測定JSONは[Chromium](issue55-pwa-header-chromium.json)／[WebKit](issue55-pwa-header-webkit.json)。
artifact ZIPはダウンロード先ドメインがForbiddenのため取得できず、GitHubコネクターの
各完了ジョブログに出力された測定JSONを取得・保存した。

以下の卓・操作欄の値は両エンジン共通。単位CSS px。
通知なし→あり→キャンセル→複数タブブロックで全て同一。
旧実装自体の寸法は未実測で、変更前比較はソース上の通常フローの通知行との比較。

| Viewport | ヘッダー高 | 卓 X,Y,幅,高さ | 操作欄Y | scroll X,Y | 横overflow |
|---|---:|---|---:|---|---|
|320×568|44|10,108,300,300|412|0,0|なし|
|375×560|44|41.5,108,292,292|404|0,0|なし|
|375×635|44|0,108,375,375|487|0,0|なし|
|390×844|44|0,116,390,390|514|0,0|なし|
|430×844|44|0,116,430,430|554|0,0|なし|

更新ボタンのYは全て8、高さ44、幅はChromium 76／WebKit 76.65625。
メニューは全てY=8、44×44。通知前後でメニュー座標も同一。

| Viewport | 更新X Chromium | 更新X WebKit | メニューX（共通） |
|---|---:|---:|---:|
|320×568|190|189.34375|270|
|375×560|237|236.34375|321|
|375×635|237|236.34375|321|
|390×844|252|251.34375|336|
|430×844|292|291.34375|376|

ボタン非重複、画面内、メニュー開閉、更新confirm・キャンセル・再試行、
ブロックalert、承認後の再読み込み・キャッシュ切替に成功。
全測定はスクロール先頭で実施。スクロール途中の通知発生は未実測。

## 追加要件の受入判定（初回実装時点）

1. ヘッダー44px・卓／操作欄Y不変: 自動検証OK。
2. 幅320／375／390／430で非重複・操作・横スクロールなし: 自動検証OK。
3. 更新承認・キャンセル・複数タブブロック・再読み込み: OK。
4. Chromium／WebKitのPWA・Browser UI回帰: OK。標準confirm表示中の寸法は未実測。
5. npm test・build・PWA検証: OK。itchビルド・スモークもOK。
6. iPhone実機チェック項目の用意と区別: OK。実機結果自体は未確認。
7. 変更・検証・コミット・公開状況の報告: 本記録と最終報告に記載。PR作成なし。

暗カン・加カンUIのClose判断は今回行わず、IssueはOpenのままとする。

## 公開状態

実装コミット: c536da35f0af099d4e28408177411dc38a749904。
mainへのfast-forward push成功、push後のgit ls-remoteも同SHA。
Deploy全体、Pages build、Pages deployはすべてsuccess。
公開先: https://ak-sekine.github.io/heibon-mahjong/ 。
この環境から公開URLへのcurlは通常実行でproxy接続失敗、許可付き実行ではHTTP 403。
したがって公開ページを直接取得しての反映確認は未確認。CIによるデプロイ成功とは区別する。
Actions全体ログZIPも配信先Forbiddenのため、GitHubコネクターの個別ジョブログと
GitHub APIの対象SHA・ジョブ結果で確認した。履歴改変・PR作成・Issue更新なし。


## 2026-11-11 最終調査・本人実機報告

### 作業基準とCI失敗

開始branch `work`、HEADと正規の許可付きfetch後origin/mainは
`962c498cc4afc15b1574c8fef21506b7de5659b3`、behind/ahead 0/0。
未コミット変更・未pushコミットなし。通常fetchはproxy port 8080接続段階で失敗し、
許可付きの同一fetchは成功した。古いorigin/mainのahead 830件はfetch前の追跡情報であり、
未pushコミットではない。

成功SHA `c536da35f0af099d4e28408177411dc38a749904`と失敗SHA `962c498`の差分は
本Markdownと測定JSON 2個だけ。製品コード、PWAテスト、lockfile、workflowは同一。
[失敗run #42928465922](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42928465922)の
Chromium job `130221473256`／WebKit job `130221473199`はともに320×568で
操作欄高さ37→81px、Y=412px、卓(10,108,300,300)、scroll(0,0)不変だった。
成功runの320×568では81→81pxだった。

`#local-table`のvisibleだけを開始条件にしていたが、座席は`GameController.beginMatch()`で
ランダム抽選され、CPU親の手番進行と人間の入力待ちは異なる。
`createLocalActionPanelState()`は人間が打牌可能なときだけdiscardを表示する。
320pxのCSSでは、状態文・空のaction-buttons・余白の操作欄に44pxのボタン行が加わると
37→81pxとなる。`assert_layout()`は矩形全体を比較するため、通知に無関係な手番遷移を
レイアウト回帰として扱っていた。両engineは同じゲーム状態生成と表示条件を使う。

成功／失敗runのChromiumはともにUbuntu 26.04 image `20261101.186.1`、
Python 3.12.16、Playwright 1.65.0、revision 1254。失敗WebKitはrevision 2388。
CI条件変更は差分にもChromium環境ログにもなく、CPUのランダム座席と実行タイミングが
比較状態に影響する。初回テストは状態やボタンを記録しておらず、失敗時の正確な座席・phaseは
旧ログだけでは復元できない。通知前後のSWは旧controllerと新waiting workerで、
テストは明示承認まで旧画面を維持する。更新通知はheader内であり、操作欄の子やCSSを変更しない。
フォントはsystem-ui系で、失敗時もタイトル・卓・操作欄の幅と座標は一致している。

修正はテストのみ。人間の手牌ボタンがenabledかつdiscardがvisibleになる入力境界を待ち、
途中の鳴き／ロン判断は見送って進める。固定sleepは追加しない。
測定前に`document.fonts.ready`と2回のanimation frameを待ち、resize後の描画を揃える。
通知前後の状態文・enabled手牌数・残り山・表示ボタンとdisabled状態も一致を要求する。
卓・操作欄の矩形全体、scroll、header 44px、ボタン44px、非重複・横overflowのassertは維持。
開始直後と入力待ち後の実測もログへ出す。旧テストの失敗は両engineの既存CIログで確認済みで、
Cloud内のローカル再現は行っていない。修正後の状態・寸法と判定確定は後続Actions記録を参照。

カン座標matrixには375×560／375×635を明示追加し、既存11 viewportを含む13 viewportで
ローカル／オンライン×7局面、各engine 182ケースを検証する。PWAは従来の5 viewportを維持。

### ユーザー本人によるiPhone Safari実機報告

確認日2026年11月11日、確認者・報告者はユーザー本人。Codexによる実機確認ではない。
**OK 6件／NG 0件／未確認1件**。機種、OS、Safari版、viewportは未報告。
Safariとホーム画面PWAの個別実施状況も報告から特定できず、補完しない。

| No. | 確認項目 | 結果 |
| --- | --- | --- |
| 1 | 通知なしでヘッダーが正常表示される | OK |
| 2 | 「更新あり」がヘッダー内に表示される | OK |
| 3 | 通知表示時も卓・操作欄が下がらない | OK |
| 4 | 更新ボタンとメニューを操作できる | OK |
| 5 | 更新承認で再読み込みされる | OK |
| 6 | キャンセル・延期後も対局を継続できる | OK |
| 7 | 複数タブの更新ブロックが正常に表示される | 未確認 |

複数タブは自動検証と実機未確認を別々に扱う。既存のカン本人報告は
[2026-11-10記録](issue32-single-kan-2026-11-10.md#修正後のiphone-safari実機確認結果)の
暗カン単一、加カン単一、暗カン複数の表示・戻る・再選択・確定の3件OKのみ。
複数候補の下端固定・上方向展開、Safariツールバー表示・収納後のタップ、
候補内スクロール・卓やページ位置の復元は実機未確認を維持する。

### Issue #55受入条件17件の個別照合

以下は既存証拠に基づく評価。今回の修正後CI完了までは最終判定を保留する。
コードは`src/ui/action-panel.ts`、`candidate-selection.ts`、
`src/rendering/local-action-panel-state.ts`、`src/online/action-panel-state.ts`、
`src/style.css`、`src/pwa/register.ts`を照合した。仕様変更はなくSPEC変更は不要。

| ID | Issue本文の受入条件 | 評価 | 証拠・限界 |
| --- | --- | --- | --- |
| K1 | 候補0／1／2件以上の表示・実行 | 達成 | action-panel/state単体、browser-call-test／candidate-geometry。本人は単一暗カン・加カン、複数暗カンOK。0件は単体で検証。 |
| K2 | 暗カン・加カン混在の候補と実行対象一致 | 達成 | mixed-kan単体／実controllerの両mode座標matrix。混在実機は未報告だが条件は実機必須ではない。 |
| K3 | 卓直下基準・上方向展開・候補と戻る・独立dialogなし | 達成 | 共通showCandidatesとfixed panel、増加前後の下端差0px・上端移動・hit test。本人は選択操作OK、展開方向は実機未確認。 |
| K4 | 卓寸法・座標不変、意図しないscroll・タップ阻害なし | 達成 | 実controller両modeの卓矩形・scroll・hit testと予約高assert。実機の位置・復元までOKとはしない。 |
| K5 | 多数候補は内部scroll、戻る操作を維持 | 達成 | 100候補でoverflow、内部scroll、戻るhit test。実機内部scrollは未確認。 |
| K6 | 通常パネルを恒常的に高くせず、候補中だけ重ねる | 達成 | 表示前の実高さをcandidate-activeで予約、戻るで解除・復元する自動検査。 |
| K7 | 合法性・成立後進行・鳴き・ロン等・同期の回帰なし | 一部達成 | 既存単体・両engine・オンライン成功。今回の全回帰結果は待機中。 |
| K8 | 両engine、320／375／390／430と短viewportの実測 | 一部達成 | 既存11 viewport＋375×547検証あり。要求例375×560／635をmatrixに追加し、今回CI待機中。 |
| K9 | Pages／itchビルド経路と実機チェック提示、結果の区別 | 達成 | 既存run #42725848081／#42925490208成功、チェックと本人報告を別記。今回ビルドもローカル成功。 |
| K10 | 仕様・測定・検証・残課題の記録 | 達成 | SPEC、既存座標CSV、本記録と後続Actions結果。 |
| P1 | header44px、卓・操作欄Y不変 | 達成 | 初回両engineの5 viewport実測、本人No.1〜3 OK。今回も矩形全体assertを維持。 |
| P2 | 4幅で非重複・操作・横overflowなし | 達成 | 初回両engineの寸法・click・menu検査。本人No.4 OKは幅不明。 |
| P3 | 承認・キャンセル・複数タブ・再読込 | 達成 | 実SWと2 clientの自動検証。本人No.5〜6 OK、複数タブ実機は未確認。 |
| P4 | 両engineのPWA／Browser UI回帰 | 一部達成 | 初回成功、最新旧CI失敗。今回修正後CI待機中。 |
| P5 | npm test・build・必要なPWA検証 | 一部達成 | ローカルtest 86ファイル・build成功。修正後PWAのCI待機中。 |
| P6 | iPhoneチェック項目を用意、自動と区別して記録 | 達成 | 本人6 OK／0 NG／1未確認を別記。実機7項目全成功という条件ではない。 |
| P7 | 変更・CI・実機未確認・SHA報告、PRなし | 一部達成 | 本記録を更新。今回pushとActions結果、Issueコメントは後続記録で確定する。 |

K3〜K6の位置・内部scrollは受入条件に実機指定がなく、実controllerの矩形・hit testを
根拠に判定する。実機成功へ置き換えない。K9／P6はチェック提示と区別した記録を求めており、
未報告の全実機項目を追加の必須条件にはしない。P3は実SW／複数clientによる自動検証が
機能要件の証拠となるため、複数タブ実機未確認だけでは未達にしない。

Issue #32の必須PC実機・主要画面全体・Safari可変ツールバー、Issue #52の方向別実機・
キーボードfocusは、それぞれのIssueの残課題であり、#55へ一括転記しない。
#55の追加実機確認としては候補の展開方向・内部scroll・ツールバー変化後の操作、
PWA複数タブブロックを推奨し、未確認を保持する。
**現時点の暫定判定は一部完了・Open維持。修正後CIを確認して最終判定を追記する。**

### ローカル検証

`npm test` 86ファイル成功、失敗0（Node 24.19.0）。`npm run build`、
`npm run typecheck:worker`、CIと同じmock Worker URL指定の`npm run build:itch`成功。
Python構文検査、Browser UI選択テスト9件、`git diff --check`成功。
CloudではAGENTS.mdの既知ブラウザー制限に従い、既存Actionsで両engine・itch smoke・
オンライン・matrix audit・Deploy gateとPages／itch公開ビルドを実行する。
