# Issue #32: カン単一候補の即時実行（2026-11-10）

最新の本人実機報告は[修正後のiPhone Safari実機確認結果](#修正後のiphone-safari実機確認結果)を参照。2026-11-10の報告4項目は**OK 3件・NG 0件・未確認1件**。表示位置・Safariツールバー変化後の操作、必須PC実機確認が残るため、Issue #32は**Openを維持**する。以下の修正・公開時点の記録も履歴として保持する。

## 本人の実機報告と確認状態（修正・公開時点）

ユーザー本人の今回の報告: **iPhone Safari実機で、暗カン候補が1件だけでも候補選択パネルが表示された（NG）**。
過去の実機OK／NG記録は維持する。この修正後のiPhone Safari実機確認は**未確認**。自動Chromium／WebKit検証を実機OKと扱わず、Issue #32は**Openを維持**する。

## 作業開始時のGit状態

- 作業場所: `/workspace/heibon-mahjong`、ブランチ: `work`、remote: `https://github.com/ak-sekine/heibon-mahjong.git`。
- 作業ツリーclean、未pushコミットなし。開始HEAD／fetch成功後のorigin/main: `0af27b3674b678669869325048407c02a698623a`。behind/ahead: `0 / 0`。
- 通常sandboxの`git fetch origin`はプロキシport 8080への接続に失敗。正規の許可付きで同じfetchを再実行し成功した。

## 実装

- `ActionPanel.selectSingleCandidate()`を種類ボタン押下時の共通入口とし、有効候補1件を既存`CandidateSelection.show(..., 'select')`で確定する。暗カン／加カンは既存`select-kan`、ポン／チー／大明カンは既存`select-call`へ渡す。
- 有効候補0件ではカンを実行しない。2件以上は従来の`kan-toggle`による候補表示へ進む。描画更新に自動確定を入れず、押下前・送信失敗・拒否・状態同期の再描画による自動実行を防ぐ。
- 入力のoperationId／panelIdを維持し、確定時のactionType／candidateIdを実際の候補へ更新する。即時カンの診断元は`kan-toggle`。確定前にカンボタンと戻るを無効化し、送信中は既存stateによる無効化を継続する。
- `CandidateSelection`の単一確定も候補自身のoperationTypeを優先する。ローカル／オンラインstate builderは全カン候補を既に保持しており、調査と混在候補テスト追加のみで製品実装は変更しない。
- 合法判定、通信仕様、ゲーム状態更新、嶺上ツモ、ドラ処理、CSS・卓サイズ・Safari向け候補配置は変更しない。検証ページの案内を新操作へ更新した。

## 変更ファイル

- 製品UI: `src/ui/action-panel.ts`、`src/ui/candidate-selection.ts`。
- 検証ページ案内: `src/verification/scenarios.ts`。
- 単体テスト: `tests/action-panel.test.ts`、`tests/action-panel-state.test.ts`。
- Browser UI: `tests/browser-action-panel.py`、`tests/browser-call-test.py`、`tests/browser-candidate-geometry.py`、`tests/browser-pc-table-layout.py`、`tests/browser-kan-page.py`、`tests/browser-step13-5.py`、`tests/browser-step13-5-5-kan.py`。
- 仕様・記録: `docs/SPEC.md`、この文書。

## 検証

- ローカル`npm test`: 86テストファイル成功（全体実行時点）。追加の混在state／候補自身の操作種別テストを含む関連2ファイルも再実行し成功。
- `npm run build`、`npm run typecheck:worker`: 成功。
- Browser UI選択テスト: 9件成功。変更したPythonの構文検査、`git diff --check`: 成功。
- 新規単体テストは、押下前の非実行、暗カン／加カンの単一即確定、trace引継ぎ、連打、送信中、拒否・タイムアウト後の明示再操作、0候補、混在する異なる合法候補の保持を確認する。
- Browser UIは既存Deploy workflowのChromium／WebKitで実施する。通常対局の実controller／state builderとオンラインcontrollerを用い、11 viewportで暗カン単一・複数、加カン、暗カン＋加カン混在、ポン複数、チー複数、大明カンを検査する。単一カンでは送信中連打、タイムアウト時の同期待ちと確認による解除、拒否、送信失敗からの復帰を検査する。タイムアウトはcontrollerへの既存接続状態／状態確認イベントで再現し、通信層のタイマーテストは既存suiteが担当する。
- `call-test.html`の暗カン単一・複数・加カンは即実行／パネル表示を分けて検査する。複数候補の戻る、再選択、内部スクロール、Safari相当可視領域、卓矩形・操作領域下端の保持を維持する。PCの候補位置テストと短画面の戻るテストは複数暗カン局面へ移した。
- Cloudの既知のChromium起動制限はリポジトリの手順に従い再調査せず、Browser UIとDeploy gateは対象コミットのActions結果を確認して記録する。

## Actions結果

- 実装コミット: `71988435adf6396900394f78ec3dd1a5604a4531`。`git push origin HEAD:main`成功、push直後の`git ls-remote origin refs/heads/main`で同SHAを確認した。
- [Deploy run #42725848081](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42725848081)、attempt 1。Chromium **45本成功**、WebKit **35本成功**（baseline観測を含む）。両jobのログから成功notice数と対象scriptの成功を確認した。失敗・再実行なし。
- 両engineで`browser-action-panel.py`、`browser-call-test.py`、`browser-pc-table-layout.py`、`browser-candidate-geometry.py`が成功。通常対局／検証ページ／オンラインUIの3経路を検査した。
- 現行geometryは各engineで11 viewport × 2モード × 7局面 = **154ケース**成功。単一候補3局面（大明カン、暗カン、加カン）はパネルなしの確定、複数／混在候補4局面は戻ると配置維持を検査した。現行geometry実行時間はChromium 94.182秒、WebKit 117.738秒。
- `verify`（全単体・結合テスト、Worker型チェック、Pages／itchビルド）、`browser-ui-matrix-audit`、`release-freshness`、`deploy-worker`、`production-test`はsuccess。Worker Deployment ID: `7669913856`（同実装SHA）。
- 同runのPages build／deployもsuccessし、run全体がsuccessで完了した。Worker `7669913856`、GitHub Pages `7669938648`、production Pages追跡 `7669943798`のDeployment statusはすべてsuccess、SHAは `71988435adf6396900394f78ec3dd1a5604a4531`で一致した。
- **公開SHA: `71988435adf6396900394f78ec3dd1a5604a4531`**。公開URL: https://ak-sekine.github.io/heibon-mahjong/ 、検証ページ: https://ak-sekine.github.io/heibon-mahjong/call-test.html 。公開確認はActionsとDeployment statusで行い、iPhone Safari実機確認とは区別する。
- 最終結果を追記する記録はMarkdownのみの変更として別コミットでmainへ直接pushする。製品コードは上記公開SHAと同一。

公開結果記録時点では、公開後のiPhone Safari実機確認は**未確認**。Issue #32は**Open**を維持する。公開ページの暗カン単一／加カンは「カン」1回で確定し、暗カン複数は候補→戻る→再選択を行えること、Safariツールバー変化後も複数候補を操作できることを本人の再確認項目として残した。後続の本人報告は次節に記録する。

## 修正後のiPhone Safari実機確認結果

- 確認日：**2026年11月10日**。確認者・報告者：**ユーザー本人**。環境：**iPhone Safari実機**。Codexが実機確認を実施したものではない。
- 今回の報告4項目に限定した集計：**OK 3件、NG 0件、未確認1件**。Issue #32全体の結果・達成件数ではなく、過去のPC／iPhone報告の件数にも合算しない。
- 機種、iOSバージョン、viewport寸法、Safariバージョン等は未報告。自動検証のviewport等から推測で補完しない。通常対局／検証ページ／オンラインなどの個別実施経路も今回の報告だけでは特定しない。

| 項目 | 結果 | 本人の実機報告・確認範囲 |
| --- | --- | --- |
| 1. 暗カン・単一候補 | OK | 「カン」を1回押すと、候補パネルを開かずに成立する。 |
| 2. 加カン・単一候補 | OK | 「カン」を1回押すと、候補パネルなしで成立する。 |
| 3. 暗カン・複数候補 | OK | 候補が表示される。「戻る」が正常に動作する。再選択と候補確定ができる。 |
| 4. 表示位置・操作性 | 未確認 | 複数候補の下端固定と上方向展開、Safariのツールバー表示・収納後の正常なタップ操作は今回の報告では未確認。 |

### 修正前NGとの照合と未確認の範囲

修正前の「暗カン候補が1件でも選択パネルを表示する」というNGは、今回の本人の実機報告で**解消確認済み**とする。加カンの単一候補も即時実行OK。暗カン複数候補は、候補表示・戻る・再選択・確定という報告された操作範囲をOKとする。

複数候補パネルが**元の操作欄の下端を維持し、候補の増加分だけ上方向へ展開すること**、**Safariツールバー表示・収納後も正常にタップ操作できること**は、引き続き実機未確認。項目3のOKから、位置・高さ・卓やページ位置の復元・候補内スクロールまで一括でOKとはしない。以前の下方向展開やポンとの表示差異のNG全体を解消済みにする報告でもない。

過去のPC／iPhone実機OK・NG、当時の「修正後実機未確認」、自動テスト結果は削除せず時系列で保持する。[位置・高さ共通化の記録](issue32-candidate-anchor-2026-11-09.md)にある座標値はBrowser UIの実測で、今回のiPhone実機座標ではない。[従来の実機履歴とPC詳細評価](issue32-responsive-layout-2026-11-03.md#2026-11-08-pc実機確認結果と受け入れ条件の再評価)も継続して参照する。

### 既存の自動検証・公開記録との照合

| 出典 | 確認した既存結果 | 今回の本人報告との区別 |
| --- | --- | --- |
| [実装・公開 run #42725848081](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42725848081) | head SHA `71988435adf6396900394f78ec3dd1a5604a4531`、main、completed / success。Chromium **45本**／WebKit **35本**成功。単一カン候補即時確定、複数候補の表示・戻る・確定、候補パネルの座標、オンライン操作・再接続回帰、Deploy gate、Worker公開、Pages build／deployの既存成功記録を確認。 | 自動検証・公開の成功。今回の実機OKは上記項目1〜3だけ。下端固定・上方向展開はBrowser UIで検証済みでも、iPhone Safari実機では未確認。Safari相当可視領域変化の自動検査を実機ツールバー操作の代替としない。 |
| [最終検証記録 run #42728746519](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42728746519) | head SHA `7da934c6c48a17339952df9f8701a923ced3e418`、main、completed / success。docs-checkと変更分類success。verify／Browser UI実行／deployはMarkdownのみの変更としてskip。 | 文書検査の成功であり、ゲームテスト・ビルド・Browser UIの再実行や再公開を示さない。 |

上記runのSHA・状態とjob結果を今回再照合した。両engineのjobログでも成功notice **45本／35本**、`browser-action-panel.py`・`browser-call-test.py`・`browser-pc-table-layout.py`・`browser-candidate-geometry.py`の成功を確認し、production-testログの再接続を含む本番7シナリオ成功も確認した。座標検証の詳細は本書の既存「検証」「Actions結果」を保持する。実装・公開SHAから最終記録SHAまでの差分は本書のMarkdownのみで、製品コードは同一。

### Issue #32全体のClose可否の再評価

Issue本文・既存コメントと[2026-11-08の受け入れ条件評価・PC詳細評価](issue32-responsive-layout-2026-11-03.md#2026-11-08-pc実機確認結果と受け入れ条件の再評価)を照合した。

| Issue本文の受け入れ条件 | 現時点の評価 |
| --- | --- |
| 主要画面がスマホ・タブレット・PCの代表的viewportで操作可能 | 自動検証は成功。本人実機報告は個別範囲に限られ、主要画面全体の完了とはしない。 |
| 重なり・意図しない横スクロール・操作不能領域がない | 自動検証は成功。候補位置・高さやツールバー変化後の実機確認、PC全体の表示確認は残る。 |
| チー複数候補・ロン・カン・結果ダイアログ等を回帰検証 | 既存のChromium／WebKit回帰成功を維持。今回の実機OKはカンの報告範囲に限定する。 |
| iPhone Safariでユーザー本人が実機確認 | 一部確認済み。今回の3件のOKを追加するが、複数候補の下端固定・上方向展開とSafariツールバー表示・収納後の操作は未確認。既存の他の未報告項目も完了にはしない。 |
| PCブラウザーでユーザー本人が実機確認 | 必須項目が未完了。今回のiPhone報告でPCの未確認を変更しない。 |
| Android・タブレットの実機未確認を明記し、自動検証と区別 | 引き続き実機未確認。明記済みであり、Issue上の実機必須条件ではない。 |
| 設計方針・検証結果を記録 | 本書と関連記録・目次・ROADMAPへ反映。 |

残る必須PC実機確認は、卓全体・手牌と文字の視認性、ウィンドウサイズ変更、短い画面でのゲーム画面スクロール、マウスによる手牌選択・打牌、Tab／Enter／Space、ポン・カン、ロン・ツモ・リーチ、各種ダイアログ（詳細結果・順位を含む）、オンライン待機室・作成／参加・対局・再接続など。既存のPCチー候補操作・開閉時の卓安定、局結果概要・次局、ルール設定スクロールバーのドラッグOKは維持し、未報告の範囲を補完しない。

**Issue #32全体はClose不可、Openのまま維持する。** カン操作の実機確認は進んだが、iPhone Safariの表示位置・ツールバー操作と必須PC実機項目が残る。受け入れ条件全体の達成は確認できないため、Issue本文のチェックボックスは変更しない。

### 今回の文書更新の作業基準と検査範囲

- 開始場所 `/workspace/heibon-mahjong`、開始ブランチ `work`、開始HEAD `0af27b3674b678669869325048407c02a698623a`。作業ツリーclean、未pushコミットなし。
- `git fetch origin`成功後のorigin/mainは `7da934c6c48a17339952df9f8701a923ced3e418`。behind/aheadは **2 / 0**。指定の実装・最終記録の2コミットを確認し、同SHAを追跡する`main`へ切り替えた。最終記録SHA以降の追加差分は作業開始時点ではなかった。
- 通常sandboxのfetchはproxy port 8080への接続失敗。正規のネットワーク許可付き再試行で成功した。Actionsメタデータの`gh run view`も通常sandboxではproxy接続時の権限制限で失敗し、許可付きで成功した。
- 今回はMarkdown 5文書とIssueコメントのみを更新する。文書内の相対リンク・アンカー216件（変更行の21件を含む）、4項目の個別結果と集計、変更範囲・記述整合性、`git diff --check`は正常。ゲームテスト・ビルド・Browser UIは再実行していない。push後のdocs-check結果は今回のIssueコメントと完了報告に記録する。
