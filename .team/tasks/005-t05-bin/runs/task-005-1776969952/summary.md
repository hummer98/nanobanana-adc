# T05 実装サマリー: ビルド・bin 配線

## 概要

`nanobanana-adc` を `npm link` すれば即実行できる状態にした。`bin/nanobanana-adc`（ESM 静的 import 方式）を新規作成し、`package.json` に `files` フィールドを追加。

## フェーズ実行

1. **Phase 1 (Plan)** — Planner Agent (surface:755) が `plan.md` を作成。ESM bin の 3 方式を比較し「案 A: 拡張子なし + shebang + 静的 import」を採用。
2. **Phase 3 (Impl)** — Implementer Agent (surface:756) が plan に沿って実装・検証。
3. **Phase 4 (Inspection)** — Inspector Agent (surface:757) が 9 項目すべて ✓ で **GO** 判定。

設計レビューは中規模タスクとして skip。

## 変更ファイル

- **新規**: `bin/nanobanana-adc`（2 行、mode 100755）
- **変更**: `package.json`（`files` フィールド追加）

`dist/` は `.gitignore` 配下のためコミット対象外。

## 受け入れ基準チェック

| # | 基準 | 結果 |
| --- | --- | --- |
| 1 | `tsconfig.json` `outDir: "dist"` | ✓（既設定） |
| 2 | `npm run build` で `dist/cli.js` 生成 | ✓ |
| 3 | `bin/nanobanana-adc` shebang + import | ✓ |
| 4 | `chmod +x` / mode 100755 | ✓ |
| 5 | `package.json` `bin` フィールド | ✓（既設定） |
| 6 | `npm link` 後 `nanobanana-adc --help` 動作 | ✓ |
| 7 | `package.json` `files` フィールド | ✓ |

## npm link 動作確認（受け入れ基準要求）

```
$ npm link
added 1 package ... (in worktree)

$ which nanobanana-adc
/Users/yamamoto/.anyenv/envs/nodenv/shims/nanobanana-adc

$ nanobanana-adc --help
Usage: nanobanana-adc [options]

Gemini 3 Pro Image CLI with ADC support

Options:
  -V, --version         output the version number
  -p, --prompt <text>   prompt text (required)
  -o, --output <path>   output file path (default: "output.png")
  -a, --aspect <ratio>  aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3,
                        21:9, 9:21, 5:4) (default: "1:1")
  -s, --size <size>     image size (choices: "1K", "2K", "4K", default: "1K")
  -m, --model <id>      model id (default: "gemini-3-pro-image-preview")
  --api-key <key>       Gemini API key (falls back to GEMINI_API_KEY / ADC)
  -h, --help            display help for command

$ nanobanana-adc --version
0.1.0
```

## 設計判断

**ESM bin の方式選択**: `"type": "module"` なので、拡張子なし `bin/nanobanana-adc` を ESM として静的 import する案 A を採用。
- 案 B (dynamic import): Promise 握り漏れリスクのみ増加、メリットなし
- 案 C (`bin` を `./dist/cli.js` に直接向ける): 受け入れ基準 `bin/nanobanana-adc` 作成と矛盾、`postbuild chmod +x` が必要

**`files` 先行列挙**: T06/T07 で追加予定の `SKILL.md`, `settings.json`, `README.md`, `LICENSE` も列挙。npm は存在しないファイル名を黙って無視するので副作用なし、後続タスクでのフィールド再編集を回避。

## 懸念・残課題

- `npm link` で作った global シンボリックリンク（worktree を指す）は worktree 削除で dangling link になる。Step 10 実行前に `npm unlink -g nanobanana-adc` でクリーンアップする。
- `prepublishOnly` / `prepare` による自動ビルドは本タスク範囲外（T08 で対応予定）。
- `dist/` バージョン不整合リスク（bin だけ更新して build し忘れ）は T06 SessionStart フック / T08 publish 設定で解決予定。

## 納品

- 納品方式: ローカル ff-only マージ（small change, personal project）
- マージ先: `main`
