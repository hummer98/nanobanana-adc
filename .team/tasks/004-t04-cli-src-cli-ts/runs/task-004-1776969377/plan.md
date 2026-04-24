# T04 実装計画書 — CLI エントリーポイント (`src/cli.ts`)

## 1. 概要

`commander` で引数を解析し、T02 の `resolveAuth()` は使わず（`generate()` 内部で呼ばれる）、T03 の `generate(options: GenerateOptions)` を呼び出すエントリーポイント `src/cli.ts` を実装する。T01 で作成された空の `src/cli.ts` を置き換える。

- 成果物: `src/cli.ts`（shebang 付き）
- 検証: `npx tsc --noEmit` が通る。`--help` が使い方を表示する。
- 前提: `src/auth.ts`（T02）・`src/generate.ts`（T03）は既に実装済み。

> 補足: 受け入れ基準には「T02 の `resolveAuth()` を呼び出す」とあるが、実装的には `generate()` 内で `resolveAuth(options.apiKey)` が呼ばれる設計（`src/generate.ts:181`）なので、CLI 側では `generate()` のみ呼べば足りる。`resolveAuth()` を CLI から直接呼ぶと二重認証になるため避ける。

---

## 2. ファイル構成

変更対象は 1 ファイルのみ:

| パス | 扱い |
|------|------|
| `src/cli.ts` | 置き換え（T01 のスケルトンを削除して実装） |

参照のみ（編集しない）:

- `src/auth.ts`（`resolveAuth`、`AuthResult`）
- `src/generate.ts`（`generate`、`GenerateOptions`、`GenerateAspect`、`GenerateSize`、`ASPECT_MAP`、`SIZE_PX`、`assertAspect`）
- `package.json`（`"type": "module"`、commander `^12.1.0`）
- `tsconfig.json`（`strict`、`ES2022`、`Node16` moduleResolution）

---

## 3. インポート方針

`package.json` は `"type": "module"` かつ `tsconfig.json` は `"module": "Node16"` / `"moduleResolution": "Node16"` で ESM。

- 外部パッケージ: `import { Command } from 'commander';`
  - commander 12 は ESM named export をサポート（`node_modules/commander/package.json` の `exports` に ESM 定義あり）。
- 内部モジュール: **`.js` 拡張子**で import する（Node16 moduleResolution の規約）。
  ```ts
  import { generate, assertAspect, type GenerateOptions, type GenerateSize } from './generate.js';
  ```
- `resolveAuth` は直接 import しない（前述のとおり `generate()` 内部で呼ばれるため）。

---

## 4. 実装方針

### 4.1 コマンド定義（commander）

```ts
const program = new Command();

program
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version('0.1.0');  // package.json と合わせる（ハードコード可。後で読み込むなら別タスク）
```

### 4.2 オプション定義一覧

| フラグ | 必須 | 既定値 | 型（narrow 先） | バリデーション |
|--------|------|--------|------|----------------|
| `-p, --prompt <text>` | ✓ | なし | `string` | commander の `.requiredOption()` |
| `-o, --output <path>` |  | `output.png` | `string` | 既定値のみ |
| `-a, --aspect <ratio>` |  | `1:1` | `GenerateAspect` | `assertAspect()` でランタイム検証 |
| `-s, --size <size>` |  | `1K` | `GenerateSize` | commander の `.choices(['1K','2K','4K'])` |
| `-m, --model <id>` |  | `gemini-3-pro-image-preview` | `string` | 既定値のみ |
| `--api-key <key>` |  | なし | `string \| undefined` | 任意。未指定時は T02 の env/ADC フォールバック |

実装例:

```ts
program
  .requiredOption('-p, --prompt <text>', 'prompt text (required)')
  .option('-o, --output <path>', 'output file path', 'output.png')
  .option('-a, --aspect <ratio>', 'aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4)', '1:1')
  .addOption(
    new Option('-s, --size <size>', 'image size')
      .choices(['1K', '2K', '4K'])
      .default('1K'),
  )
  .option('-m, --model <id>', 'model id', 'gemini-3-pro-image-preview')
  .option('--api-key <key>', 'Gemini API key (falls back to GEMINI_API_KEY / ADC)');
```

> メモ: `--size` は取り得る値が 3 つなので commander の `choices()` で静的に絞る方が UX が良い（`--help` 出力にも反映される）。`--aspect` は 10 種あるため description に列挙 + ランタイムで `assertAspect()` に委譲する（`assertAspect` はエラー時に「supported: ...」を出すので UX は劣化しない）。

