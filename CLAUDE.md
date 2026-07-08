# CLAUDE.md

## プロジェクト概要

- **名前**: `growi-plugin-message-notation`
- **種別**: GROWI Script プラグイン
- **目的**: GROWI ページ本文中の `:::note` 記法（Qiita 互換）を検出し、info / warn / alert の 3 種類の callout ブロックとしてスタイル付きレンダリングする

### 実装済み機能

| 機能 | 説明 |
|---|---|
| info ブロック | `:::note` または `:::note info` で青い補足説明ブロックを表示。左ボーダー＋薄青背景＋ℹ️ アイコン＋「Info」ラベル |
| warn ブロック | `:::note warn` で黄橙色の注意喚起ブロックを表示。左ボーダー＋薄黄背景＋⚠️ アイコン＋「Warning」ラベル |
| alert ブロック | `:::note alert` で赤色の強警告ブロックを表示。左ボーダー＋薄赤背景＋✕ アイコン＋「Alert」ラベル |
| Case 1（空行なし） | GROWI が `:::note info\n内容\n:::` を 1 つの `<p>` に `<br>` 区切りで出力するパターンを検出・変換 |
| Case 2（空行あり） | GROWI が `:::note info` / 中間要素 / `:::` を別々の sibling 要素として出力するパターンを検出・変換 |
| DOM 復元 | `unmount()` 時に変換前の元 DOM を完全復元。`container.replaceWith(originalEl)` または `container.replaceWith(openP, ...content, closeP)` |
| SPA 遷移 | `pushState` / `replaceState` モンキーパッチ + `popstate` + `hashchange` で再スキャン |
| 動的追加対応 | `MutationObserver` で `<p>` 追加を検知して自動初期化 |
| エディタ DOM 除外 | `.CodeMirror` / `.cm-editor` / `[contenteditable="true"]` 配下の要素は対象外 |
| 非実行条件 | 編集モード（`/edit`, `#edit`, `body.editing`, `body.grw-editor-mode`, `body.modal-open`）・管理画面（`/admin`）では実行しない |
| ダークモード | `@media (prefers-color-scheme: dark)` と `html[data-bs-theme="dark"]`（Bootstrap 5.3 GROWI UI トグル）の双方で背景色を強調 |
| 印刷最適化 | `@media print` でボーダー・背景をモノクロ反転し `break-inside: avoid` でページをまたがないようにする |


## アーキテクチャ

このプラグインは Markdown レンダリングの拡張ではなく **DOM 直接操作** を行う。`activate()` 内で既存の `<p>` をスキャンして callout ブロックに変換し、`MutationObserver` で動的追加にも追従する。

**ブランチ運用方針**: 機能ごとに git ブランチを分けて実装・確認し、マージする。

### ファイル構成

```
growi-plugin-message-notation/
├── client-entry.tsx                        # activate / deactivate + pluginActivators 登録
├── src/
│   ├── messageNotation.ts                  # コア実装（スキャン・変換・SPA 遷移・クリーンアップ）
│   ├── types.ts                            # 共有型定義（NoteType / NoteBlock）
│   └── styles/messageNotation.css         # callout スタイル・ダークモード・@media print
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                          # build.manifest: 'manifest.json' を明示
├── pnpm-lock.yaml
└── dist/                                   # ビルド成果物（コミット必須）
    ├── manifest.json
    └── assets/
        ├── client-entry-*.js
        └── client-entry-*.css
```

### 主要な実装ポイント

**`createMessageNotation()`** が公開 API で `{ mount, unmount }` を返す。

- **`scanAndTransform()`**: `document.querySelectorAll('p')` で全 `<p>` をスキャンし、`isEligibleParagraph(p)` をパスしたものの先頭行が `:::note (info|warn|alert)?` に一致すれば変換する。`isHiddenContext()` が true の場合は何もしない。

- **`isEligibleParagraph(p)`**: 以下をすべて満たすもののみ対象
  - `data-gpmt-enhanced` 属性を持つ祖先要素がない（既変換ブロック内の `<p>` を除外）
  - `isInEditorDOM(p)` が false（`.CodeMirror` / `.cm-editor` / `[contenteditable="true"]` 配下でない）

