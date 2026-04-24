# T01: プロジェクト骨格のセットアップ — 実装計画書

Run: `task-001-1776967353`
作業 worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-001-1776967353`

---

## 1. 概要

T01 はビルド・型チェックが通る「空プロジェクト」を整える。後続の T02〜T05 がここに src/auth.ts, src/generate.ts, bin/nanobanana-adc を追加していく土台となる。

### 新規作成するファイル

| パス | 役割 |
|------|------|
| `package.json` | npm メタデータ・依存・scripts・bin placeholder |
| `tsconfig.json` | TypeScript strict + ES2022 + Node16 設定 |
| `src/cli.ts` | shebang 付き空エントリーポイント |

### 変更するファイル

- `.gitignore` — 既存内容で T01 要件は満たしているため **変更しない**（詳細は §2.3）。

### 作成しないファイル

- `src/generate.ts`, `src/auth.ts` — T02/T03 の責務。骨格には不要。
- `bin/nanobanana-adc` — T05 の責務。T01 では `package.json` の `bin` も placeholder のみ。
- `package-lock.json` — 検証手順 §3 で `npm install` を走らせれば自動生成される。コミット方針はリポジトリの既定に従う（Planner 判断対象外）。

---

## 2. 各ファイルの具体的な内容

### 2.1 `package.json`

```json
{
  "name": "nanobanana-adc",
  "version": "0.1.0",
  "description": "Gemini 3 Pro Image CLI with Application Default Credentials (ADC) support",
  "private": false,
  "type": "module",
  "bin": {
    "nanobanana-adc": "./bin/nanobanana-adc"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "commander": "^12.1.0",
    "google-auth-library": "^9.14.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

#### フィールド解説

- **`name`**: `nanobanana-adc`（seed.md・tasks.md T01 既定）
- **`version`**: `0.1.0` — 未公開の初期版。T08 で publish する際に必要なら昇格する。
- **`private`**: `false` — T08 で `npm publish` するため。ただし T08 まで publish しないので実害なし。もし誤公開防止を強めたければ T07 完了まで `true` に保つ選択もあり（判断ポイント §4-C）。
- **`type`**: `"module"` — ESM を採用。判断根拠は §4-A。
- **`bin`**: `./bin/nanobanana-adc` を placeholder として宣言。T01 時点でファイル自体は作らないので `npm install` はローカルで `bin` を解決しようとしない（npm は直接 install 時のみ `bin` をリンクする。ローカル開発の `npm install` では欠落しても警告レベル）。もし `npm install` がエラーを出すようなら T01 では **`bin` フィールドごと書かず** T05 で初めて追加する運用に切り替える（代替案。§4-D）。
- **`scripts.build`**: `tsc` — `dist/` 出力。T05 で活用。
- **`scripts.typecheck`**: `tsc --noEmit` — T01 受け入れ基準「`npx tsc --noEmit` が成功」を `npm run typecheck` でも満たせるようにする。
- **`dependencies`**: tasks.md T01 指定の 3 パッケージのみ。バージョンは執筆時点の最新安定版のキャレット範囲。
- **`devDependencies`**: tasks.md T01 指定の 2 パッケージのみ。
- **`engines.node`**: `>=18` — `@google/generative-ai` と `google-auth-library` の要件、および ESM + Node16 解決の安定動作のため。

### 2.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### オプション解説

- **`target: ES2022`**: tasks.md 指定。
- **`module: Node16` / `moduleResolution: Node16`**: tasks.md 指定。`"type": "module"` と組み合わせて ESM として解決される。相対 import には **明示的な `.js` 拡張子**が必要になる点に注意（例: `import { foo } from "./auth.js"`）。T02 以降の実装で徹底する必要がある。
- **`strict: true`**: tasks.md 指定。
- **`esModuleInterop: true`**: CJS 依存（`google-auth-library` 等）を default import で扱うため。
- **`skipLibCheck: true`**: 依存パッケージの型エラーで落ちないようにする（CLI プロジェクトで一般的）。
- **`forceConsistentCasingInFileNames: true`**: macOS / Linux 間の事故防止。
- **`resolveJsonModule: true`**: 将来 `package.json` を import する余地を残す。
- **`outDir: dist` / `rootDir: src`**: T05 の `npm run build` で `dist/cli.js` が生成される前提を整える。
- **`declaration: false` / `sourceMap: false`**: CLI ツールなので型定義・ソースマップは不要（T08 の `npm pack` で出力を絞る意図も兼ねる）。必要になったら後続タスクで有効化。
- **`include` / `exclude`**: `src/**/*.ts` のみをコンパイル対象とし、`dist` を除外。

### 2.3 `.gitignore`

worktree 直下の既存 `.gitignore` は以下のとおり:

```
node_modules/
dist/
*.js
!bin/nanobanana-adc
.env
.envrc
.config/
```

T01 受け入れ基準「node_modules, dist, ビルド成果物」は **既に満たされている** ため**変更しない**。`*.js` と `!bin/nanobanana-adc` の組み合わせにより、T05 で作成する `bin/nanobanana-adc`（拡張子なし shebang スクリプト）は追跡対象、`dist/*.js` と誤って `src/*.js` を作ってしまった場合は無視、という意図が一貫して保たれる。

### 2.4 `src/cli.ts`

```ts
#!/usr/bin/env node

async function main(): Promise<void> {
  // Entry point for nanobanana-adc CLI.
  // Real argument parsing and dispatch will be implemented in T04.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

#### 記述方針

- **shebang**: `#!/usr/bin/env node`。`src/cli.ts` 自体は直接実行されないが、T05 で `dist/cli.js` に継承させるためここに置く（`tsc` は 1 行目の shebang をそのまま出力に残す）。
- **`main(): Promise<void>`**: 最小のエントリ関数スケルトン。T04 で `commander` による引数解析とディスパッチを差し込む。
- **`main().catch(...)`**: 非ゼロ終了ステータスの雛形。T02 の認証失敗時 `exit 1` と整合する方針を先行実装しておく。
- **`import` 文は書かない**: 何も import しない空ファイルなら ESM の `.js` 拡張子問題に触れずに済む。受け入れ基準「空エントリーポイント」を素直に満たす。

---

## 3. 検証手順

worktree のルート（`/Users/yamamoto/git/nanobanana-adc/.worktrees/task-001-1776967353`）で以下を順に実行する。

```bash
# 1. 依存の解決
npm install

# 2. 型チェック（T01 受け入れ基準）
npx tsc --noEmit

# 3. （参考）scripts 経由でも同じ結果になること
npm run typecheck
```

### 期待される結果

- `npm install` が exit 0 で終了し、`node_modules/` と `package-lock.json` が生成される。
- `npx tsc --noEmit` が exit 0。出力なし（エラー・警告ゼロ）。
- `src/cli.ts` は import を持たないため、型チェックはほぼ tsconfig の整合性のみを検査する形になる。

### トラブルが出たときの切り分け

- `npm install` が `bin` 先のファイル欠如で失敗する場合 → §4-D の代替案（`bin` フィールドを T05 まで宣言しない）へ切り替える。
- `tsc` が `Cannot find type definition file for 'node'` を出す場合 → `@types/node` が devDependencies に入っていることと、`npm install` が成功していることを再確認。
- `tsc` が `.ts` ファイルを 1 つも見つけられない場合 → `include` が `src/**/*.ts` になっていること、`src/cli.ts` が実在することを確認。

---

## 4. 判断ポイントと推奨値

### 4-A. ES Module vs CommonJS（`package.json` の `"type"`）

| 選択肢 | メリット | デメリット |
|--------|----------|------------|
| **`"type": "module"` (ESM)** ★推奨 | 最新エコシステムに整合／`@google/generative-ai` が ESM 前提／top-level await 等が使える | 相対 import に `.js` 拡張子必須／一部 CJS 依存は default import が必要 |
| `"type": "commonjs"` | 歴史的に安定／拡張子問題なし | 新規プロジェクトで選ぶ動機が薄い／CLI で top-level await が使えない |

**推奨: `"type": "module"`**。tasks.md が Node16 moduleResolution を指定している時点で ESM 志向であり、配布が `bin` 経由の実行ファイルなので拡張子ルールは自プロジェクト内で徹底すれば済む。

### 4-B. `module` / `moduleResolution` は Node16 か NodeNext か

| 選択肢 | 差分 | 推奨 |
|--------|------|------|
| **`Node16`** ★推奨 | 挙動が固定。Node 16 がサポートする範囲の ESM/CJS 解決。 | tasks.md 指定どおり `Node16` を採用。 |
| `NodeNext` | 将来 Node の仕様追随で自動的に変わる。挙動がバージョン間で変化する余地あり。 | 採用しない。再現性重視。 |

**推奨: `Node16`**（tasks.md の指示に従う）。

### 4-C. `private` フィールド

- **推奨: `false`**（T08 の publish を見越す）。誤公開リスクは `npm publish` を手動実行する運用で十分防げる。
- 代替: T07 まで `true` にして T08 で外す。慎重運用を重視するなら採用可。

### 4-D. `bin` フィールドの先行宣言

- **推奨: T01 で placeholder として宣言する**（§2.1 のとおり）。将来の差分を小さくでき、T05 で `bin` ファイルを追加すればそのまま動く。
- **代替案**: `npm install` がローカルで `bin` 先のファイル欠如をエラーにするようなら、T01 では `bin` フィールド自体を書かず T05 で追加する。Planner の事前調査では npm は通常ローカル install ではシンボリックリンクを作らないため問題にならない想定だが、検証で exit 0 にならなかった場合の逃げ道として記録しておく。

### 4-E. 依存パッケージのバージョン範囲

- **推奨: キャレット (`^`) 指定**。tasks.md に具体バージョンの指定がなく、後続タスクでマイナー更新に追随したほうが楽。
- 具体的なバージョン値は §2.1 の値を初期値とするが、`npm install` が解決した実際のバージョン（`package-lock.json`）と package.json を突き合わせて、必要なら Implementer 側で更新してよい。

### 4-F. `src/cli.ts` の中身の厚み

- **推奨: §2.4 の最小スケルトン**。import なし、`main()` + `catch` のみ。
- 代替（より薄い）: `console.log("nanobanana-adc")` のみ。→ T04 で全面書き換えになるので意味が薄い。
- 代替（より厚い）: `commander` を使ったヘルプ雛形まで書く。→ T04 の責務。T01 で先食いしない。

---

## 5. 受け入れ基準との対応表

| tasks.md T01 受け入れ基準 | この計画での対応 |
|---------------------------|------------------|
| `package.json` 作成 | §2.1 |
| `tsconfig.json` 作成 | §2.2 |
| `.gitignore` 作成 | §2.3（既存で充足、変更なし） |
| `src/cli.ts` 空エントリーポイント作成 | §2.4 |
| `npm install` が成功する | §3 step 1 |
| `npx tsc --noEmit` が成功する | §3 step 2 |

---

## 6. 作業境界（Planner → Implementer 引き継ぎ事項）

- 本計画書は **コード変更を伴わない**。ファイル作成は Implementer が行う。
- 作業は worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-001-1776967353` で行う。main ブランチを直接触らない。
- 相対 import で `.js` 拡張子が必要になる件（§2.2）は、後続 T02〜T04 の実装時にも注意喚起として引き継ぐ。
- 依存バージョンは §2.1 の値を初期値とし、`npm install` で実際に解決されたバージョンをもって最終値とする。`package-lock.json` をコミットするかはリポジトリ運用判断（本計画のスコープ外）。
