# itch.io 公開準備・更新手順（Issue #46）

確認日 2026-11-28。対象製品ツリーは `c2ffd745a53eb5273155c8f71761a7eefd877381`。この文書は準備資料であり、管理画面の設定済みや公開許可を意味しない。最新の[環境運用](environments.md)と[v1通信互換性](online-compatibility.md)を優先する。

## 掲載用の文章

**タイトル**: HEIBON MAHJONG

**短い紹介文**: CPUとの対局や、ルームコードを使ったオンライン対局を楽しめる四人打ち麻雀。

**詳細説明**:

> HEIBON MAHJONGは、ブラウザーで遊べる四人打ちリーチ麻雀です。CPU3人との対局を始めたり、ルームコードを共有して友人とオンラインで対局したりできます。東風戦・半荘戦やCPUの難易度などを選べます。
>
> 牌をクリックまたはタップして選び、画面に表示されるボタンで打牌・リーチ・鳴き・和了などを操作します。PCではTabで項目を移動し、EnterまたはSpaceでも選択・確定できます。対局に応じた操作が表示されます。
>
> オンライン対局では、卓を作成してルームコードを共有するか、コードを入力して参加します。GitHub Pages版とitch.io版のプレイヤーも同じ卓に参加できます。ルームの作成・参加と対局中の同期にはインターネット接続が必要です。
>
> ホーム画面からの起動や、オフラインでCPUと対局したい場合は、[GitHub Pages版](https://ak-sekine.github.io/heibon-mahjong/)をご利用ください。Pages版は初回のオンライン起動と端末への保存が必要です。itch.io版のオフライン起動やホーム画面へのインストールは保証していません。
>
> iPhone SafariとPCブラウザーでの操作を確認しています。端末・ブラウザーや画面の大きさによって表示や操作が異なる場合があります。Android、Firefoxなど、確認していない環境での動作は保証していません。
>
> 不具合の報告は[GitHub Issues](https://github.com/ak-sekine/heibon-mahjong/issues)へお願いします。端末・ブラウザーと操作手順をお知らせください。ルームコード、認証情報や他の参加者の個人情報は投稿しないでください。

推奨タグ: Mahjong、Strategy、Singleplayer、Multiplayer、Browser（管理画面に存在する正確な候補から実態に合うものを選ぶ）。言語は日本語。料金は無料を基本とし、任意支援は所有者が選択する。次の権利確認とVite表示を終える前に公開しない。

## 配布候補と自動検証の範囲

CI成功済み製品ツリー `77c6c35cc381ffe6987f4ace8bca8cff0fe1653f` と基準mainとの差は `docs/verification/issue69-pages-phase2b2.md` のみ。対象CI [46045430838](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838) のverify・Chromium/WebKit・local-online・auditは成功。[artifact 15222436013](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838/artifacts/15222436013) は本番Worker接続先を用いた `itch-html5-77c6c35cc381ffe6987f4ace8bca8cff0fe1653f-1`、2027-02-25まで有効。外側artifactのSHA-256は `30fe2513c921f983b1f10c3bbc9a7f29ae01bb138d68d15da7d0a629308e65aa`。内側には `heibon-mahjong.zip`、`SHA256SUMS`、`source-sha.txt` を保存する設定。外側digestは内側ZIPのdigestではない。

正式GitHub連携でartifactのファイル参照取得に成功したが、この実行環境は参照先取得でHTTP 403となり、内側の内容やdigestを直接確認できなかった。ユーザーがGitHub上のartifactを取得できる場合、外側を展開し `SHA256SUMS` と内側ZIPを照合する。内側ZIPをさらに展開してアップロードしない。CIのBrowser UIは同じ製品ツリーの `https://online-mock.invalid` を指定した別ビルド `dist-itch` をChromium/WebKitで検証する。本番接続ZIPそのもののバイト列のブラウザー実行を証明しない。

代替ZIP: `artifacts/itch/heibon-mahjong.zip`（ローカル生成、2026-11-28、ソース `c2ffd745a53eb5273155c8f71761a7eefd877381`、92,120 bytes、SHA-256 `294a8f0ea85c79655f0cffb069b474f0a66a2f944c03987efb3548b99ff289ed`）。`index.html`、`assets/main-B-E01t_8.js`、`assets/main-XaFuRHRL.css` の3ファイル、展開後352,940 bytes。`build:itch`・CRC・既存パッケージテスト成功。HTMLのCSS/JS参照は `./assets/`、PWA manifest・SW・アイコン・検証ページは含まれない。本番API `https://heibon-mahjong-online.ak-sekine.workers.dev` がバンドルに存在し、開発WorkerやmockのURLは検出されなかった。`localhost` / `127.0.0.1` 文字列はURL安全判定の許容条件として残り、接続先として設定されたことを意味しない。代表的な秘密鍵・GitHub token・AWS access key形式は検出されなかったが、網羅的な秘密情報不在の証明ではない。ローカルZIP自体のChromium/WebKit実行は未実施。Viteのライセンス表示の不足を確認するまで、このZIPを一般公開用として確定しない。

現在DraftのSHA・digest・配布日は不明。ユーザー実機による現行Draftの確認と新ZIPの検証を混同しない。新候補に更新する場合は、権利・配布条件を整理したZIPについて、元SHA・ZIP digest・日付・確認結果を記録し、以下を実施する。SHA一致はPages・Worker・itch間の通信互換性の前提ではない。

## 権利・クレジット調査

| 対象 | 根拠と現状 | 公開前の処理 |
| --- | --- | --- |
| 本体コード・ゲーム名・説明文 | repositoryにLICENSEは見つからず、`package.json`はprivate。これだけでは著作権者や公開物への許諾条件を確定できない | 権利者が公開権限・名称・文言を確認。新しい本体ライセンスは独断で設定しない |
| Vite補助コード | ZIPのJS先頭は `node_modules/vite/dist/node/chunks/config.js` のmodulepreload polyfillと対応。Vite 7.3.7の `node_modules/vite/LICENSE.md` はMIT、Copyright (c) 2019-present, VoidZero Inc. and Vite contributors。原文は同ファイルおよび [Vite LICENSE](https://github.com/vitejs/vite/blob/v7.3.7/packages/vite/LICENSE.md) | MITの著作権・許諾原文をコピーに含める条件を確認。現行ZIPにはライセンスファイルがない。ページだけで十分と仮定せず、配布方法の修正・表示を別途判断 |
| 直接開発依存 | `package-lock.json` とインストール済みmetadata: TypeScript 5.9.3 Apache-2.0、Vite 7.3.7 MIT、Wrangler 4.151.2 MIT OR Apache-2.0、ws 8.22.0 MIT | build/test用。Vite生成polyfillは上記のとおり配布JSへ入る。各原文は各packageのLICENSEを参照 |
| 間接開発依存 | lockfileの各package metadataにMIT、Apache-2.0、LGPL-3.0-or-later、ISC、BSD-3-Clause、CC0-1.0、0BSD等の宣言あり。プラットフォーム別任意依存を含む | 開発時の利用とブラウザー配布を混同しない。Vite以外の生成コードの完全な来歴は未確定。必要なNOTICEと同梱対象を確定する |
| 麻雀牌 | `src/rendering/tile-svg.ts` にSVG描画を実装。別画像はZIPにない | ソース内の絵柄・文字の権利と出典を権利者が確認。自作であることをファイル名のみから断定しない |
| PWAアイコン | `public/icons/` に提供されたPNG。履歴 `83804ced632424cfd3a77059589f36e47a21ab09` は “provided design”。`build-pwa.mjs` は既存ファイルを保持し、欠落時のみ代替を生成 | 出典・著作者・公開利用条件が不明。coverに利用しない。旧#46記録の「生成されたオリジナル」は現行素材に関して誤り |
| フォント | `src/style.css` と牌SVGはsystem-ui等の端末フォントを指定。ZIPにフォントファイルなし | スクリーンショットに写るフォントは利用環境依存。画像化して配布する条件を確認 |
| 背景・音声 | ZIPはHTML/CSS/JSの3ファイル。外部画像・音声ファイルは含まない。CSS・SVG内の描画とコードの出典は別途確認 | 素材を外部提供していないことを確認。見落としの可能性は残す |
| 公開画像 | 現行UIの公開用画像はまだ選定・権利確認できていない | 他人の手牌・room code・token・個人情報・検証表示を含まない画像を確認。出典と撮影日も記録 |

MITの必要表示を含む原文（配布実装へ反映するかは別途判断）:

```text
MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 管理画面・更新

実画面は未確認。表示名はitch.ioの変更により異なることがある。[HTML5公式](https://itch.io/docs/creators/html5)、[ページ作成](https://itch.io/docs/creators/getting-started)、[料金](https://itch.io/docs/creators/pricing)を2026-11-28に確認。

1. 権利・配布条件を解消後、対象ZIPのsource SHA、digest、サイズを確認し、Dashboardの既存DraftのKind of projectがHTML Gameであることを確認する。Uploadsで内側ZIPを選び、ブラウザーで実行するファイルとして指定する。外側artifactをそのまま指定しない。
2. DesktopはClick to launch in fullscreenを推奨。固定埋め込みを選ぶ場合は実測viewportを確認し、必要に応じてfullscreen buttonを設定する。iPhoneでのタッチと画面サイズを確認後、Mobile friendly設定を判断する。公式上モバイルではクリックで全画面起動する。設定の名称や実際の画面は未確認。
3. 無料を基本とし、任意支援の有無はユーザーが選択する。説明文・日本語・関連タグ・coverと3〜5枚の画像を設定する。cover推奨630×500、比315:250、最低315×250。画像枚数・推奨寸法はZIPの必須条件ではない。
4. VisibilityはDraftのまま保存。ZIPの取得元、ソースSHA、内側digest、アップロード日時、確認者・端末・結果を記録する。以下の手順で新ZIPを確認する。旧Draftの報告とは分ける。
5. 公開不適合や不具合があればPublicにせず調査する。公開後に問題が見つかった場合は、所有者が公開停止・旧版への戻しを判断する。旧版のSHA・digestとWorker契約、保存データの互換性を証拠で確認できない場合は切り戻さず調査する。新規Public化・設定変更はユーザーが行う。

## 実機チェックリスト

旧Draftについては#69の11項目中、双方の作成・参加、操作・状態同期、切断後の再接続が本人報告OK。ただし端末内訳・各操作・復元状態は未列挙。#46では2026-11-05にiPhone SafariのDraft起動OK・CPU「問題なさそう」。#31では2026-11-03にiPhone SafariでPagesをホーム追加・起動し、機内モードでCPU新規対局開始・操作がOK。#69では2026-11-28の本番PWA更新・再起動、CPU基本操作がOK。これらの対象日・配布物は異なるため、新ZIPでの確認に移記しない。

共通判定: **OK** は指定操作を実行し期待結果を確認、**NG** は実行して不一致・エラーを確認、**未確認** は未実施・局面未発生・操作や結果を特定できない場合。確認日、PCのOS・ブラウザー、iPhone機種・iOS、使用ZIP digest、Pages側の利用版を記録する。対局中のスクリーンショット・報告にルームコードや認証情報を残さない。

| 対象・端末 | 手順 | 期待結果・必要な理由 |
| --- | --- | --- |
| 新Draft・PC | Draftを開きCPU新規対局を開始、牌選択と打牌を行う | 表示され操作可能。旧DraftではPCの対象が特定されていない |
| 新Draft・iPhone Safari | Draftを開きCPU新規対局を開始、牌とボタンをタップして打牌 | 起動・タッチ操作が正常。旧DraftのiPhone報告を新ZIPへ転用しない |
| 新Draftと本番Pages・PC＋iPhone | Pagesで卓作成→itchから参加、続いて逆方向も実施。準備・座席確定・開始後、打牌し双方を比較 | 両方向で参加し、各操作・状態が双方で一致。旧Draftの両方向参加は報告済みだが新ZIPと個別操作は未確認 |
| 同じ対局 | 実際に可能な局面で鳴きを実施し、続けて和了まで進め、双方の公開面子・結果を比較 | 鳴きと和了結果が一致。局面が発生しなければ未確認。報告されていない個別操作を推測しない |
| 同じ対局 | 一方の接続を切り、復帰して再接続。相手側の状態と自分の画面を照合 | 対局状態が復元し操作を継続可能。旧Draftは再接続OKだが新ZIPと復元状態は未確認 |
| Pages PWA・iPhone Safari | 既存インストールと#69更新・再起動の報告を維持。直近公開版での回帰を追加確認する場合、一度オンライン起動後、機内モードでホーム画面から起動しCPU新規対局・打牌。未導入の場合のみ共有からホーム画面へ追加 | 起動・操作可能。#31の旧版では実機OK、現行版での機内モードCPUは明示されていない。新Draftの更新とは独立 |

WebSocket Handshake Originの実測は診断情報であり、#46の受入条件に追加しない。実行Originと過去のWorker受信HTTP Originは `https://html-classic.itch.zone`、Handshakeヘッダーは未確認。異常時にNetworkまたはWorkerログから別々に観測する。

## ライセンス同梱の追加対応（2026-11-28）

以降の候補では、`scripts/package-itch.mjs` がロックファイルとインストール済みViteのversion `7.3.7`、MIT表記、`LICENSE.md` のSHA-256 `a77a1c089806b39ad339535bdf3677f636c91d96693e8ad7b11fe733f650ea64` を照合し、原文全体を変更せずZIP直下の `THIRD-PARTY-NOTICES.txt` に入れる。これはVite coreのMIT原文に加えてVite配布物に同梱された依存ライセンス一覧も含む。ZIPは厳格なallowlistのままであり、任意のtextやdirectoryを許可しない。原文が欠落・変更・version不一致の場合は生成を中止する。Vite更新時は実際の生成コードと原文を再確認し、versionとdigestを更新する必要がある。

対象バンドルのsource importsはアプリ内の相対moduleで、Viteのmodulepreload polyfillが出力JSに含まれる。Viteの他の生成補助コードも同じ配布原文の対象とし、他のnpm packageがクライアントに直接importされている証拠は確認していない。完全なコード来歴を保証するものではない。TypeScript・Wrangler・ws等は開発・ビルド・テストの依存であり、すべてがブラウザーへ配布されたという意味ではない。

利用者向けページのクレジット欄には次を掲載する。ZIPにはVite原文全文がある。リンク先はブラウザーでも閲覧できる原文である。

> This game includes code generated by Vite. Vite is licensed under the MIT License. Copyright (c) 2019-present, VoidZero Inc. and Vite contributors. [Vite license and third-party notices](https://github.com/vitejs/vite/blob/v7.3.7/packages/vite/LICENSE.md).

Pages影響: ローカルの本番・開発Pagesビルドでもmodulepreload polyfillを確認した。両buildには今回の通知ファイルは含まれず、公開済みPagesの内容を今回直接再取得したものでもない。Pages向け表示・同梱方法および既存PWAキャッシュの扱いは別途対応する。今回Pages・Workerへの修正や再公開はしない。

画像: 本番接続先ZIPを使うCIのCPU smokeが成功した場合、Chromium/WebKitの390×844画像をCI artifact `itch-release-cpu-<browser>-<SHA>-<attempt>` に保存する。CPU相手のテスト画像だが、実画像・権利・表示内容を人が確認するまでは公開保留。cover、PC、オンライン、局結果の公開画像は未用意。現行DraftでCPU対局、PCブラウザーで卓全体、オンラインで公開情報のみの卓、局結果をそれぞれ撮影し、room code・ユーザー名・非公開牌・通知・ログを含まないことを実際に確認する。coverは許諾済みの現行卓を用い、タイトルを入れた630×500素材を別途準備する。出典未確認のPWAアイコンは使用しない。

所有者への具体的な確認: (1) 本体コードとゲーム名の権利者・itch.ioでの公開権限、(2) `src/rendering/tile-svg.ts` の牌模様・文字や配色の出典と再配布権限、(3) `public/icons/` の「provided design」の提供者・利用許諾（itch ZIPには含まれないがPagesとcover候補に影響）、(4) 公開画像に写るゲーム画面・端末フォントの画像利用権限、(5) 他の著作者・外部素材の有無。名称・ルールの文章や素材について権利不明なものを使用可能とは断定しない。