- **`parseNoteType(firstLine)`**: `NOTE_OPEN_RE = /^:::\s*note(?:\s+(info|warn|alert))?\s*$/i` で先頭行を判定し、`NoteType` または `null` を返す。型指定なし・`info` 指定どちらも `'info'` を返す。

- **Case 1（単一 `<p>`）** — `processCase1(p, type)`:
  1. `p.childNodes` を配列化
  2. 最初の `<br>` のインデックス（`firstBrIdx`）を取得。なければ早期 return
  3. 末尾から `textContent.trim() === ':::'` のテキストノードを探す（`lastClosingIdx`）。なければ早期 return
  4. `lastClosingIdx` の直前にある `<br>` のインデックス（`lastBrIdx`）を取得し、コンテンツ終端（`contentEndIdx`）を決定
  5. `firstBrIdx+1` 〜 `contentEndIdx` のノードを `cloneNode(true)` して `.gpmt-note-body` に追加
  6. `p.replaceWith(container)` で置換し、`noteBlocks.set(container, () => container.replaceWith(p))` で復元関数を登録

- **Case 2（複数 sibling 要素）** — `processCase2(openP, type)`:
  1. `openP.parentElement.children` を配列化し `openP` のインデックスを特定
  2. それ以降の sibling を走査して `textContent.trim() === ':::'` の要素（`closeP`）を探す。なければ早期 return
  3. `openP` と `closeP` の間の要素（`contentElements`）を `appendChild` で `.gpmt-note-body` に移動（DOM から切り離される）
  4. `parent.insertBefore(container, openP)` → `openP.remove()` → `closeP.remove()`
  5. 復元関数: `container.replaceWith(openP, ...Array.from(body.children), closeP)` を `noteBlocks` に登録

- **`createNoteContainer(type)`**: `div.gpmt-note.gpmt-note-{type}[data-gpmt-enhanced][role=note]` を生成し、内部に `div.gpmt-note-header`（SVG アイコン + `span.gpmt-note-label`）と `div.gpmt-note-body` を持つ `{ container, body }` を返す。`innerHTML` は使わない。

- **`noteBlocks`**: `Map<HTMLDivElement, () => void>` でコンテナ → 復元関数を管理。WeakMap ではなく通常 Map を使用（`cleanupAll()` で全件反復するため）。

- **`cleanupAll()`**: `noteBlocks` の全 restore 関数を呼び出す。各 restore 関数は自身で `noteBlocks.delete(container)` を行う。

- **SPA 遷移検知**: `pushState` / `replaceState` にカスタムイベント `'gpmt-navigate'` をモンキーパッチ。`popstate` / `hashchange` も購読し、いずれも 2 段 `requestAnimationFrame` + `scheduleScan()` で DOM が安定してから `scanAndTransform()` を実行。

- **MutationObserver**: `document.body` を `childList: true, subtree: true, attributes: true, attributeFilter: ['class']` で監視。追加ノードが `gpmt-note` / `gpmt-note-header` / `gpmt-note-body` / `gpmt-note-label` クラスを持つ場合はスキップして自己追加による無限ループを防ぐ。`<p>` またはそれを含む要素の追加で `scheduleScan()`。`body.class` 変化時（編集モード遷移）は `isHiddenContext()` を判定し、true なら `cleanupAll()`、false なら `scheduleScan()`。

- **`isHiddenContext()`**: `/admin` / `/admin/*` パス、`#edit` / `/edit` サフィックス、`body.editing` / `body.grw-editor-mode` / `body.modal-open` クラスのいずれかで true を返す。

- **`isInEditorDOM(el)`**: `el.closest('.CodeMirror, .cm-editor, [contenteditable="true"]')` が null でなければ true。

### GROWI の DOM 出力仕様（重要）

GROWI は `:::note` 記法をネイティブサポートしていないため、Markdown レンダラーが以下 2 パターンで出力する。

**Case 1（空行なし・ソフト改行）**:
```html
<p>:::note info<br>
テスト内容です<br>
:::</p>
```

**Case 2（空行あり・ブロック分離）**:
```html
<p>:::note info</p>
<p>段落 1</p>
<ul>...</ul>
<p>:::</p>
```

Case 1 では `<p>` の子ノードにテキストノード・`<br>`・インライン要素（`<strong>` / `<em>` / `<code>` / `<a>` など）が混在する。Case 2 ではブロックレベル要素（`<p>` / `<pre>` / `<ul>` など）が sibling として並ぶ。

