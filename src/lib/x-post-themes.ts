import { generateWithGemini } from "./gemini";
import { createClient } from "@supabase/supabase-js";

const STYLE_GUIDE = `
# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
- URLは含めない
- 見本のイメージ:「6273 SMC [決算]」→「📣半導体需要回復で大幅増収増益」→「📝売上高2,709億円(+35.4%)」のような形式
`;

export interface ThemedPostResult {
  content: string;
  sourceLinks: { title: string; url: string; source: string }[];
}

const supabaseForThemes = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// テーマ: IPOカレンダー(自社DB由来)
export async function generateIpoCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(today.getDate() + 14);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, ticker, name, exchange, sector, biz_type, listing_date, price_range_min, price_range_max")
    .gte("listing_date", today.toISOString().split("T")[0])
    .lte("listing_date", twoWeeksLater.toISOString().split("T")[0])
    .order("listing_date", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("IPOカレンダー取得失敗またはデータなし:", error);
    return null;
  }

  const listBlock = data
    .map((c) => {
      const price =
        c.price_range_min && c.price_range_max
          ? `想定価格帯${c.price_range_min}〜${c.price_range_max}円`
          : "価格未定";
      return `- ${c.name}(${c.ticker || "コード未定"}・${c.exchange || ""}・${c.sector || c.biz_type || "業種不明"}) 上場日:${c.listing_date} ${price}`;
    })
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今後2週間以内に上場予定のIPO銘柄一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 今後のIPOカレンダー
${listBlock}

${STYLE_GUIDE}
- 投稿の最後に「プロフィール欄のリンクから」等の一文をさりげなく加えてください

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = data.map((c: any) => ({
    title: c.name,
    url: `https://ipo.finance-tower.com/analysis/${c.id}`,
    source: "自社DB",
  }));
  return { content, sourceLinks };
}

// テーマ: 週内の重要経済指標カレンダー(自社DB由来)
export async function generateEconomicCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(today.getDate() + 7);

  const { data, error } = await supabaseForThemes
    .from("economic_events")
    .select("event_date, event_type, label")
    .gte("event_date", today.toISOString().split("T")[0])
    .lte("event_date", oneWeekLater.toISOString().split("T")[0])
    .order("event_date", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("経済指標カレンダー取得失敗またはデータなし:", error);
    return null;
  }

  const listBlock = data
    .map((e) => `- ${e.event_date} ${e.event_type}:${e.label}`)
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今週(7日以内)に予定されている重要経済指標・イベントの一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 今週の経済指標カレンダー
${listBlock}

# 記載のポイント
- 各イベントが株式相場にどう影響しうるか、一般的な知識をもとに一言添えてください(記載のない詳細な数値予想などは書かないこと)
- 個人投資家が「今週、何に注目すればいいか」がひと目で分かるようにしてください

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks: { title: string; url: string; source: string }[] = [];
  return { content, sourceLinks };
}

