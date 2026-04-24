# T02 Implementer Summary

## 作成したファイル一覧

- `src/auth.ts` (新規作成)

既存ファイルの変更はなし。

## `npx tsc --noEmit` の結果

```
$ npx tsc --noEmit
(出力なし、exit 0)
```

エラー 0 件。

## plan.md との差分

plan.md 通り。主要な実装ポイント:

- `resolveAuth(apiKey?: string): Promise<AuthResult>` を export
- 優先順位: `apiKey` 引数 → `GEMINI_API_KEY` → ADC (§2 フロー)
- ADC パスは `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` を検証し、`GoogleAuth` の `getAccessToken()` で token を取得
- `getAccessToken()` の戻り値は `string` と `{ token?: string | null }` の両方に defensive 対応
- `[auth] using: api-key` / `[auth] using: adc` を stdout に出力
- エラーは `[auth] error:` 接頭辞で stderr に書き、`process.exit(1)`
- `failWith(msg): never` で narrowing を効かせ、`accessToken` の definite assignment を成立させる

## 悩んだ点・判断したこと

1. **`failWith` を try 内から呼んだ時の catch への影響**
   - `process.exit(1)` は throw ではなくプロセス終了なので、try 内の `failWith` が catch に飛ぶことはない。そのため catch 側で「空 token エラー」と「GoogleAuth 例外」を区別するためのカスタム例外クラスは不要と判断し、直截な try/catch に留めた。

2. **`accessToken` の definite assignment**
   - `let accessToken: string;` を try の前に宣言し、try 内で代入、catch 内では `failWith`（`never`）で終端、という形にしたところ TypeScript の制御フロー解析が通り、try/catch を抜けた地点で `accessToken` は `string` として narrowing される。`let accessToken: string | undefined` にしないで済んだ。

3. **空文字の扱い**
   - `apiKey && apiKey.length > 0` と `envApiKey && envApiKey.length > 0` の二段チェックで、`''` は truthy 判定で既に弾かれるが、明示のため length 比較も残した。plan.md §5 通り、空文字は未指定扱いで次の優先度へ。

4. **`catch (err)` の型**
   - TypeScript strict mode では `err` は `unknown`。`err instanceof Error` で narrowing して `.message` を取り出し、それ以外は `String(err)` にフォールバックした。

## 作業境界の遵守

- `src/cli.ts`, `package.json`, `tsconfig.json` は未変更
- `@google/generative-ai` の import なし
- テスト追加なし
- commit なし（Conductor に委譲）