### 命名規約

| 対象 | 値 |
|---|---|
| プレフィックス | `gpmt-*` |
| enhanced マーカー属性 | `data-gpmt-enhanced` |
| カスタムイベント名 | `gpmt-navigate` |
| CSS 変数 | `--gpmt-*` |
| note ブロッククラス | `gpmt-note` |
| 種別クラス | `gpmt-note-info` / `gpmt-note-warn` / `gpmt-note-alert` |
| ヘッダークラス | `gpmt-note-header` |
| ラベルクラス | `gpmt-note-label` |
| ボディクラス | `gpmt-note-body` |
| pluginActivators キー | `growi-plugin-message-notation` |


## ハマりどころ（必読）

### 1. `dist/` を git にコミットすること

GROWI はプラグインインストール時に **`pnpm install` も `pnpm build` も実行しない**。GitHub の archive zip を展開し、`dist/` 配下を Express で静的配信するだけ。

→ `.gitignore` に `dist/` を含めると GROWI 側で JS が読み込まれない。`dist/` は必ずコミットすること。

### 2. Vite のマニフェスト出力先

GROWI が読みに行く manifest のパスは以下の順で fallback:

1. `dist/.vite/manifest.json` (Vite 5 デフォルト)
2. `dist/manifest.json` (Vite 4 互換 / 明示設定時)

Vite 5+ では `vite.config.ts` で `build.manifest: 'manifest.json'` を明示してプロジェクト直下風のパスに出力するのが無難。

### 3. 再インストールが必要

コード更新を push しても、GROWI 管理画面で「有効/無効トグル」だけでは zip が取り直されない。確実に反映するには `/admin/plugins` で **削除 → 再インストール**。

### 4. Case 1 のコンテンツ抽出で `cloneNode(true)` を使う理由

Case 1 では `processCase1` 内でコンテンツノードを `cloneNode(true)` で body に追加している。`p.replaceWith(container)` を呼ぶと `p` は DOM から切り離されるが、`p` への参照は restore 関数のクロージャで保持されているため、`unmount()` 時に `container.replaceWith(p)` で元に戻せる。

もし `cloneNode` せず直接 `appendChild` してしまうと、`p` の子ノードが `body` に移動してしまい restore 時の `p` が空になってしまう。

### 5. Case 2 の復元で `Array.from(body.children)` が必要

restore 関数内で `container.replaceWith(openP, ...Array.from(body.children), closeP)` とする際、`body.children` は NodeList（ライブコレクション）のため、スプレッド展開前に `Array.from()` で静的配列に変換しないと、`replaceWith` による DOM 移動中にコレクションが変化して一部の要素が取りこぼされる。

### 6. MutationObserver の自己ループ防止

`container` の `appendChild` 等が発火させる `childList` mutation で、プラグイン自身が生成した `.gpmt-note` / `.gpmt-note-body` 等が追加ノードとして検出される。`isPluginNode(el)` でこれらをスキップすることで無限スキャンを防ぐ。

### 7. `hashchange` 購読が必須

Edit → View 遷移で `location.hash` のみが変わる場合、`pushState` のモンキーパッチは発火しない。`hashchange` イベントの購読が必須。

### 8. `:::note` 単体（型指定なし）は `info` として扱う

`NOTE_OPEN_RE` のキャプチャグループは optional（`(?:\s+(info|warn|alert))?`）のため、`:::note` のみの場合は `match[1]` が `undefined` になる。`parseNoteType` 内で `?? 'info'` としてデフォルトを `info` に統一している。

### 9. コンテンツエリアの限定は現状未実装

`scanAndTransform` は `document.querySelectorAll('p')` で全 DOM を対象にしている。GROWI のナビゲーションやサイドバーに `:::note` で始まる `<p>` が偶然存在した場合も変換されてしまう可能性がある。実際に問題が発生した場合は、GROWI のコンテンツエリアセレクター（`.wiki` 等）でスコープを絞ること。

### 10. `:::note` がネストしたブロック内に出現する場合

