# 診断ログの「閉じる」折り返し — Issue #10 — 2026-10-31

## 対象

- Issue: [#10 診断ログ画面の「閉じる」ボタンが2行に折り返される（iPhone Safari）](https://github.com/ak-sekine/heibon-mahjong/issues/10)
- CSS修正コミット: `34b0017db03065791d6dcb2f2b26f6a9928e1046`
- Playwrightテスト引数修正コミット: `afc7aae72af22db1af0ddd140fed688b6f82c1c1`（このSHAでBrowser UIとdeployを実行）
- 作業開始時のローカル `HEAD`: `f89d0381a6dfd2823bbb9c11c8b3a85847ed12cc`。作業開始時のfetch後、最新 `origin/main` は `b1c27343ba0ed1bf3d97ab2faca33fa02a6c7aa0` で、開始HEADはその祖先でした。Issue #10に無関係なローカル未pushコミットはありませんでした。
- GitHub Actions初回: [run 41190340020](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41190340020) — `verify` success。Browser UIはChromium診断テスト開始時、`Page.wait_for_function()`の期待件数を位置引数で渡したテスト実装エラー（`TypeError`）でfailure。CSS/layout assertionには未到達し、deploy jobsはskip。
- GitHub Actions再実行: [run 41191873055](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41191873055) — overall success。`verify`は1,301件成功・失敗0件、Worker型検査とPages buildがsuccess。Browser UIはChromium・WebKitともsuccess。`release-freshness`、Worker deploy、本番Worker test、Pages build/deployもsuccess。WorkerとPagesのdeployment SHAは`afc7aae72af22db1af0ddd140fed688b6f82c1c1`。

## 原因調査

2026-10-31のIssueコメントと[d607dc24](https://github.com/ak-sekine/heibon-mahjong/tree/d607dc24e451b0ae1cf4284ccedd9ba0dd54c07b)時点の既存調査を、最新mainのDOM/CSSに照合しました。`.diagnostic-header`はflexで、左側情報欄は`min-width:0`、ビルド情報は`overflow-wrap:anywhere`です。一方、`#diagnostic-close`には折り返し禁止や縮小防止指定がなく、ボタン共通指定の`min-width:64px`の範囲でflex縮小できました。Issue #24の`.online-dialog-close`指定は別クラス／別ダイアログに限定されており、重複や競合はありません。共通ボタン色とスタイルは`ui-button ui-button--b`から継承しています。

CSS上の構造的な原因候補は、長いビルド情報がある状態でヘッダーのflex幅が厳しくなると、閉じるボタンが縮小し、日本語ラベルが通常の行折り返しを許されることです。報告時のiPhone画面を修正前に再現できていないため、この候補を報告時条件で実証したとは扱いません。修正後のBrowser UIは4画面幅・4ログ条件で最終的な文字／要素寸法を検査します。

## 変更

- `src/style.css`: `#diagnostic-close`だけに`flex:0 0 auto`と`white-space:nowrap`を指定し、ボタンの縮小とラベルの改行を防止しました。既存のダイアログ幅、余白、`overflow:hidden`、ログ本文の`overflow-wrap:anywhere`、ヘッダーのビルドID折り返し、共通ボタン配色は維持しています。
- `tests/browser-diagnostics.py`: 320/375/390/414pxでログ0件、複数件、長いビルドID、長いメッセージを確認します。Rangeの文字矩形で1行とボタン内の表示余裕を、DOM寸法でボタン・ヘッダー・ダイアログ・本文・ページの横はみ出しを検査します。複数ログ時の実スクロール、コピー、クリア、診断ダイアログを閉じる操作、オンライン作成ダイアログを閉じる操作も確認します。既存Browser UI manifestにあるChromium/WebKit両方で実行します。

## 検証結果

- `npm test`: 70/70成功、失敗0。
- `npm run build`: TypeScript検査とVite production build成功。
- `python3 -m py_compile tests/browser-diagnostics.py`: 成功（`arg=`修正後も再確認）。
- `git diff --check`: 成功。
- ローカルBrowser UI: 未実施。Codex Cloud Chromiumの既知のsandbox起動制約のため起動を繰り返さず、既存GitHub Actions Browser UIを利用します。
- Browser UI初回 / run 41190340020: failure。Playwright Python APIのテスト呼び出しエラーで、対象レイアウトassertionには到達していません。`arg=`形式に修正しました。
- Browser UI再実行 / run 41191873055: success。全suite success。`tests/browser-diagnostics.py`はChromium 6.595秒、WebKit 7.676秒でそれぞれsuccessし、各ブラウザーで320/375/390/414px×ログ0件・複数件・長いビルドID・長いメッセージを検証しました。Range文字矩形が1つでボタンの内側に収まること、ボタン・ヘッダー・ダイアログ・本文・ページの横はみ出しがないことを寸法で確認。コピー、クリア、長文ログのスクロール、診断ダイアログを閉じる操作、オンライン作成ダイアログを閉じる操作もsuccess。
- CI deploy / run 41191873055: Worker deploy success、本番Worker test success（5 scenario）、Pages buildとPages deploy success。Actions記録上のWorker/Pages SHAは`afc7aae72af22db1af0ddd140fed688b6f82c1c1`。配信HTMLの直接取得やSafariでの公開表示は別途未確認。
- iPhone Safari実機: ユーザー本人の公開後確認待ち。自動テスト結果を実機確認結果として扱いません。

## 未確認事項・状態

- 公開ページを直接読み込んでの配信内容・CSS確認と、実際のiPhone Safari表示・操作は未確認です。Actions上のPages deploy successは実機確認を意味しません。
- Issue #10はユーザーによるiPhone Safari実機確認が終わるまでOpenのままにします。

## iPhone Safariで確認する操作

公開中のアプリをiPhone Safariで開き、右上メニューから診断ログを開きます。0件と複数件のログで「閉じる」が一行で見え、ボタン全体が画面内に収まることを確認してください。長いビルドID・長いログ本文を表示した状態でも、閉じる／コピー／クリアと本文スクロールを操作し、診断ログを閉じた後に通常画面へ戻ることを確認してください。オンライン作成・参加など他ダイアログの「閉じる」も引き続き操作できることを確認してください。

## 2026-10-31 iPhone Safari実機確認（ユーザー報告）

2026年10月31日、ユーザー本人からiPhone Safariでの実機確認結果が報告されました。これはユーザー本人の操作結果であり、Codexが実機を操作した結果ではありません。

| No. | 確認項目 | 結果 |
| --- | --- | --- |
| 1 | 診断ログの「閉じる」が1行で表示される | OK |
| 2 | 「閉じる」を押すと正常に閉じる | OK |
| 3 | 「コピー」「クリア」が正常に動作する | OK |
| 4 | ログ本文をスクロールできる | OK |
| 5 | オンライン作成・参加など、他のダイアログの「閉じる」が正常に動作する | OK |

**実機確認結果：OK 5件、NG 0件。**

この報告で確認できる環境情報はiPhone Safariです。端末機種、iOSバージョン、確認時刻は報告されていません。ログ0件・複数件の個別状態、長いビルドID・長文ログの実機再現も報告されていないため、これらは実機確認済みとして扱いません。これらの条件のChromium／WebKitでの自動Browser UI結果は上記のCI記録の範囲です。

## 実機確認後の完了判定

既存の自動検証（`npm test` 70件、`npm run build`、Browser UIのChromium・WebKit成功、およびActions run 41191873055のCI/deploy成功）に、ユーザー本人による上記5項目すべてのiPhone Safari実機確認が加わりました。Issue #10の対象である「閉じる」ボタンの1行表示と操作、および依頼された関連操作が報告範囲で正常だったため、本Issueを完了と判定し、completedとしてCloseします。自動テストと実機確認は別の結果として記録しています。