### 4.3 `main()` の流れ

```ts
async function main(): Promise<void> {
  program.parse(process.argv);
  const opts = program.opts<{
    prompt: string;
    output: string;
    aspect: string;     // ← string のまま受けて assertAspect で narrow
    size: GenerateSize; // ← choices() のおかげでコンパイル時も 3 値に絞れる…が実際は string 扱い
    model: string;
    apiKey?: string;
  }>();

  assertAspect(opts.aspect); // ここ以降 opts.aspect は GenerateAspect

  // size は choices() で実行時には絞られているが、型は string。
  // 念のため軽い検証を行い、GenerateSize に narrowing する。
  const size = opts.size as GenerateSize;

  const generateOptions: GenerateOptions = {
    prompt: opts.prompt,
    output: opts.output,
    aspect: opts.aspect,
    size,
    model: opts.model,
    apiKey: opts.apiKey,
  };

  await generate(generateOptions);
}
```

### 4.4 エラーハンドリング

T01 の既存スケルトンを踏襲し、トップレベルの `.catch()` に集約する:

```ts
main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
```

- `main()` 内では try/catch しない（commander 側の `CommanderError`／`assertAspect` の例外／`generate()` 内の例外を全て `.catch()` に委ねる）。
- `resolveAuth()` が ADC 失敗時に自分で `process.exit(1)` する副作用があるが、これは T02 の責務なので CLI からは気にしない（cli.ts から見ると到達しない）。
- commander が自動で出す `--help` / `--version` / `CommanderError`（例: `requiredOption` 欠落）の扱いは既定のまま（commander が stderr に出して exit する）。

---

## 5. 型安全性の担保

### 5.1 `--aspect` の narrowing

- commander は `--aspect` を `string` として返す。
- そのまま `GenerateOptions['aspect']`（`GenerateAspect`）に代入すると型エラー。
- 対策: T03 が公開する `assertAspect(value: string): asserts value is GenerateAspect` を使う。
  - CLI 側の責務は「文字列を受け取り narrow する」だけ。失敗メッセージは `assertAspect` が生成する。

### 5.2 `--size` の narrowing

- commander の `.choices(['1K','2K','4K'])` で **ランタイム**は 3 値に制限できるが、型レベルでは `string` のまま返る（commander の TS 型定義がそうなっている）。
- 対策: 実行時は commander が保証しているので `as GenerateSize` で narrow して可。
- 代替案（採用しない）: 自前の `assertSize()` を書く。安全だが冗長で、`assertAspect` が存在する T03 との対称性はありつつも、そこまでの価値はない。`choices()` で十分。

### 5.3 `--prompt` 必須

- commander の `.requiredOption()` に一任。未指定時は commander が自動でエラーメッセージ + `exitCode=1` で終了。

---

## 6. 既定値の扱い

commander の `.option(flag, desc, defaultValue)` に defaultValue をそのまま渡す。

- `output`: `'output.png'`
- `aspect`: `'1:1'`
- `size`: `'1K'`
- `model`: `'gemini-3-pro-image-preview'`

これによって `program.opts()` の戻り値で常にキーが存在する（`apiKey` のみ任意なので `undefined` の可能性あり）。

---

## 7. 型の流れ（commander → `GenerateOptions`）

| commander 側キー | `GenerateOptions` 側キー | 変換 |
|------------------|--------------------------|------|
| `prompt` | `prompt` | そのまま |
| `output` | `output` | そのまま |
| `aspect` | `aspect` | `assertAspect` で narrow |
| `size` | `size` | `as GenerateSize`（`choices()` が保証） |
| `model` | `model` | そのまま |
| `apiKey` | `apiKey` | そのまま（commander は `--api-key` をキャメルケース `apiKey` にする） |

**注**: commander は `--api-key` のようなハイフン区切りフラグを **キャメルケース** (`apiKey`) でオプションオブジェクトに載せる。`GenerateOptions.apiKey` と揃っているため追加マッピングは不要。

---

## 8. TDD 計画 / 検証手順

このリポジトリにはテストフレームワーク（jest/vitest 等）がインストールされていない（`package.json` の依存を確認済み）。T04 の範囲ではテストを追加せず、下記の手動検証で代替する:

