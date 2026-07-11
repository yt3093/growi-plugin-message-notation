# growi-plugin-message-notation

GROWI のページ本文中に書ける `:::message` 記法を、5 種類の色分けされた callout（注記）ブロックとしてレンダリングする GROWI Script プラグインです。

Markdown レンダラーを拡張するのではなく、GROWI がレンダリング済みの DOM を走査して直接書き換える方式で動作します。

## 記法

```markdown
:::message info
補足情報を書きます。
:::

:::message warn
注意喚起を書きます。
:::

:::message alert
強い警告を書きます。
:::

:::message note
メモを書きます。
:::

:::message tips
ヒントを書きます。
:::
```

型を省略した `:::message` は `info` として扱われます。

```markdown
:::message
型を省略すると info 扱いになります。
:::
```

太字・イタリック・インラインコード・リンクなどのインライン記法に加え、空行を挟むことでリスト・コードブロック・テーブル・引用・見出し・画像などのブロック要素も囲めます。

```markdown
:::message warn

### 注意事項

- 項目1
- 項目2

\`\`\`js
console.log("code block");
\`\`\`

:::
```

## 種別

| 型 | 色 | アイコン |
|---|---|---|
| `info`（省略時） | 緑 | i |
| `warn` | 黄 | ! |
| `alert` | 赤 | × |
| `note` | 青 | ゼムクリップ |
| `tips` | 紫 | チェックマーク付き電球 |

いずれもライトモード・ダークモード（OS 設定連動 / GROWI UI のダークモードトグル）・印刷プレビューに対応しています。

## インストール

GROWI 管理画面の `/admin/plugins` からこのリポジトリの URL を指定してインストールしてください。コード更新後に反映させる場合は、トグルの有効/無効切り替えではなく **削除 → 再インストール** が必要です。

## 開発

```bash
pnpm install
pnpm build   # dist/ にビルド成果物を出力
pnpm dev     # Vite の開発サーバーを起動
```

`dist/` はビルド成果物として git にコミットする必要があります。GROWI はプラグインインストール時に `pnpm install` / `pnpm build` を実行せず、リポジトリの `dist/` を静的配信するだけのためです。

## ファイル構成

```
growi-plugin-message-notation/
├── client-entry.tsx              # activate / deactivate + pluginActivators 登録
├── src/
│   ├── messageNotation.ts        # コア実装（スキャン・変換・SPA 遷移・クリーンアップ）
│   ├── types.ts                  # 共有型定義
│   └── styles/messageNotation.css
├── vite.config.ts
└── dist/                         # ビルド成果物（コミット必須）
```

実装の詳細な設計・既知の注意点は [`CLAUDE.md`](./CLAUDE.md) を参照してください。
