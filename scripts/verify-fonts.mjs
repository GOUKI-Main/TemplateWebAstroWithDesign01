// scripts/verify-fonts.mjs — `postbuild` で自動実行。
//
// build-fonts.mjs は src の文字を数えて、使う unicode-range の分割だけを残す
// （CSS が gzip後 114KB → 17KB になる）。その代償として、拾い漏れた文字は
// その一字だけ代替フォントで出てしまい、文中で書体が変わる。デザインが
// 二書体の上に成り立っている以上これは実害なので、ビルドのたびに検算する。
//
// 落ちたら: その文字がどこから来たかを確かめ、build-fonts.mjs の SCAN_DIRS /
// SCAN_EXT に取り込み元を足す。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (extname(p) === ext) out.push(p);
  }
  return out;
}

// --- CSS 側：覆われている範囲 ---
const ranges = [];
let faces = 0;
for (const css of walk(dist, ".css")) {
  const text = readFileSync(css, "utf8");
  faces += (text.match(/@font-face/g) || []).length;
  for (const m of text.matchAll(/unicode-range:\s*([^;}]+)[;}]/gi)) {
    for (const tok of m[1].split(",")) {
      const r = tok.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
      if (!r) continue;
      if (r[1].includes("?"))
        ranges.push([
          parseInt(r[1].replace(/\?/g, "0"), 16),
          parseInt(r[1].replace(/\?/g, "f"), 16),
        ]);
      else
        ranges.push([
          parseInt(r[1], 16),
          r[2] ? parseInt(r[2], 16) : parseInt(r[1], 16),
        ]);
    }
  }
}
const covered = (cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

// --- HTML 側：実際に出る文字 ---
const missing = new Map();
let scanned = 0;
for (const file of walk(dist, ".html")) {
  let html = readFileSync(file, "utf8");
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  scanned += 1;
  for (const ch of html) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 || /\s/.test(ch)) continue;
    if (covered(cp)) continue;
    if (!missing.has(ch)) missing.set(ch, new Set());
    missing.get(ch).add(file.replace(dist, ""));
  }
}

if (missing.size === 0) {
  console.log(
    `[fonts] OK — HTML ${scanned}枚の全文字が @font-face ${faces}件に収まっています。`,
  );
} else {
  console.error(
    `[fonts] !! unicode-range に無い文字が ${missing.size} 件あります。`,
  );
  console.error(
    "        この文字だけ代替フォントで表示されます（文中で書体が変わる）。",
  );
  for (const [ch, files] of missing)
    console.error(
      `   "${ch}" U+${ch.codePointAt(0).toString(16)}  ${[...files].join(", ")}`,
    );
  console.error(
    "        直し方: scripts/build-fonts.mjs の SCAN_DIRS / SCAN_EXT を確認。",
  );
  process.exit(1);
}
