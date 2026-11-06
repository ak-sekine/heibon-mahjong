# 鳴き判断ダイアログ検証 — 2026-11-06

実装・デプロイSHA: `d963ca9fd4cf2a6970ec69cce6bf9ad28623ddbd`

GitHub Actions: [run #42148701975](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42148701975) — success

Issue [#46](https://github.com/ak-sekine/heibon-mahjong/issues/46): Open（iPhone Safari／itch.io実機確認待ち）

## 実装

鳴き判断は `#call-decision-dialog` の独立したモーダルで表示します。既存のActionPanelが作る鳴き候補・診断ログ・クリック処理を再利用し、判断対象牌とサーバー由来の残り時間をダイアログへ移します。候補は2列で同時に表示し、「見送る」は候補一覧内、「卓を確認する」はフッターに置きます。

「卓を確認する」とEscapeは判断を送信せずモーダルだけを閉じ、卓側の固定位置に「鳴き判断に戻る」を表示します。再表示ボタンはsafe-areaを考慮した右下固定で、44px以上のタップ高を持ち、卓より下に収まることをブラウザーテストで確認しました。候補選択・見送り・サーバー状態による判断終了時は、モーダルと再表示ボタンを閉じます。局結果など別のダイアログが開いている間は鳴きダイアログを重ねて開きません。

オンライン残り時間はサーバーの`expiresAt`から計算します。開閉では期限を作り直しません。卓を表示したまま残り時間が減ること、期限切れ時に候補と再表示ボタンが消えることをオンラインUIのブラウザーテストで確認しました。実送信中はActionPanelの既存状態により候補を無効化します。

## 表示候補数

最大局面ではゲームロジックが物理牌IDの異なる候補を9件生成します。同じ牌姿に見える組合せを既存の表示用重複除去でまとめると7件になり、内訳はチー5件、ポン1件、大明カン1件です。赤牌と通常牌は別候補として残します。表示する各項目は実際の`CallOption`を保持するため、クリック時の候補IDや物理牌IDは変わりません。

## 画面寸法と位置

以下はChromiumとWebKitの両方で取得した`getBoundingClientRect()`値（CSS px）です。矩形は`x, y, width, height`の順です。候補ボタンの配置欄は各行の上端y、列のx座標、1ボタンのサイズを示します。行順は「チー／チー」「チー／ポン」「チー／チー」「大明カン／空き」です。

| viewport | ダイアログ矩形 | 候補ボタン配置 | 見送る | 卓を確認する |
| --- | --- | --- | --- | --- |
| 375×634 | `8, 90.125, 359, 453.75` | x=`18, 190`; 行y=`186.125, 249.0625, 312, 374.9375`; 各`167×57.9375` | `18, 439.875, 339, 44` | `18, 489.875, 339, 44` |
| 375×667 | `8, 106.625, 359, 453.75` | x=`18, 190`; 行y=`202.625, 265.5625, 328.5, 391.4375`; 各`167×57.9375` | `18, 456.375, 339, 44` | `18, 506.375, 339, 44` |
| 320×568 | `8, 57.125, 304, 453.75` | x=`18, 162.5`; 行y=`153.125, 216.0625, 279, 341.9375`; 各`139.5×57.9375` | `18, 406.875, 284, 44` | `18, 456.875, 284, 44` |
| 375×568 | `8, 57.125, 359, 453.75` | x=`18, 190`; 行y=`153.125, 216.0625, 279, 341.9375`; 各`167×57.9375` | `18, 406.875, 339, 44` | `18, 456.875, 339, 44` |

牌画像は幅22×高さ31px以上、各候補ボタンと2つの操作ボタンは高さ44px以上でした。最大候補を含む全要素がvisual viewport内にあり、横はみ出しとページスクロールは発生しませんでした。itch.ioを模した375×634pxのiframeでも7候補と両ボタンが収まり、「卓を確認する」と再表示操作が成功しました。

「鳴き判断に戻る」は4 viewportすべてで矩形が画面内にあり、卓の下、safe-areaを考慮した右下位置に収まることを確認しました。ヘッダー、点数表示、卓、手牌、河、副露、卓中央の矩形を閉じた状態と再表示状態で比較し、差がないことを確認しました。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功、1461 tests、失敗0 |
| `npm run typecheck:worker` と `npm run build` | 成功。TypeScript型検査、Pages/PWA buildを含む |
| `npm run build:itch` | 成功。3ファイル、展開後344,089 bytes、ZIP 89,699 bytes |
| Chromium／WebKit Browser UI | run #421487で両方success。最大候補・4 viewport・itch iframe・局結果など既存UI回帰を確認。後続のrun #421558では両エンジンの回帰スクリプトもsuccess |
| オフライン鳴き判断 | 自動表示、候補選択、見送り、卓確認、再表示、Escape、判断終了後の非表示を確認 |
| オンライン鳴き判断 | サーバー期限を維持して開閉、卓表示中の期限切れ、期限確定後の候補・再表示ボタン消去を確認 |
| standalone itch package | run #421487で両エンジンsuccess。後続run #421558ではChromium success、WebKitは新規対局後の初回手牌ボタン待ちでtimeout |
| Browser UI matrix audit / release freshness | 成功 |
| Worker deploy / production test | 成功。Worker URLは`https://heibon-mahjong-online.ak-sekine.workers.dev`。本番7シナリオ成功 |
| Pages build / deploy | 成功。両デプロイの記録SHAは上記`d963ca9…` |

Chromium、WebKitはGitHub Actions上のブラウザー検証であり、iPhone Safari実機検証ではありません。itch.ioの実際のiframe、iPhoneのsafe-area・ブラウザーUI込みの表示、タッチ操作、実機オンライン期限切れ・再接続は未確認です。Issue #46は実機確認が終わるまでOpenのままにします。

## テスト追補 — 2026-11-06

本番コードの最終変更とデプロイはSHA `d963ca9fd4cf2a6970ec69cce6bf9ad28623ddbd`です。後続のSHA `d76aa7059fb0c53d57b0e207dacbadd771cccd31`と`3ed7faadad903b071ffb062364dff6a476edd05b`はブラウザーテストのみを変更しています。

| run | 結果 |
| --- | --- |
| [#421513 attempt 1](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42151327112) | `verify`とChromium success。オンラインの保留中鳴き判断を再接続中に期限切れさせるシナリオはChromium／WebKit両方でsuccess。WebKitは後続の既存局結果ダイアログ再表示クリックでclick eventが発生せずtimeout。attempt 2の失敗job再実行はattempt別build artifactが見つからず、テストを開始できませんでした。 |
| [#421558](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42155800715) | `verify-build` success。Chromium全job success。WebKitの`Run Vite and browser regressions`もsuccessし、局結果を閉じた後のEnter再表示とフォーカス復帰を確認。後続のstandalone itch smokeだけが、新規対局後に有効な手牌ボタンが現れずtimeout。 |
| [#421539](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42153947821) | test-only push run。`verify` success。Chromiumのstandalone itch smokeは打牌後の河表示待ちでtimeout。WebKit jobは2026-11-06 03:32 UTC時点でOS依存パッケージ導入中のままです。 |

run #421558の失敗は鳴き判断やブラウザー回帰スクリプト内ではなく、別ステップのstandalone itch CPU smokeで発生しました。前回の本番デプロイrun #421487ではitch smokeが両エンジンでsuccessしています。これらの自動テスト結果はiPhone Safari／実際のitch.io実機確認の代わりではありません。

その後、両エンジンのブラウザー回帰suiteが完了したため、WebKitの依存導入が停止していたtest-only push run #421539をcancelしました。テスト変更やdocs-only変更によるWorker／Pagesの再デプロイはありません。最終docs commitのdocs-checkはrun [#42157457266](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42157457266)でsuccessしました。

## standalone itch smoke test の安定化 — 2026-11-06

### 既存失敗の再確認

GitHub APIのrun metadataで、run [#42155800715](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42155800715) はSHA `3ed7faadad903b071ffb062364dff6a476edd05b`、全体failure、Chromium job success／WebKit job failureであり、WebKitの失敗stepはstandalone itch smokeだけと確認しました。ChromiumのBrowser UI回帰を含む各job stepはsuccessでした。run [#42153947821](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42153947821) は同SHAで、Chromiumのstandalone itch smoke stepがfailure、WebKit側はOS依存パッケージ導入stepがfailureとなり、その後の検査はskipでした。

GitHub APIのrun metadataと現行ソースは再確認できましたが、Actions実ログZIPは `results-receiver.actions.githubusercontent.com` がForbiddenを返し取得できませんでした。そのため個々のタイムアウト直前のゲーム状態・DOM・コンソール内容は独立には確認できていません。既存記録にある「WebKitは新規対局後の有効手牌ボタン待ち」「Chromiumは打牌後の河SVG待ち」という観測を維持し、ゲーム本体の停止・描画不具合だったかは未特定とします。

### smokeの判定

- Smokeはitch用の実ビルドZIP内容を相対パスで配信して検査し、初期座席・配牌を本番仕様のまま使います。itch ZIP専用のテスト入口や固定乱数は追加していません。
- 20秒の状態待機中は、有効手牌だけを無条件に待たず、鳴きダイアログを識別して正規の「見送る」、ロン候補は「見逃す」で進めます。CPUが局を終えた場合は結果を閉じ、利用可能な「次の局へ」で進めます。
- 打牌は受理された `discard` 操作の状態遷移を確認し、選んだ物理牌IDが手牌から消え、同じIDが河または副露の「鳴かれた牌」のいずれかに一度だけ存在することを検証します。河だけへの残存は要求しません。
- 既存の鳴き判断ブラウザーテストを再利用します。関連するunit回帰では、見送った牌が河と履歴に残ること、およびCPUポンでは同じ物理牌が河から除かれて副露へ移ることを明示します。
- Browser UI suiteの前後に、Chromium／WebKitごとにsmokeを各3回実行します。成功時は各反復と状態分岐をログに残します。失敗時は各stepの `/tmp/heibon-itch-smoke-{before}/<browser>-iteration-<n>.{json,png,zip}` または `/tmp/heibon-itch-smoke/<browser>-iteration-<n>.{json,png,zip}` をBrowser UI artifactに含めます。JSONは安全な診断キーだけ、URLはquery／fragment／credentialsを除いて保存します。Playwright traceは各反復開始から有効にし、失敗時だけ保存します。
- Browser UI jobは後続stepで意図的なassertion失敗も実行し、診断snapshot、打牌遷移、PNG、trace ZIPが生成されたことを確認します。failure flagはPython smokeだけにあり、itch build／ZIPには含まれません。

この追補に対するChromium／WebKitのActions結果とrun URLは、push後に追記します。自動検証とiPhone Safari／実際のitch.io実機検証は分けて記録し、Issue #46はOpenのままです。
