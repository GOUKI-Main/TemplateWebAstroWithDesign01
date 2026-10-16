// scripts/build-fonts.mjs
//
// Fontsource の CSS から、このサイトが実際に使う文字ぶんの woff2 だけを取り出し、
// src/ 配下に自己完結したフォント一式を書き出す。`predev` / `prebuild` から自動で走る。
//
// なぜ node_modules の CSS を直接 @import しないか:
//   - Fontsource の @font-face は woff2 と woff を並べて書く。woff2 は 2016年以降の
//     ブラウザで普遍的に使えるため、woff は誰も落とさないまま dist を太らせるだけ。
//   - 和文は unicode-range で ~120 に分割されている。全部そのまま出すと
//     @font-face が 360 個 = CSS だけで gzip 後 114KB になり、描画を止める。
//     src の文字を数えて、交差する分割だけ残せば 1/5 以下になる。
//   - Vite は CSS の @import を自前で展開してからプラグインに渡すので、
//     読み込み時に url() を削るプラグインでは間に合わない。
//
// なぜ Astro Fonts API を使わないか:
//   - Fonts API はビルド時に fonts.google.com / jsDelivr へ出る。外向き通信を
//     絞った CI ではそこでビルドが落ちる。ここは node_modules で完結する。
//
// 文字の集め方:
//   src/ 配下の全テキストを読む。本文・見出し・frontmatter が全部ここにあるので、
//   事例を1件足せばその漢字ぶんの分割が自動で復活する。取りこぼしても、
//   端末側の代替フォント（ヒラギノ・游明朝など）が受けるので表示は壊れない。
//
// 出力（いずれも .gitignore 済み。依存から毎回再生成される）:
//   src/assets/fonts/*.woff2
//   src/styles/fonts.css

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFonts = join(root, "src/assets/fonts");
const outCss = join(root, "src/styles/fonts.css");

/** 読み込む Fontsource のエントリ。1エントリ = 1ウェイト。 */
const ENTRIES = [
  { pkg: "@fontsource/zen-old-mincho", file: "index.css" }, // 見出し 400
  { pkg: "@fontsource/noto-sans-jp", file: "index.css" }, // 本文 400
  { pkg: "@fontsource/noto-sans-jp", file: "500.css" }, // 本文 500
];

/** 文字を拾うファイル。 */
const SCAN_DIRS = ["src"];
const SCAN_EXT = new Set([
  ".astro",
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".json",
]);

// --- 1. 使っている文字を集める ------------------------------------------------

const used = new Set();
// ASCII と一般的な約物は常に含める（UIの記号・数字・英字）。
for (let c = 0x20; c <= 0x7e; c += 1) used.add(c);
for (const ch of "　、。・「」『』（）〜ー／：；！？…※＝＋−×÷©℃㎡°′″【】〒") {
  used.add(ch.codePointAt(0));
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets" || entry.name === "fonts") continue;
      walk(path);
      continue;
    }
    if (!SCAN_EXT.has(extname(entry.name))) continue;
    for (const ch of readFileSync(path, "utf8")) used.add(ch.codePointAt(0));
  }
}
for (const dir of SCAN_DIRS) walk(join(root, dir));

// --- 2. unicode-range を読み、交差する @font-face だけ残す ---------------------

/** "U+3000-303f,U+ff01" → [[0x3000,0x303f],[0xff01,0xff01]] */
function parseRanges(text) {
  const ranges = [];
  for (const token of text.split(",")) {
    const m = token.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) continue;
    if (m[1].includes("?")) {
      // U+30?? のワイルドカード表記
      ranges.push([
        parseInt(m[1].replace(/\?/g, "0"), 16),
        parseInt(m[1].replace(/\?/g, "f"), 16),
      ]);
      continue;
    }
    const start = parseInt(m[1], 16);
    ranges.push([start, m[2] ? parseInt(m[2], 16) : start]);
  }
  return ranges;
}

const isUsed = (ranges) =>
  ranges.some(([lo, hi]) => {
    for (const cp of used) if (cp >= lo && cp <= hi) return true;
    return false;
  });

// --- 3. 書き出す --------------------------------------------------------------

rmSync(outFonts, { recursive: true, force: true });
mkdirSync(outFonts, { recursive: true });

const chunks = [
  "/* 自動生成 — 直接編集しないこと。scripts/build-fonts.mjs が書き出す。 */\n",
];
let kept = 0;
let dropped = 0;

for (const { pkg, file } of ENTRIES) {
  const cssPath = join(root, "node_modules", pkg, file);
  const pkgDir = dirname(cssPath);
  const css = readFileSync(cssPath, "utf8");
  const out = [];

  for (const block of css.split("@font-face").slice(1)) {
    const face = `@font-face${block.slice(0, block.indexOf("}") + 1)}`;

    // unicode-range が無い分割（latin 単体CSSなど）は無条件で残す。
    const rangeText = face.match(/unicode-range:\s*([^;]+);/i)?.[1];
    if (rangeText && !isUsed(parseRanges(rangeText))) {
      dropped += 1;
      continue;
    }

    // woff の src を落とし（woff2 だけ残す）、woff2 を実体コピーして相対パスに。
    const trimmed = face
      .replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, "")
      .replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_m, name) => {
        copyFileSync(join(pkgDir, "files", name), join(outFonts, name));
        return `url("../assets/fonts/${name}")`;
      });

    out.push(trimmed.trim());
    kept += 1;
  }

  chunks.push(`/* ${pkg}/${file} */\n${out.join("\n")}\n`);
}

writeFileSync(outCss, chunks.join("\n"), "utf8");

const bytes = readdirSync(outFonts).reduce(
  (sum, f) => sum + readFileSync(join(outFonts, f)).byteLength,
  0,
);
console.log(
  `[fonts] ${used.size} chars → ${kept} @font-face (${dropped} 分割を除外), ` +
    `${(bytes / 1024 / 1024).toFixed(1)}MB → src/assets/fonts, src/styles/fonts.css`,
);
