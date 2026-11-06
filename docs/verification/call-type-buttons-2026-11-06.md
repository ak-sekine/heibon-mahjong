# 鳴き判断の種類別ボタンUI — 2026-11-06

実装・Worker／Pages deploy SHA: `c95cb315074ddfd5fe4ff9232b6564edcba250a1`

GitHub Actions: [Deploy gate run #42247363486](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42247363486) — success

Issue [#46](https://github.com/ak-sekine/heibon-mahjong/issues/46): Open（iPhone Safari／公開中のitch.io実機確認待ち）

## 操作

鳴き判断が始まってもダイアログを自動表示せず、卓下の操作領域に実行可能な「ポン」「カン」「チー」と常時「見送る」を表示します。物理牌IDだけが異なる表示候補は既存の重複除去でまとめた件数を数え、種類別に1候補なら既存の`select-call`を直接実行し、2候補以上なら押された種類だけを既存の`#call-decision-dialog`に表示します。異なる鳴き種類が同時に可能なだけではダイアログを開きません。

ダイアログには種類別タイトル、対象捨て牌、判断残り時間、候補牌画像、「卓に戻る」を表示します。赤牌を使う候補と使わない候補は別項目として識別でき、候補選択は元の候補ID・物理牌IDを持つ既存の処理へ渡します。「卓に戻る」とEscapeは未回答で閉じます。開閉してもオンラインのサーバー期限は進み続け、状態更新・期限切れ・回答送信時には操作を終了またはロックします。「見送る」は候補ダイアログに移動せず、卓上の種類別ボタンと並べて表示します。

オフラインとオンラインは同じActionPanelと候補表示用重複除去を利用します。ゲームの鳴き判定、喰い替え、赤ドラ、鳴き優先順位、CPU判断、オンラインの回答形式は変更していません。

## 画面寸法

Chromium／WebKitのBrowser UI testが記録した`getBoundingClientRect()`値（CSS px）です。どのサイズも`scrollY=0`で、`scrollHeight`はviewport高と同じでした。4ボタンのタップ高さはすべて44pxです。

| viewport | 卓 top–bottom | 操作領域 top–bottom | 4ボタンのtop–bottom | scrollHeight / innerHeight |
| --- | ---: | ---: | ---: | ---: |
| 375×634 | 108–483 | 492–542 | 498–542 | 634 / 634 |
| 375×667 | 116–491 | 508–558 | 508–552 | 667 / 667 |
| 320×568 | 108–428 | 437–487 | 437–481 | 568 / 568 |
| 375×568 | 108–483 | 492–542 | 492–536 | 568 / 568 |

各サイズの横方向のボタン配置も画面内に収まります。375px幅ではx=`11, 100.75, 190.5, 280.25`、各幅`83.75px`、320px幅ではx=`11, 87, 163, 239`、各幅`70px`です。ボタン間隔は6pxです。

複数候補のダイアログでは候補ボタンが44×44px以上、牌画像が22×31px以上であることをassertし、中央点のpointer hit testと選択操作を確認しました。鳴き判断の前後、種類別操作表示中、候補ダイアログの開閉前後で、ヘッダー、点数表示、卓、手牌、河、卓中央情報の矩形が同一であることをローカル／オンライン双方のBrowser UI testで比較しました。itch.ioを模した375×634px iframeでも4ボタンが表示され、ページスクロールなしで操作でき、種類別候補のダイアログも確認しました。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功、1,462 tests、失敗0（run #42247363486の実ログ） |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功。TypeScript検査、Pages build、PWA shell buildを含む |
| `VITE_ONLINE_API_URL=https://heibon-mahjong-online.ak-sekine.workers.dev npm run build:itch` | 成功。ZIP内3ファイル、90,501 bytes |
| Browser test Python構文・選択回帰 | 成功。構文検査と8 tests |
| Chromium／WebKit Browser UI | 両方success。種類別ボタン、直接実行／候補選択、赤牌、タイムアウト、レイアウト、iframe、既存ロン・局結果を確認 |
| standalone itch smoke | Chromium／WebKitそれぞれでBrowser UI前後のstepがsuccess。各step3回で初回手牌、通常UI操作、打牌後の河を確認。今回の6回／engineではランダムな鳴き・ロン判断は発生せず |
| browser-ui-matrix-audit / release-freshness | success |
| Worker deploy / production test | success。7シナリオ、本番Worker URL `https://heibon-mahjong-online.ak-sekine.workers.dev` |
| Pages build / deploy | success。Pages deploy payload SHAは上記と同一 |

Deploy gate run [#42247363486](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42247363486)で、`verify`、Chromium／WebKit、matrix audit、release freshness、Worker deploy、production test、Pages build／deployがすべてsuccessしました。

これらはChromium／WebKit自動検証であり、iPhone Safari実機や公開中のitch.io埋め込みページでの実機確認ではありません。Issue #46は実機確認が終わるまでOpenのまま維持します。

## 候補選択ダイアログから「見送る」を削除 — 2026-11-06

基準: `origin/main` `d7f278059dd26f60ce375e60d724b4bee3734732`。実装 commit: `33cea3f5fae7d639ae3c8fb2cc8e1abd0581ad0f`。Deploy gate run [#42254003679](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42254003679) はsuccessし、同じSHAでWorkerとPagesをdeployしました。

`ActionPanel.showCallDecision()` は判断状況と候補一覧だけを共用ダイアログへ移すようにし、「見送る」は元の卓上操作欄に残しました。`passCallParent`と「見送る」のDOM復元処理、および候補ダイアログ専用CSSを削除しました。イベント委譲、診断ログ、共通ActionPanel、`select-call`、回答待ちロック、候補期限の処理は維持しています。Smoke runnerは候補ダイアログが開いている場合に「卓に戻る」で閉じてから卓上の「見送る」を押す順にしました。

ChromiumとWebKitで最大5件のチー候補を表示したときのダイアログ矩形（CSS px）は次の通りです。以前の構成にあった44pxの「見送る」ボタンと、候補ホスト内の6px gapを除き、幅は維持、高さは50px縮小しました。変更前の高さは旧CSS構成からの算出値で、変更前版をブラウザーで再測定した値ではありません。

| viewport | 幅（変更前→後） | 高さ（変更前→後） | 最大候補での表示位置（後） |
| --- | ---: | ---: | ---: |
| 375×634 | 359→359 | 395.8125→345.8125（−50） | y=144.09375–489.90625 |
| 375×667 | 359→359 | 395.8125→345.8125（−50） | y=160.59375–506.40625 |
| 320×568 | 304→304 | 395.8125→345.8125（−50） | y=111.09375–456.90625 |
| 375×568 | 359→359 | 395.8125→345.8125（−50） | y=111.09375–456.90625 |

4サイズすべてで候補一覧と「卓に戻る」が画面内に収まり、最大チー候補の各ボタンは44×44px以上、牌画像は22×31px以上でした。表示・非表示前後のヘッダー、点数表示、卓、手牌、河、卓中央情報の矩形に差はなく、itch.io形式の375×634 iframeも`scrollY=0`かつ`scrollHeight=634`でした。

検証:

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功、1,463 tests、失敗0（run #42254003679の実ログ） |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功。TypeScript、Pages、PWA buildを含む |
| `VITE_ONLINE_API_URL=https://heibon-mahjong-online.ak-sekine.workers.dev npm run build:itch` | 成功 |
| Chromium／WebKit Browser UI | 両方success。複数候補、見送りの不在、卓へ戻る／Escapeで未回答、卓上の見送りで回答、再表示、候補選択と成立、赤牌、4 viewport、iframeを確認 |
| オンライン回帰 | 両方success。卓へ戻るだけでは送信せず、卓上「見送る」で`pass-call`を送信。期限進行・期限切れ・再接続の既存ケースも実行 |
| standalone itch Smoke | Chromium／WebKitとも前後の各3回success。ランダムなSmoke対局では候補ダイアログは発生せず（`call_dialogs_returned=0`）、一部の試行で通常画面の「見送る」を操作。ダイアログ経由の操作は上記専用Browser UI testで検証 |
| browser-ui-matrix-audit / release-freshness | success |
| Worker deploy / production test | success。本番Worker URL `https://heibon-mahjong-online.ak-sekine.workers.dev` |
| Pages build / deploy | success。デプロイ環境URL `https://ak-sekine.github.io/heibon-mahjong/` |

実装・Worker・Pages deployment SHA: `33cea3f5fae7d639ae3c8fb2cc8e1abd0581ad0f`。run #42254003679の実ログでは`npm test`は1,463 tests成功、失敗0です。Issue #46はOpenのままです。iPhone Safari実機と公開中itch.ioページは未確認です。
