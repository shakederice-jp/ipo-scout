import { getCompanies } from "@/lib/get-companies";
import { todayJst, jpDate, companySlug } from "@/lib/jp-format";

// 2026/10/18新設(GEO対応): 生成AI(ChatGPT・Claude・Perplexityなど)にサイトの概要を伝えるための案内ファイル(/llms.txt)。
// 銘柄の一覧は登録データから自動で作る(銘柄を追加すると、1時間以内に反映される)。
export const revalidate = 3600;

const BASE = "https://ipo.finance-tower.com";

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export async function GET() {
  let rows: Awaited<ReturnType<typeof getCompanies>> = [];
  try { rows = await getCompanies(); } catch { rows = []; }
  const today = todayJst();
  const from = addDays(today, -60);
  const hasAnalysis = (c: any) => !!c.ai_summary || c.ai_score != null;
  const upcoming = rows.filter((r) => r.listing_date && r.listing_date >= today);
  const recent = rows.filter((r) => r.listing_date && r.listing_date < today && r.listing_date >= from).reverse();
  const line = (r: any) =>
    `- ${r.name}${r.ticker ? `（${r.ticker}）` : ""}: 上場日${jpDate(r.listing_date)}${r.listing_date_confirmed ? "" : "（予定）"}${hasAnalysis(r) ? ` ${BASE}/analysis/${companySlug(r)}` : ""}`;

  const body = `# IPO企業情報AI分析レポート（大手町調査室九課）

> 日本の新規上場（IPO）企業の目論見書などをAIが解析し、上場日・仮条件・公募価格・ブックビルディングと申込の日程・ロックアップ解除日・初値の結果を銘柄ごとにまとめた日本語サイトです。運営は大手町調査室九課（ピークアンドバレー合同会社）。米国のIPOを扱う姉妹サイトは別ドメイン（https://ipo-us.finance-tower.com）です。

## 主なページ
- [IPOスケジュール（上場予定の一覧表）](${BASE}/schedule): 上場予定の銘柄を月ごとにまとめた表。上場日・仮条件・公募価格・BB開始日・申込開始日。30分ごとに自動更新。
- [IPOカレンダー（トップ）](${BASE}/): 月間カレンダーと銘柄カード。
- [IPOの初値の結果一覧](${BASE}/results): 上場済み銘柄の公募価格・初値・公募価格比と、公募割れの集計（当サイト登録銘柄）。
- [ロックアップ解除の予定一覧](${BASE}/lockup): 90日・180日の解除日を日付順に掲載。
- [IPOの申込方法](${BASE}/how-to-apply): 口座開設、ブックビルディング、抽選、当選後、売り方までの流れ。
- [IPO用語集](${BASE}/glossary): ブックビルディング、仮条件、ロックアップ、公募割れなどの解説。
- [IPO投資の実践的法則](${BASE}/ipo-guide): 超短期・短期・長期の投資スタイル別の考え方。
- [9軸分析メソッド](${BASE}/methodology): AI分析の方法。
- [マーケットトレンド](${BASE}/trends): IPO・スタートアップの最新動向。

## 銘柄ページ
各銘柄のページは ${BASE}/analysis/{証券コード} の形式です。冒頭に「結論1行と主要数値表」（上場日・仮条件・公募価格・ロックアップ解除日・主幹事）があり、無料で読めます。AIによる詳細な分析は、銘柄により有料です。

### これから上場する銘柄
${upcoming.length ? upcoming.map(line).join("\n") : "- 現在、上場日が決まっている銘柄はありません。"}

### 最近上場した銘柄（直近60日）
${recent.length ? recent.map(line).join("\n") : "- 該当する銘柄はありません。"}

## 情報の出どころと扱い方
- 出典は、目論見書、EDINET（金融庁）の開示書類、取引所や各社の公表情報です。
- 要約・分析はAIによる自動生成で、投資勧誘ではありません。
- 日程と価格は発表のたびに変わります。引用するときは、各ページの更新日を確認してください。
- 上場日は「予定」のものを含みます。確定した日付かどうかは、各ページに明記しています。
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
