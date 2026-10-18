# Codex Cloud Chromium 起動制限の診断

診断日: 2026-10-18

対象: Codex Cloud の `/workspace` 実行環境

リポジトリの診断開始時点の `main`: `f4ede26b2714a1311ac97a7cc40a92b75d43ccae`

## 結論

Chromiumのバージョンやページのテスト内容ではなく、Codex Cloudのコマンド実行サンドボックス内でローカルUnixソケットへの `setsockopt(SOL_SOCKET, SO_PASSCRED)` が `EPERM` になることが原因。ChromiumのCrashpadが起動時にこの設定を行い、失敗を致命的エラーとして扱うため、ページを開く前にChromiumが `SIGTRAP` で終了する。

サンドボックスを有効にしたPlaywrightの最小起動でも再現した。Codex Cloud内の安全な設定で回避する方法は確認できなかった。ゲームコード、ブラウザーテスト、既存のGitHub Actionsワークフローは変更していない。

## 実行環境と診断結果

- Python: `3.12.14`
- Python Playwright: `1.62.0`
- `HEIBON_CHROMIUM`: 未設定
- 診断に使われるChromium: `/usr/bin/chromium`
- Chromium: `154.0.8037.57` (Debian GNU/Linux 13 / trixie)
- プロセス状態: UID 1000、`NoNewPrivs: 1`、`Seccomp: 2`、`Seccomp_filters: 1`、`CapEff: 0000000000000000`

最小socketpair診断では `socket.socketpair()` は成功し、その一方に対する `setsockopt(SOL_SOCKET, SO_PASSCRED, 1)` は `PermissionError(1, 'Operation not permitted')`、errno `EPERM` で失敗した。プロセスはseccompフィルター下にあり、観測した失敗はこのサンドボックス内での `setsockopt` 制限と一致する。フィルターの内部ルールそのものはこの実行環境から確認できない。

続いて一度だけ、`executable_path='/usr/bin/chromium'`、`headless=True`、`chromium_sandbox=True` を指定し、追加の起動引数を渡さず `data:` ページを開く最小起動を試した。Playwrightの起動ログには `--no-sandbox` はなく、ChromiumはCrashpad起動時に次を出力した。

```text
ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:45] setsockopt: Operation not permitted (1)
```

その後Playwrightは `TargetClosedError` を返し、プロセスは `SIGTRAP` で終了した。ページは開かれなかった。この結果からPlaywrightのサンドボックス有効設定や通常の起動引数で解消する方法は確認できなかった。

この起動失敗はインターネット接続とは別のローカルIPC制限である。ネットワーク許可やプロキシ設定の変更は、`AF_UNIX` socketpairへの `setsockopt` を許可しない。既知issue #47452 のコメントにも、ネットワークアクセスを有効にしても同じ `EPERM` が続いた報告がある。

## 関連する既知issue

- [openai/codex #47452](https://github.com/openai/codex/issues/47452): seccompがローカル `AF_UNIX` socketpair上の `SO_PASSCRED` を拒否し、Crashpad起動中にChromiumが停止する事例。今回のsocketpairとCrashpadの観測に一致する。
- [openai/codex #53187](https://github.com/openai/codex/issues/53187): Codex Cloud環境で `/usr/bin/chromium` とPlaywrightが同じCrashpadエラーを出し、ページを開けない事例。独立したsocketpair診断も `EPERM` を報告している。

いずれもChromiumの内部サンドボックスを無効にするだけでは解消しないOSレベルの制限を示す。今回の診断では `--no-sandbox`、`danger-full-access`、seccompの変更やシステム権限の変更を使用していない。

## GitHub Actionsとの違い

既存の [Browser UI verification](../../.github/workflows/browser-ui.yml) はGitHub-hosted `ubuntu-latest` 上で実行され、そこでPlaywrightとChromiumをインストールする。ワークフローはPlaywright管理下のChromium実行ファイルを `HEIBON_CHROMIUM` に設定し、既存のブラウザースクリプトを実行する。Codex Cloudでは `HEIBON_CHROMIUM` が未設定のため、今回の診断ではシステムの `/usr/bin/chromium` を使った。

Playwright APIとChromiumの種類に加え、実行場所のプロセス制限が異なる。GitHub-hosted runnerではこのCodex Cloud固有の `SO_PASSCRED` 拒否が発生しないため、同じブラウザーテストを実行できる。既存のブラウザースクリプトが使う `--no-sandbox` はChromium自身のサンドボックス設定であり、Codex Cloudのseccompフィルターを変更・迂回する設定ではない。

ワークフローはPython 3.12でPlaywrightをインストールし、`playwright install --with-deps chromium` 後に `tests/browser-riichi-discard-layout.py`、`tests/browser-table-ui.py`、`tests/browser-round-end-ui.py`、`tests/browser-dora-rows.py`、`tests/browser-mobile-table-layout.py`、`tests/browser-seat-kan-overlap.py`、`tests/browser-step13-5-5.py`、`tests/browser-step13-5-5-kan.py`、`tests/browser-step13-6.py` を実行する。Actionsの実際の成功・失敗は、対象コミットのworkflow runを確認して判断する。

## 今後の運用

- Codex Cloudでは単体テスト、TypeScriptチェック、ビルドを実行する。
- ブラウザーUI検証は既存のGitHub Actions `Browser UI verification` を正式な実行先とする。新しい検証ケースは既存ワークフローへ追加する。
- この既知エラーを起こした同じCloud実行環境ではChromium起動を再試行しない。環境またはサンドボックスの更新、もしくは新しい正規の安全な起動方法が利用可能になった場合にだけ、socketpairと単一ページ起動で再検証する。
- Actionsの対象SHA、workflow runと結果が未確認なら、ブラウザー検証を成功と報告しない。ブラウザーテストが未実施の状態とActionsでの成功を明確に分ける。
- iPhone Safari実機確認は、引き続き別の確認として扱う。
- 関連するActionsの全ブラウザー検証が成功した完了報告では、成功結果を中心に簡潔に記載する。検証が未実施・未確認、失敗、または新たな問題があった場合は、その状況を具体的に報告する。
