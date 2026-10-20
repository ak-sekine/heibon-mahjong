# Step 14.2 検証

## ローカル自動検証

2026-10-19〜20に実施しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。49テストファイル、49成功、失敗0件。河の席回転、1・6・7・18枚、順序、リーチ宣言牌を含む |
| `npm run build` | 成功 |
| `git diff --check` | 成功 |
| `python -m py_compile tests/browser-online-waiting-room.py tests/browser-riichi-discard-layout.py` | 成功 |
| `npm run typecheck:worker` | Workerを変更していないため実行対象外 |

## Browser UI verification

既存の[Browser UI verification workflow](../../../.github/workflows/browser-ui.yml)を使用します。Codex CloudではAGENTS.mdの方針に従いChromiumを起動しません。

- オフライン河: 4席、捨て牌18枚と各宣言牌位置、枚数増加前後の既存牌座標、牌の重なり・卓中央・画面外へのはみ出し。幅320、355、375、390、430、1280px。
- オンライン河: 4つのビューアー席と1・6・7・18枚、宣言牌あり・なし。幅320、375、390、430、1280px。中央情報との重なりと宣言牌以外の座標変化を確認。
- オンライン待機・操作: 共通メニューの開閉とキーボード操作、ルーム作成・参加・退出、共通表示名、sessionStorage、操作ボタンの構造・寸法、非公開牌IDのDOM非表示を確認。
- 代表画面を各幅のオンライン卓と対局結果で撮影し、workflow artifact `browser-ui-<sha>`へ保存します。

対象SHA `8ed2e8157cfa966df883bf65897ce5beaaa488da` の[Actions run 39338271518](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39338271518)では、`verify`（テスト、Worker型検査、build）は成功しました。Browser UIは320pxのオフライン河で段の開始位置のずれを検出して失敗しました。固定スロット内の牌面を開始端にそろえる修正を加え、次のmain commitで再検証します。Browser UI失敗により後続のWorker deploy、production test、Pages deployは実行されていません。

### 2026-10-20の再検証履歴

過去の失敗記録は残したまま、各Browser UIの検出内容と修正を追記します。

- [Actions run 39350224006](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39350224006)、SHA `025dd570f368931ba6c1ba41ea271815874614d9`: `verify`は成功。Browser UIは4席・各枚数・オンライン視点回転を含む卓配置測定を通過し、ルームダイアログを閉じた後のフォーカス復帰で失敗しました。閉じる操作中にもメニューボタンへフォーカスを戻す処理を追加しました。
- [Actions run 39351128771](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39351128771)、SHA `c55fbd8cfc5ca4be5b6566d9c813a48b3a01700e`: `verify`は成功。フォーカス検査を通過し、オンライン・オフラインの打牌ボタンのpadding差を検出しました。オンラインゲーム操作に残っていた高詳細度の重複指定を除去しました。
- [Actions run 39351931957](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39351931957)、SHA `c3762dd001fffa820eed3f584a9b53e4f1020bd4`: `verify`は成功。次局ボタンの寸法差を検出し、オンライン操作の共通paddingと結果ダイアログ内のオフラインボタン寸法を調査しました。
- [Actions run 39352726295](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39352726295)、SHA `fb6a6eab0bb96a2dfd8699659a6a551003133349`: `verify`は成功。打牌・リーチ・和了・パスの寸法比較を通過しましたが、次局ボタンの寸法差が続いたため、Browser UI検査に実測値を含めるようにしました。
- [Actions run 39353359902](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39353359902)、SHA `337ad7f014f331394f55cefc9385298154c2b4ec`: `verify`は成功。検査メッセージに実測値を追加して差を確定し、オンラインの次局ボタンを48px高・左右10pxへ合わせました。
- [Actions run 39354138412](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39354138412)、SHA `1a1928b03193b4b694b00e79d6af9cf41dde42ff`: `verify`は成功。Browser UIではpaddingは一致した一方、汎用ボタン規則の詳細度によりオンライン側の最小高さが44pxのままで、オフライン側の48pxと差が残りました。次局ボタンに限定した高詳細度の指定を追加しました。
- [Actions run 39354908093](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39354908093)、SHA `9b2bbc94f851ab35f31dfbc629d9aa75bd3dd454`: `verify`は成功。全操作ボタンの寸法比較を通過しましたが、宣言牌切替時の位置検査がページ上の絶対座標を比較しており、卓基準の移動かページ全体の移動か切り分けられませんでした。卓基準の相対座標に検査を変更し、卓内の牌位置が動く場合は前後の実測値を記録します。
- [Actions run 39355898689](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39355898689)、SHA `dfd25fe747fb5c1043800433f465cfd06f8bec8b`: `verify`（49テスト、Worker型検査、Pages build）は成功。Browser UIは320px・南家視点・18枚の河で文書幅がviewportを超えたため停止しました。卓枠と牌・中央情報の配置に重なりはありませんでした。横スクロール要素を特定する実測値をBrowser UI出力へ追加します。

各回ともBrowser UIが失敗したため、Worker deploy、production test、Pages build / deployの後続jobは実行されていません。320pxで検出した横スクロールの原因を修正した次のmain SHAで再確認します。

## GitHub Actions、本番Worker、Pages

最終修正SHAの`verify`、Browser UI verification、Cloudflare Worker deploy、production test、GitHub Pages build / deploy の結果を完了後に追記します。

## 未確認

- iPhone Safari実機での表示・操作は未確認です。ユーザーによる実機確認が必要です。
