# 鳴き判断の種類別ボタンUI — 2026-11-06

実装・Worker／Pages deploy SHA: `c95cb315074ddfd5fe4ff9232b6564edcba250a1`

GitHub Actions: [Deploy gate run #42247363486](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42247363486) — success

Issue [#46](https://github.com/ak-sekine/heibon-mahjong/issues/46): Open（iPhone Safari／公開中のitch.io実機確認待ち）

## 操作

鳴き判断が始まってもダイアログを自動表示せず、卓下の操作領域に実行可能な「ポン」「カン」「チー」と常時「見送る」を表示します。物理牌IDだけが異なる表示候補は既存の重複除去でまとめた件数を数え、種類別に1候補なら既存の`select-call`を直接実行し、2候補以上なら押された種類だけを既存の`#call-decision-dialog`に表示します。異なる鳴き種類が同時に可能なだけではダイアログを開きません。

ダイアログには種類別タイトル、対象捨て牌、判断残り時間、候補牌画像、「見送る」、「卓に戻る」を表示します。赤牌を使う候補と使わない候補は別項目として識別でき、候補選択は元の候補ID・物理牌IDを持つ既存の処理へ渡します。「卓に戻る」とEscapeは未回答で閉じます。開閉してもオンラインのサーバー期限は進み続け、状態更新・期限切れ・回答送信時には操作を終了またはロックします。

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
| `npm test` | 成功、85 tests、失敗0 |
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
