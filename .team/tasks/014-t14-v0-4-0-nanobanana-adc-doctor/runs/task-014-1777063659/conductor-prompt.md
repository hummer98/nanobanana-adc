# タスク割り当て

## タスク内容

---
id: 014
title: T14: v0.4.0 — nanobanana-adc doctor サブコマンド追加
priority: medium
created_by: surface:724
created_at: 2026-04-24T20:43:59.253Z
---

## タスク
環境・認証状態の診断サブコマンド `nanobanana-adc doctor` を追加する。ユーザーが画像生成を実行する前に、どの認証経路が使われるのか、環境変数は揃っているか、既知の落とし穴（`GOOGLE_CLOUD_LOCATION=global` 必須など）に引っかかっていないかを 1 コマンドで診断できるようにする。v0.4.0 (minor) として切る前提。

## 背景
- v0.3.0 時点で `nanobanana-adc` には画像生成しかサブコマンドが無く、環境設定の不整合はユーザーが `gcloud`・`env`・生成ログの `[auth] using: ...` を手作業で突き合わせるしかない
- 実際このセッションでも、`.envrc` が direnv reload 等で `GOOGLE_CLOUD_LOCATION=us-central1` に戻っていて、ADC 経路に切り替えるとまた 404 する状態に気付くのに手間がかかった
- CLAUDE.md の invariant "Fail loudly on auth ambiguity" と "Region-less host for location=global" をユーザー側から検査できる公式手段が欲しい

## 受け入れ基準

### 1. CLI のサブコマンド化
現状の `src/cli.ts` は commander の program にオプションを直接付けて default 動作が画像生成になっている。doctor を足すにあたって:
- [ ] `program.command('doctor')` でサブコマンド化
- [ ] 既存の画像生成動作は **後方互換**: `nanobanana-adc --prompt ...` はこれまで通り動く（default command として `.action(...)` or `.command('generate', { isDefault: true })`）
- [ ] `nanobanana-adc --help` のトップに `generate` / `doctor` 両方が見える
- [ ] `nanobanana-adc doctor --help` で doctor 固有のオプションが見える

### 2. doctor が出力する項目
プレーンテキスト出力で以下を表示する。機微な値はマスク:

- [ ] **CLI**: 実行中の `nanobanana-adc` のパス (`process.argv[1]` から resolve) と version
- [ ] **Auth route**: `--api-key > GEMINI_API_KEY > ADC` の優先順位で**実際に選ばれる経路**を 1 行表示
- [ ] **API key**: `GEMINI_API_KEY` が set か、set なら prefix 6 文字 + 長さ（例: `AIzaSy… (len=39)`）。形式が `AIza` で始まらない場合は warning
- [ ] **ADC**: `google-auth-library` の `GoogleAuth.getAccessToken()` が実際に成功するか試して ok/fail を表示（token 本体は出さない）。成功時は `account` と `project` を `gcloud auth list` / `gcloud config get-value project` 相当から拾う（gcloud が無ければ ADC 環境変数のみから）
- [ ] **GCP env**:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_CLOUD_LOCATION` — `global` 以外なら **warning**（現行モデル `gemini-3-pro-image-preview` は global 必須）
  - `GOOGLE_GENAI_USE_VERTEXAI` — `true` 以外なら warning
  - `GOOGLE_APPLICATION_CREDENTIALS` — set ならパスを表示、ファイルが存在しないなら warning
- [ ] **Install method**: `nanobanana-adc` のパスから判別（`/.claude/plugins/` 配下なら plugin、`node_modules/.bin/` or global bin なら npm、それ以外なら source）
- [ ] **Model 想定**: 既定 `--model` が Gemini 3 Pro Image で global 必須である旨を最後に 1 行案内

### 3. オプション
- [ ] `--json` — 機械可読 JSON で同じ情報を出力（CI や他スクリプトから parse できるように）
- [ ] `--verbose` / `-v` — ACCESS_TOKEN の先頭 8 文字、gcloud 設定の raw 等、debug 向け追加情報（本体値は出さない）

### 4. 警告の設計
以下のケースで warning を明示する（stderr or 行頭 `⚠`）:
- [ ] `GEMINI_API_KEY` も ADC も使えない（API call は必ず失敗する）
- [ ] `GEMINI_API_KEY` が set されているが `--api-key` 経路を期待していない場合の注意（優先順位により API key が先に使われる）
- [ ] `GOOGLE_CLOUD_LOCATION` が `global` 以外
- [ ] `GOOGLE_CLOUD_LOCATION` が未設定（ADC 経路が機能しない）
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` が指すファイルが存在しない
- [ ] `GOOGLE_GENAI_USE_VERTEXAI` が set されているが `true` 以外
- [ ] CLI 実行バイナリが npm registry 上の最新 version と乖離している場合は informational（fatal にはしない）。ネットワーク off でも動くよう `npm view` 呼び出しは best-effort