Case 2 で `processCase2` は `openP.parentElement.children` を sibling 走査する。もし `:::note` が `<blockquote>` 等のブロック要素内にある場合、`closeP` の検索はその要素内に限定されるため、ブロックをまたいだ誤マッチは発生しない。ただし、`:::note` の開始と終了が異なる親要素に属する不正記法は変換されず無視される（仕様）。


## デプロイ手順

```bash
pnpm build              # dist/ を更新
git add src/ dist/ ...  # 変更ファイルを staging
git commit -m "..."
git push
```

GROWI 管理画面 `/admin/plugins` で **削除 → 再インストール**。

## 動作確認チェックリスト

1. `pnpm build` が成功し `dist/manifest.json` が出力される
2. GROWI で削除 → 再インストール後、DevTools Network で `client-entry-*.js` が 200 で取得される
3. `:::note` ブロック（空行なし）を含むページを開くと callout ブロックが表示される
4. `:::note info` / `:::note warn` / `:::note alert` でそれぞれ青・黄橙・赤の配色になる
5. `:::note`（型指定なし）は `info` と同じ表示になる
6. 空行ありの `:::note` ブロック（Case 2）も正しく変換される
7. ブロック内の太字・イタリック・インラインコード・リンクなどインライン要素が正しく表示される
8. Case 2 でブロック内にリスト（`<ul>` / `<ol>`）・コードブロック（`<pre>`）が含まれても正しく変換される
9. 編集モードへ遷移すると callout が元の `:::note` テキスト表示（`<p>`）に戻る
10. 編集モードから戻ると callout が再生成される
11. SPA 遷移後の新ページの `:::note` ブロックも自動変換される
12. `/admin` 配下では変換が行われない
13. `unmount()` 後、元の `<p>:::note info<br>...<br>:::</p>` または `<p>:::note info</p>...<p>:::</p>` の DOM が完全に復元される
14. `unmount()` 後に `div.gpmt-note` が 1 つも残っていない
15. `.CodeMirror` / `.cm-editor` 配下の `:::note` テキストには変換が行われない（GROWI エディタとの競合なし）
16. ダークモード切替（OS / GROWI UI トグル）でブロック背景色が適切に変わる
17. 印刷プレビューで callout がモノクロ表示されページをまたがない
18. 同一ページに複数の `:::note` ブロックが存在しても、それぞれ独立して正しく変換・復元される
19. `:::note` の開始行と終了 `:::` の間に他の `:::note` ブロックを入れ子にした場合、最初の `:::` が閉じマーカーと見なされ（ネスト非サポート）、残りは別ブロックとして処理される（または変換されない）

## 会話ガイドライン

- 常に日本語で会話する

## 作業ルール

- **git 操作は行わない**。`git add` / `git commit` / `git push` / `git restore` / `git checkout` などの git コマンドは一切実行しないこと。コミットやプッシュが必要な場面ではユーザーに依頼し、こちらでは行わない。
  - 変更内容のサマリだけ提示し、コミットメッセージ案を出す程度に留める。
  - 例外として `git status` / `git log` / `git diff` などの**読み取り専用**コマンドは状況把握のために実行してよい。
- **pnpm 操作は Claude が行う**。`pnpm install` / `pnpm approve-builds` / `pnpm build` / `pnpm audit` はこちらで実行する。

- **セキュリティチェックを必ず行う**。コード変更を完了したら、コミット候補としてユーザーに提示する前に以下を確認すること。問題が見つかった場合はその場で修正するか、ユーザーに明示的に報告する。
  - **機密情報の混入**: API キー / トークン / パスワード / 秘密鍵 / `.env` 系ファイルの値が、ソースコード・コメント・`dist/` 配下のビルド成果物に含まれていないか。
  - **XSS / 危険な HTML 挿入**: ユーザー入力を `dangerouslySetInnerHTML`・`innerHTML` で未エスケープで埋め込んでいないか。DOM 操作は `createElement` + `setAttribute` のみを使うこと。
  - **外部通信**: 外部 URL に対する `fetch` / `XMLHttpRequest` を新規追加していないか。
  - **依存パッケージの脆弱性**: 新規追加した npm パッケージは `pnpm audit` を実行して確認する。
  - **CSP / 外部リソース**: `<script>` / `<link>` を動的挿入して外部ドメインから読み込む実装になっていないか。自己完結なバンドルにすること。
