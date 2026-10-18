// 2026/10/18新設(SEO・GEO対応): 分析ページの冒頭に置く「結論1行＋主要数値表」と、
// その内容と一致するFAQを、登録済みの情報から自動で組み立てる。
// ・AIの文章生成には頼らない(数字が食い違わない)。
// ・値が無い項目は行ごと省略する(「未定」「不明」は見せない、という既存方針と同じ。src/lib/ipo-intro-text.ts参照)。
// ・有料部分(分析の本文)には触れない。載せるのは、目論見書や取引所の公表情報にある事実だけ。
import { jpDate, yen, priceRangeText, pctText, todayJst } from "@/lib/jp-format";

export type KeyFactsData = {
  line: string;
  title: string;
  rows: [string, string][];
  faq: { q: string; a: string }[];
  note: string;
};

type Co = {
  name: string;
  ticker?: string | null;
  exchange?: string | null;
  sector?: string | null;
  biz_type?: string | null;
  listing_date?: string | null;
  listing_date_confirmed?: boolean | null;
  bb_start_date?: string | null;
  apply_start_date?: string | null;
  lockup_90_date?: string | null;
  lockup_180_date?: string | null;
  price_range_min?: number | null;
  price_range_max?: number | null;
  ipo_price?: number | null;
  initial_price?: number | null;
  price_change_rate?: number | null;
  structured_data?: any;
};

export function buildKeyFacts(
  c: Co,
  x: { underwriter?: string | null; grade?: string | null; score?: number | null } = {}
): KeyFactsData {
  const today = todayJst();
  const who = `${c.name}${c.ticker ? `（${c.ticker}）` : ""}`;
  const listed = !!c.listing_date && c.listing_date <= today;
  const ld = jpDate(c.listing_date);
  const ldNote = c.listing_date_confirmed ? "" : "（予定）";
  const range = priceRangeText(c.price_range_min, c.price_range_max);
  const pubPrice = yen(c.ipo_price);
  const first = yen(c.initial_price);
  const chg = pctText(c.price_change_rate);
  const lockupPeriod: string = c.structured_data?.ipo_details?.lockup_period ?? "";

  // ── 結論1行 ──
  const venue = c.exchange ? (c.exchange.includes("市場") ? c.exchange : `${c.exchange}市場`) : "国内市場";
  const field = c.sector ? `${c.sector}分野の` : "";
  const s1 = listed
    ? `${who}は、${ld}に${venue}へ上場した${field}企業です。`
    : `${who}は、${venue}への上場を予定する${field}企業です。`;
  const s2 = ld && !listed ? `上場日は${ld}${ldNote}です。` : "";
  let s3 = "";
  if (pubPrice) s3 = `公募価格は${pubPrice}です。`;
  else if (range) s3 = `仮条件は${range}です。`;
  let s4 = "";
  if (listed && first) s4 = `初値は${first}${chg && pubPrice ? `（公募価格比${chg}）` : ""}でした。`;
  const line = s1 + s2 + s3 + s4;

  // ── 主要数値表(値があるものだけ) ──
  const rows: [string, string][] = [];
  if (ld) rows.push(["上場日", `${ld}${ldNote}`]);
  if (c.exchange || c.ticker) rows.push(["市場・証券コード", [c.exchange, c.ticker].filter(Boolean).join("・")]);
  if (c.sector) rows.push(["業種", c.sector]);
  if (range) rows.push(["仮条件", range]);
  if (pubPrice) rows.push(["公募価格", pubPrice]);
  if (first) rows.push(["初値", `${first}${chg && pubPrice ? `（公募価格比${chg}）` : ""}`]);
  if (c.bb_start_date) rows.push(["ブックビルディング開始日", jpDate(c.bb_start_date)]);
  if (c.apply_start_date) rows.push(["申込開始日", jpDate(c.apply_start_date)]);
  const lk: string[] = [];
  if (c.lockup_90_date) lk.push(`90日：${jpDate(c.lockup_90_date)}`);
  if (c.lockup_180_date) lk.push(`180日：${jpDate(c.lockup_180_date)}`);
  if (lk.length) rows.push(["ロックアップ解除日", lk.join(" ／ ")]);
  else if (lockupPeriod) rows.push(["ロックアップ期間", String(lockupPeriod)]);
  if (x.underwriter) rows.push(["主幹事", x.underwriter]);

  // ── FAQ(上の表と同じ内容。画面とFAQPage構造化データの両方に使う) ──
  const faq: { q: string; a: string }[] = [];
  faq.push({
    q: `${who}の上場日はいつですか？`,
    a: ld
      ? (listed ? `${ld}に上場しました。` : `${ld}が上場${c.listing_date_confirmed ? "日" : "予定日"}です。${c.listing_date_confirmed ? "" : "目論見書などをもとにした予定で、日程が変わることがあります。"}`)
      : "上場日はまだ確定していません。判明し次第このページに反映します。",
  });
  if (pubPrice || range) {
    faq.push({
      q: `${who}の公募価格（仮条件）はいくらですか？`,
      a: pubPrice
        ? `公募価格は${pubPrice}です。${range ? `仮条件は${range}でした。` : ""}`
        : `仮条件は${range}です。公募価格は、仮条件をもとにした需要の状況を見て決まります。`,
    });
  }
  if (listed && first) {
    faq.push({
      q: `${who}の初値はいくらでしたか？`,
      a: `初値は${first}でした。${chg && pubPrice ? `公募価格と比べると${chg}です。` : ""}`,
    });
  }
  if (c.bb_start_date || c.apply_start_date) {
    const parts: string[] = [];
    if (c.bb_start_date) parts.push(`ブックビルディングの開始日は${jpDate(c.bb_start_date)}`);
    if (c.apply_start_date) parts.push(`申込開始日は${jpDate(c.apply_start_date)}`);
    faq.push({
      q: `${who}のブックビルディングや申込はいつからですか？`,
      a: `${parts.join("、")}です。証券会社によって受付時間が異なるため、申込前に各社の案内を確認してください。`,
    });
  }
  if (lk.length) {
    faq.push({
      q: `${who}のロックアップ解除日はいつですか？`,
      a: `${lk.join("、")}です。ロックアップは、上場後の一定期間に大株主などが株を売れなくなる取り決めです。`,
    });
  }
  if (x.underwriter) {
    faq.push({ q: `${who}の主幹事はどこですか？`, a: `${x.underwriter}です。` });
  }
  if (x.grade && x.score != null) {
    faq.push({
      q: `${c.name}のAI分析評価は？`,
      a: `目論見書を当調査室の独自AI「ナインクロス」が解析した総合評価は${x.grade}ランク（${x.score}点/100点）です。詳しい根拠は下記の詳細分析・9軸スコアでご確認いただけます。`,
    });
  }

  return {
    line,
    title: `${c.name}のIPO 主要数値`,
    rows,
    faq,
    note: "出典：目論見書や取引所などの公表情報をもとに作成。日程と価格は、発表のたびに更新します。",
  };
}