// テーマ: 直近承認銘柄のスコア傾向分析(自社DB由来)
// 直近2週間にAI分析が完了したIPO銘柄のスコアを集計する。
// このアプリ独自の分析データベースがないと書けない記事にするのが狙い。
export async function generateScoreTrendPost(): Promise<ThemedPostResult | null> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, sector, listing_date, created_at, analysis_summary")
    .gte("created_at", twoWeeksAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("スコア傾向分析: 取得失敗", error);
    return null;
  }

  const scored = data
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      sector: c.sector || "業種不明",
      listingDate: c.listing_date,
      totalScore: c.analysis_summary?.total_score,
      grade: c.analysis_summary?.grade,
    }))
    .filter((c) => typeof c.totalScore === "number");

  if (scored.length === 0) return null;

  const avg = Math.round(scored.reduce((s, c) => s + c.totalScore, 0) / scored.length);
  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore);
  const top3 = sorted.slice(0, 3);

  const sectorCount: Record<string, number> = {};
  scored.forEach((c) => {
    sectorCount[c.sector] = (sectorCount[c.sector] ?? 0) + 1;
  });
  const topSectorEntry = Object.entries(sectorCount).sort((a, b) => b[1] - a[1])[0];

  const listBlock = scored
    .map((c) => `- ${c.name}(${c.sector}) ${c.totalScore}点・${c.grade}グレード・上場日:${c.listingDate || "未定"}`)
    .join("\n");

  const prompt = `
あなたは日本のIPO投資アナリストです。以下は直近2週間にAI分析が完了したIPO銘柄と、そのスコア(100点満点)・グレード(A〜E)の一覧です。この一覧をもとに、個人投資家向けのX(旧Twitter)投稿を1本作成してください。

# 直近のIPO銘柄スコア一覧(${scored.length}銘柄、平均${avg}点)
${listBlock}

# 記載のポイント
- 全体の平均スコア・スコア分布の傾向に触れること
- 特に評価が高い銘柄を具体的に挙げ、理由(業種や特徴)を一言添えること(一覧にない情報を憶測で追加しないこと)
- 業種別の傾向があれば触れること(例:${topSectorEntry ? topSectorEntry[0] : "特定業種"}が${topSectorEntry ? topSectorEntry[1] : ""}件で最多、など)
- 最後に、個人投資家として次に何を確認すべきか一言添えること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = top3.map((c) => ({
    title: c.name,
    url: `https://ipo.finance-tower.com/analysis/${c.id}`,
    source: "自社分析",
  }));

  return { content, sourceLinks };
}

// テーマ: ロックアップ解除カレンダー(自社DB由来)
// 上場前からの株主(VC・大株主など)が株式を売却できるようになる「ロックアップ解除日」が
// 今後30日以内に来る銘柄を一覧化する。個人投資家が自分では追いにくい情報。
export async function generateLockupCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30Days = new Date();
  in30Days.setDate(today.getDate() + 30);
  const in30Str = in30Days.toISOString().slice(0, 10);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, ticker, exchange, sector, listing_date, lockup_90_date, lockup_180_date, structured_data");

  if (error || !data) {
    console.error("ロックアップ解除カレンダー: 取得失敗", error);
    return null;
  }

  type LockupEvent = {
    id: string;
    name: string;
    sector: string;
    date: string;
    label: string;
    targets: string;
    floatRatio: string;
  };
  const events: LockupEvent[] = [];
  data.forEach((c: any) => {
    const targets = c.structured_data?.ipo_details?.lockup_targets || "不明";
    const floatRatio = c.structured_data?.ipo_details?.float_ratio || "不明";
    if (c.lockup_90_date && c.lockup_90_date >= todayStr && c.lockup_90_date <= in30Str) {
      events.push({ id: c.id, name: c.name, sector: c.sector || "業種不明", date: c.lockup_90_date, label: "90日ロックアップ", targets, floatRatio });
    }
    if (c.lockup_180_date && c.lockup_180_date >= todayStr && c.lockup_180_date <= in30Str) {
      events.push({ id: c.id, name: c.name, sector: c.sector || "業種不明", date: c.lockup_180_date, label: "180日ロックアップ", targets, floatRatio });
    }
  });

  if (events.length === 0) return null;
  events.sort((a, b) => a.date.localeCompare(b.date));

  const listBlock = events
    .map((e) => `- ${e.date} ${e.name}(${e.sector}) ${e.label}解除 対象:${e.targets} 流通比率:${e.floatRatio}`)
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今後30日以内にロックアップ解除(上場前からの株主が株式を売却できるようになる日)を迎えるIPO銘柄の一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 直近のロックアップ解除カレンダー
${listBlock}

# 記載のポイント
- ロックアップ解除が個人投資家にとってなぜ重要か(需給悪化=売り圧力増加の可能性)を簡潔に説明すること
- 対象株主(VC・大株主など)や流通比率の情報がある銘柄は、売り圧力の大きさの目安として触れること
- 一覧にない情報を憶測で追加しないこと
- 特に注意すべき銘柄を1〜2つ挙げること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = events.map((e) => ({
    title: e.name,
    url: `https://ipo.finance-tower.com/analysis/${e.id}`,
    source: "自社分析",
  }));

  return { content, sourceLinks };
}

