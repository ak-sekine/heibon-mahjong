# オンライン待機ダイアログの補助ボタン配置 — Issue #43、2026-11-05

## 変更内容

- 待機ダイアログのタイトル行、ルームコード行、対局形式行を、それぞれ情報左・操作ボタン右の2列に揃えました。
- 3つのボタンは共通の右列を使い、幅88〜112px、高さ44px、角丸8px、同じ文字サイズ・太さ・余白に統一しました。幅は320pxで88px、通常幅で最大112pxです。320pxではコード行のラベルとコードの文字サイズを控えめに縮めます。
- ルームコードの省略表示をなくし、有効期限をコードの直下に保ちました。ルーム情報の後に既存配色の区切り線を追加しました。
- 既存の`ui-button ui-button--b`、要素ID、イベントリスナー、`aria-label`を維持しています。`src/online/waiting-room.ts`、参加者一覧、下部操作、再接続、オンライン／オフラインのゲーム処理は変更していません。

## 検証

- 作業基準：`origin/main` / `92480dc523c05d343065203b12dbca64dedbccc7`。作業開始時の`work`は7コミット遅れており、fetch後にfast-forwardしました。作業開始時・fetch後とも作業ツリーはクリーンでした。
- `npm test`：82件成功、失敗0件。
- `npm run build`：成功（TypeScript、Vite、PWA shell）。
- Browser UI runner選択テスト：7件成功。待機ダイアログ測定をChromium／WebKit両方のマニフェストに追加しました。
- `git diff --check`：成功。
- `npm run typecheck:worker`：Workerのソースを変更していないため対象外です。
- GitHub Actions [run #41940009814](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41940009814)、対象SHA `c57d35cd65adc5cb28c977383c379127f734e305`：verify、Browser UI Chromium／WebKit、matrix audit、release freshness、Worker deploy、production test、Pages build／deployがすべてsuccessです。Browser UIはChromium 42 scenario、WebKit 31 scenarioです。
- 同runのChromium／WebKitで320×568、375×667、390×844、430×932、667×375、844×390、768×1024、1024×768、1280×800、1440×900を確認しました。各幅の3ボタンは右端・幅・高さが一致し、右端許容誤差0.5px以内です（小数CSSピクセルを許容するため）。実測幅は320pxで88px、375pxで105px、390pxで109.1875px、430px以上で112px。高さ44px、文字13.12px／weight 600、line-height 16.4px、角丸8pxで共通でした。3文言はすべて1行でボタン内に収まりました。
- 全幅でコード`ABC234`の6文字と有効期限`2026/10/27 14:00`を表示し、ルーム情報・ダイアログ・ページに横方向のoverflowがないことを確認しました。低いviewportではオンラインダイアログ既存の縦スクロールを使用します。
- 最初のrun [#41939006219](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41939006219)（`920ea2d`）は、待機ヘッダーを従来の`flex`と仮定した既存アサーションで失敗しました。待機画面のみ`grid`に変更した仕様に合わせてテスト期待値を直しました。次のrun [#41939406487](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41939406487)（`f93bb1b`）では320pxでコード行の実際のクリップを検出しました。操作列を88px、コードラベルとコードを狭幅用サイズへ調整し、期限テストはinlineの`time.clientWidth`ではなく親行の描画範囲で判定するよう修正しました。最終run #41940009814で両問題の解消を確認しています。
- Worker deployとproduction testはsuccessです。GitHub Pagesのdeploy jobもsuccessし、Pages公開記録のSHAは`c57d35cd65adc5cb28c977383c379127f734e305`です。公開先は[https://ak-sekine.github.io/heibon-mahjong/](https://ak-sekine.github.io/heibon-mahjong/)です。

## 実機確認と受入条件

- 自動検証では右端揃え、共通寸法・書体、44pxタップ領域、折返し／クリッピングなし、コードと期限の表示、縦横・PC viewport、横overflowなしを確認しました。既存の待機室Browser UI回帰もDeploy gate内で成功しました。
- iPhone Safari縦画面／横画面、ホーム画面PWAの実機確認は未実施です。ホスト／ゲストの各状態と実際の再接続を実機で測る項目も未確認です。Chromium／WebKitの自動結果で置き換えません。
- Issue #43はOpenのままにし、実機確認結果とあわせてClose可否を別途判断します。
