# T11 検品結果

## Verdict

**GO**

## Summary

`.claude/commands/release.md`（298 行）は plan.md の仕様を網羅している。フロントマター・Master 側タスク作成 bash・Conductor 向け 11 ステップ本文（分岐条件を含む）・nanobanana-adc 向け置換（パッケージ名 / marketplace 識別子 / npm publish フロー）すべて pass。`cmux-team` 残り物なし、スコープ外変更なし。

## Checklist

### (1) ファイル存在
- **pass** — `.claude/commands/release.md` が worktree 内に存在（298 行、7KB 強）。サイズは妥当。

### (2) フロントマター
- **pass** — `---`（L1）で始まり `---`（L4）で閉じる
- **pass** — `allowed-tools: Bash`（L2）
- **pass** — `description: "リリース作業を --exclusive タスクとして起票する"`（L3、文字列完全一致）

### (3) Master 側セクション
- **pass** — `VERSION_ARG="$ARGUMENTS"`（L22）でバージョン受け取り
- **pass** — 省略時フォールバック `TITLE="リリース（バージョン自動判定）"`（L26）
- **pass** — `cmux-team create-task --status ready --priority high --exclusive`（L29-33）
- **pass** — タスクタイトルに `v$VERSION_ARG` を埋め込み（L24）

### (4) Conductor 側タスク本文（TASK_BODY heredoc 内）
- **pass** — operational task 扱い・「サブエージェントは spawn しない」明記（L41-46）
- **pass** — main ブランチ側で commit/tag/push する注記（L52-56）
- **pass** — `package.json` からバージョン取得、node 優先 / python フォールバック（L64-69）
- **pass** — `.claude-plugin/plugin.json` `[ -f ... ]` 分岐（L136-138）および marketplace.json 分岐（L141-143）
- **pass** — marketplace キャッシュ `[ -d "$MARKETPLACE_DIR/.git" ]` 分岐（L168-172）
- **pass** — `.github/workflows/release.yml` `[ -f ... ]` 分岐（L205-213）
- **pass** — `CHANGELOG.md` が無ければヘッダ付き新規作成、存在すれば追記（L96-106 + L108-121）
- **pass** — `npm view nanobanana-adc@${NEW_VERSION}` 重複チェック → 警告（L224-228）、`npm view nanobanana-adc` 初回 publish 判別（L231-235）
- **pass** — `npm publish --dry-run` → 本番 `npm publish` → 失敗時 `PUBLISH_STATUS="failed"` を journal に記録（L238-250）
- **pass** — 最後に `cmux-team close-task --task-id <id> --journal "..."`（L264）、journal に `v${CURRENT} → v${NEW_VERSION}` とスキップ内訳含む（L265-273）

### (5) nanobanana-adc 特有の置換
- **pass** — パッケージ名 `nanobanana-adc`（unscoped）が 21 箇所で使用
- **pass** — `@hummer98/cmux-team` `hummer98-cmux-team` などの残り物なし（grep 結果: 該当 0 件）
- **pass** — `cmux-team` の出現（7 箇所）はすべて CLI ツール名（`cmux-team create-task` / `status` / `trace-task` / `close-task`）として正しい文脈でのみ使用
- **pass** — marketplace 識別子は `yamamoto-nanobanana-adc`（L167, 178, 192-194）

### (6) bash 構文チェック
- **pass**（方法論補足あり、下記）

### (7) その他の観点
- **pass** — 参考元へのリンク: L298 に `<!-- 参考元: cmux-team/.claude/commands/release.md (hummer98/cmux-team) -->` として記載
- **pass** — スコープ外変更なし: `git status` で検出されたのは `.claude/`（untracked、新規ディレクトリ）のみ。`package.json` / `README.md` / `CHANGELOG.md` / `src/` などへの変更なし

## bash 構文チェック結果

### 指定スクリプト（regex ベース抽出）

```
Found 1 bash blocks
BLOCK 0 SYNTAX ERROR:
  行 41: 警告: ヒアドキュメントの 13 行目でファイル終了 (EOF) に達しました (`TASK_BODY' が必要)
  行 42: 対応する `)' を探索中に予期せずファイルが終了しました (EOF)
Total errors: 1
```

**方法論上の限界**: 指定 regex `r'```bash\n(.*?)\n```'`（非貪欲）は、TASK_BODY heredoc 内に書かれた入れ子の ``` フェンス（各ステップの説明コードブロック）で早期終了してしまうため、Master 側の外側 bash ブロック全体を捕捉できない。これは抽出スクリプト側の限界で、release.md 自体の問題ではない（cmux-team 原本も同じ構造で動作している）。

### 補完検証（外側 bash ブロックを手動抽出して bash -n）

Markdown の ```bash オープン（L21）から、TASK_BODY heredoc が閉じた後の外側 ``` クローズ（L278）までを正確に抽出して `bash -n` で構文検査:

```
```bash open: line 21
TASK_BODY close: line 276
outer ``` close: line 278
Body: 256 lines, 7288 bytes
bash -n exit=0
```

**TASK_BODY heredoc open/close バランス**: opens=1, closes=1（正常）

外側 bash ブロック（Master が実行するタスク作成スクリプト全体）は構文エラーなし。Inspector プロンプトの注記「heredoc 内のサブスクリプトまで個別検証しなくてよい（Master 側が実行するのは heredoc 全体を文字列として扱う部分だけ）」に沿い、これを最終判定とする。

## Fix Required

なし（GO）。

### 参考メモ（任意の将来改善）

- (6) の regex ベース抽出スクリプトは TASK_BODY heredoc 内の ``` フェンスで誤検知するため、今後この検品を自動化する場合は、
  - 外側フェンスを ````bash（4 バッククォート）にして内側 ``` とレベル分離する、または
  - 抽出スクリプト側で heredoc 開始後の ``` を無視するロジックを入れる
  のどちらかを検討するとよい。ただし今回は cmux-team 原本の構造を踏襲することを優先し、現状のまま GO とする。