const EDINET_KEY_FOR_THEMES = process.env.EDINET_API_KEY!;

async function fetchEdinetDocumentsForThemes(date: string) {
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${EDINET_KEY_FOR_THEMES}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

export interface ShareholderMovementResult {
  externalId: string;
  companyName: string;
  sector: string;
  result: ThemedPostResult;
}

// テーマ: 大株主・VC/PEの異動ウォッチ(EDINET・大量保有報告書ベース、docTypeCode=350)
// 以前は対象銘柄コードが「不明」のまま記事化されることがあったため、
// 証券コード(secCode)が特定できる提出だけを対象にする。
// また、同じ提出書類(docID)を重複して記事化しないよう、事前にDBへ問い合わせて除外する。
// 1件の提出につき1本の記事を作り(複数まとめて1本にしない)、最大3件/回まで生成する。
export async function generateShareholderMovementPosts(): Promise<ShareholderMovementResult[]> {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dates = [today.toISOString().slice(0, 10), yesterday.toISOString().slice(0, 10)];

  const docsByDate = await Promise.all(dates.map((date) => fetchEdinetDocumentsForThemes(date)));
  const allReports: any[] = docsByDate.flatMap((docs) =>
    docs.filter((d: any) => d.docTypeCode === "350" && d.secCode)
  );

  if (allReports.length === 0) return [];

  const candidateIds = allReports.map((d) => `edinet-${d.docID}`).filter(Boolean);
  const { data: existing } = await supabaseForThemes
    .from("market_trends")
    .select("external_id")
    .in("external_id", candidateIds);
  const existingIds = new Set((existing ?? []).map((r: any) => r.external_id));

  const fresh = allReports.filter((d) => !existingIds.has(`edinet-${d.docID}`));
  if (fresh.length === 0) return [];

  // 自社で追っているIPO銘柄と証券コードで照合(EDINETのsecCodeは5桁、うち先頭4桁が証券コード)
  const { data: tracked } = await supabaseForThemes
    .from("ipo_companies")
    .select("name, ticker, sector");
  const trackedByTicker = new Map(
    (tracked ?? [])
      .filter((c: any) => c.ticker)
      .map((c: any) => [String(c.ticker).slice(0, 4), c])
  );

  const enriched = fresh.map((d) => {
    const secCode4 = String(d.secCode).slice(0, 4);
    return { ...d, matchedCompany: trackedByTicker.get(secCode4) ?? null };
  });

  // 自社追跡銘柄との一致を優先し、最大3件まで
  enriched.sort((a, b) => (b.matchedCompany ? 1 : 0) - (a.matchedCompany ? 1 : 0));
  const sample = enriched.slice(0, 3);

  const results: ShareholderMovementResult[] = [];
  await Promise.all(
    sample.map(async (d: any) => {
      const companyName = d.matchedCompany?.name || d.filerName || `証券コード${d.secCode}`;
      const isTracked = !!d.matchedCompany;

      const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は本日〜前日にEDINETへ提出された「大量保有報告書」の情報です。この1件についてX(旧Twitter)投稿を1本作成してください。

# 提出情報
- 提出者:${d.filerName || "不明"}
- 対象銘柄コード:${d.secCode}
- 提出日:${d.submitDateTime || ""}
- 概要:${d.docDescription || ""}
${isTracked ? `- 補足:この銘柄(${companyName})は当メディアがIPO時から分析している銘柄です。` : ""}

# 注意事項
- 記載のない保有割合や取得目的を憶測で書かないでください
- 個人投資家として何に注意すべきか(需給への影響など)を最後に一言添えてください

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
      try {
        const content = await generateWithGemini(prompt);
        results.push({
          externalId: `edinet-${d.docID}`,
          companyName,
          sector: d.matchedCompany?.sector || "大量保有報告",
          result: {
            content,
            sourceLinks: [{ title: companyName, url: "https://disclosure2.edinet-fsa.go.jp/", source: "EDINET" }],
          },
        });
      } catch (err) {
        console.error(`大量保有報告書の記事生成失敗(${companyName}):`, err);
      }
    })
  );

  return results;
}
