// site.business の値を画面に出す形に整える。
// site.ts には schema.org の書式（電話は "+81-3-0000-0000"、営業時間は
// "Mo-Fr 09:00-18:00"）で1つだけ持ち、JSON-LD はそのまま、画面はここを通す。
// 値そのものは変えないので、検索エンジンに伝わる内容と表示は常に一致する。
import type { BusinessConfig } from "../content/site";

/** "+81-3-0000-0000" → "03-0000-0000"。国内表記ならそのまま返す。 */
export const displayTel = (tel: string) => tel.replace(/^\+81[-\s]?/, "0");

/** tel: リンク。空白だけ除く（ハイフンは発信に影響しない）。 */
export const telHref = (tel: string) => `tel:${tel.replace(/\s/g, "")}`;

const DAYS: Record<string, string> = {
  Mo: "月",
  Tu: "火",
  We: "水",
  Th: "木",
  Fr: "金",
  Sa: "土",
  Su: "日",
};

/** "Mo-Fr 09:00-18:00" → "月〜金 9:00〜18:00"。読めない書式はそのまま返す。 */
export const displayHours = (spec: string) => {
  const m = spec.match(/^([A-Za-z,-]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return spec;
  const days = m[1]
    .split(",")
    .map((part) =>
      part
        .split("-")
        .map((d) => DAYS[d] ?? d)
        .join("〜"),
    )
    .join("・");
  return `${days} ${Number(m[2])}:${m[3]}〜${Number(m[4])}:${m[5]}`;
};

/** 〒150-0001 東京都渋谷区1-2-3 の順（国名は出さない）。 */
export const displayAddress = (address: BusinessConfig["address"]) =>
  address
    ? `〒${address.postalCode} ${address.addressRegion ?? ""}${address.addressLocality}${address.streetAddress}`
    : undefined;