### 8.1 必須検証（受け入れ基準直結）

1. **型チェック**: `npx tsc --noEmit` が 0 exit で通る
2. **`--help` 出力**: コンパイル後の `dist/cli.js`（T05 で配線）ではなく、本 PR 内では次のいずれかで確認:
   - a. `npx tsx src/cli.ts --help`（tsx が無い場合は b）
   - b. `npx tsc && node dist/cli.js --help`（T01 時点で `outDir: dist` 設定済みなので可）
   - いずれも Usage / Options / Defaults が表示され exit 0

### 8.2 スモーク検証（任意・ネットワーク不要）

3. **必須フラグ欠落**: `node dist/cli.js`（`--prompt` なし）→ commander が stderr にエラーを出し exit 1
4. **aspect 不正**: `node dist/cli.js -p x -a 7:11` → `assertAspect` がエラーを投げ、`.catch()` が stderr + exit 1
5. **size 不正**: `node dist/cli.js -p x -s 8K` → commander の `choices()` が拒否し exit 1

### 8.3 実 API 検証（本タスクの範囲外）

- ADC / API キー + プロンプトで実際に画像が保存されることの確認は T05 のビルド配線後に行う。本タスクでは引数解析と `generate()` への受け渡しのみを担保する。

---

## 9. 受け入れ基準チェックリスト

- [ ] `src/cli.ts` に `commander` ベースの CLI を実装
- [ ] `--prompt` / `-p`（必須）
- [ ] `--output` / `-o`（既定: `output.png`）
- [ ] `--aspect` / `-a`（既定: `1:1`）
- [ ] `--size` / `-s`（既定: `1K`）
- [ ] `--model` / `-m`（既定: `gemini-3-pro-image-preview`）
- [ ] `--api-key`（任意）
- [ ] `--help` で使い方が出る
- [ ] 引数を `GenerateOptions` に詰めて `generate()` を呼ぶ
- [ ] 未捕捉例外時は stderr に出して `process.exit(1)`
- [ ] `npx tsc --noEmit` が通る

---

## 10. 懸念点・代替案

### 10.1 `resolveAuth()` を CLI から呼ばない件

受け入れ基準には「T02 の `resolveAuth()` と T03 の `generate()` を呼び出す」とあるが、`generate()` 内で既に `resolveAuth(options.apiKey)` が呼ばれている（`src/generate.ts:181`）。CLI から更に呼ぶと:
- 二重に認証トークンを取得 → 余計な API 呼び出し
- `console.log('[auth] using: ...')` が 2 回出る

よって **CLI からは `generate()` のみを呼ぶ** 設計とする。これは実質的に T02・T03 を両方使っているのと同義（依存グラフ的に `cli → generate → auth`）。

### 10.2 `--version` の扱い

commander の `.version()` に `'0.1.0'` をハードコードする。`package.json` から読み込むには JSON import assertion (`with { type: 'json' }`) か `fs.readFileSync` が必要で、Node16 moduleResolution 環境で余計な分岐を生む。このタスクのスコープ外として、固定文字列で置く。

### 10.3 commander 12 vs 13 の API 差

`package.json` は `commander@^12.1.0`。12 系では `new Command()` + `.option()` + `.parse()` + `.opts()` + `.requiredOption()` + `Option` クラスの `.choices()` がすべて安定 API。追加調査不要。

### 10.4 shebang

T01 の `src/cli.ts` には `#!/usr/bin/env node` が付いている（T01 で確認済み）。置き換え後も shebang を**残す**。実行権限付与と `bin/` 配線は T05 の責務。

### 10.5 `process.exit(1)` でバッファが flush されない問題

`process.stderr.write(...)` は同期的なので、`process.exit(1)` 直前に書いた文字列は失われない（tty でも pipe でも Node は stderr を line-buffered 同期で扱う）。対策不要。

### 10.6 `--help` / `--version` 時の終了コード

commander は自動で exit 0 する。独自の `.catch()` は発火しない。問題なし。

---

## 11. 作業手順サマリ

1. 既存 `src/cli.ts` の中身を破棄
2. 本計画 §4 の通りに実装（shebang → import → Command 定義 → main → catch）
3. `npx tsc --noEmit` 通過確認
4. `npx tsc && node dist/cli.js --help` で Usage 出力を目視確認
5. コミット: `feat: T04 CLI entry point — src/cli.ts`

以上。