Warning は fail にはしない。`doctor` は **常に exit 0**（機械 parse しやすさ優先）。ただし fatal な矛盾（API key / ADC ともに使えない）があるときは **exit 1** で終わる設計を実装者が選んでも良い。選択と理由を summary に書く。

### 5. プライバシー / マスキング
- [ ] `GEMINI_API_KEY` は prefix 6 文字 + 長さのみ
- [ ] ADC access token は出さない（`--verbose` 時のみ先頭 8 文字）
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` の JSON は**開かない**（パスのみ）
- [ ] `--json` 出力も同じマスキング規則を適用

### 6. 型と実装構造
- [ ] doctor ロジックは `src/doctor.ts` に切り出し、`src/cli.ts` からは呼ぶだけ
- [ ] 環境変数読み取りは `doctor.ts` 内でまとめる（テストで環境変数を差し替えやすくする）
- [ ] 既存 `src/auth.ts` の `resolveAuth()` を**壊さない**。doctor は auth 側を軽く呼ぶだけ、または独立に env を読む
- [ ] strict mode、typecheck / build pass

### 7. テスト
- [ ] `buildDoctorReport(env)` の unit test（環境変数のパターンを differ な組み合わせで入れて warning 出力を検証）
- [ ] `--json` の schema をテスト
- [ ] auth route 判定ロジックのテスト（`--api-key` > `GEMINI_API_KEY` > ADC の優先順位）

### 8. ドキュメント
- [ ] `README.md` / `README.ja.md` に doctor の説明と出力例を追加
- [ ] `CLAUDE.md` の "ファイル責務" 表に `src/doctor.ts` を追加
- [ ] `CHANGELOG.md` に `[0.4.0]` セクション追加

### 9. バージョン
- [ ] `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` の version を `0.4.0` に揃える（CI の validate-plugin ジョブが通ること）

### 10. 動作確認
- [ ] `nanobanana-adc doctor` を実環境で実行し、下記 3 パターンで出力が妥当なことを summary に貼る:
  - a. 現在の環境（API key + ADC 両方 set、location=us-central1）— warning が出る想定
  - b. `env -u GEMINI_API_KEY` + `GOOGLE_CLOUD_LOCATION=global` — clean、auth route=adc
  - c. `env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT ...` — fatal warning（両経路共 unusable）
- [ ] `nanobanana-adc doctor --json | jq .` で JSON が valid であることを確認

## スコープ外
- Claude Code plugin 側の state 診断（`claude plugin list` との照合など）— OS 側の `claude` CLI を呼ぶ設計は依存を増やすので今回は含めない。将来 `--check-plugin` みたいなフラグで optional 対応にする余地を残す
- リリース作業（`/release 0.4.0`）— T14 完了後、別途
- モデル 自体の health check（API を実際に叩く doctor）— 課金発生を避けるため今回は含めない

## 参考
- `src/auth.ts` — 認証優先順位のソース
- `src/cli.ts` — commander の現状構造（サブコマンド化のリファクタ起点）
- `CLAUDE.md` の "Fail loudly on auth ambiguity" / "Region-less host for location=global"
- `docs/seed.md` の環境変数表と認証優先順位

## 注意
- `.npmrc` の `save-exact=true` / `ignore-scripts=true` に整合する dependency のみ追加可（`commander` / `google-auth-library` で足りるなら新規依存不要が理想）
- secret を標準出力に垂れ流さない（マスキング徹底）
- CI の `validate-plugin` ジョブは v0.4.0 の 4 箇所 version 同期を要求するので抜け漏れに注意


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-014-1777063659/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/014-t14-v0-4-0-nanobanana-adc-doctor/runs/task-014-1777063659
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/014-t14-v0-4-0-nanobanana-adc-doctor/runs/task-014-1777063659/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
