export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = createSupabaseServerClient();

    if (supabase) {
      const { data } = await supabase
        .from("ipo_companies")
        .select("analysis_detail")
        .eq("id", company.id)
        .single();
      if (data?.analysis_detail) {
        const detail = data.analysis_detail as any;
        const generatedAt = new Date(detail.generated_at || 0);
        const hoursSince = (Date.now() - generatedAt.getTime()) / 3600000;
        if (hoursSince < 48) return NextResponse.json(detail);
      }
    }

    const msg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `以下のIPO企業をJSONのみで分析してください（前置き不要）。
読者は投資初心者です。「〜です・〜ます」調で、専門用語にはカッコで説明を付けてください。

企業：${company.name}／${company.sector || "不明"}／${company.exchange || "未定"}／上場日${company.listing_date || "未定"}

{"summary":"事業内容と投資ポイントを200字で親しみやすく説明","total_score":65,"grade":"B","highlight_reason":null,"axes":{"ultra_short":[{"id":"float","index":"難・1","title":"需給・ロック内容","score":70,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"lockup","index":"難・2","title":"VC保有・売り圧力","score":65,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"timing","index":"難・3","title":"市場環境・タイミング","score":60,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"}],"short":[{"id":"valuation","index":"週1-1","title":"バリュエーション","score":65,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"vc_sell","index":"週1-2","title":"ロックアップ解除後の売り圧力","score":60,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"growth","index":"週1-3","title":"成長性・市場規模","score":65,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"}],"long":[{"id":"management","index":"長キ-1","title":"経営陣・ガバナンス","score":70,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"unit_econ","index":"長キ-2","title":"ユニットエコノミクス","score":60,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"},{"id":"competitor","index":"長キ-3","title":"競合優位性","score":65,"why_matters":"なぜ重要か60字","description":"詳細分析150字","verdict":"判断待ち","doc_guide":"確認方法50字"}]},"sources":[{"label":"東証新規上場情報","url":"https://www.jpx.co.jp/listing/stocks/new/index.html"},{"label":"EDINET","url":"https://disclosure2.edinet-fsa.go.jp/"},{"label":"みんかぶIPO","url":"https://minkabu.jp/stock/${company.ticker || ''}"},{"label":"IPOkabu","url":"https://ipokabu.net/"}],"generated_at":"${new Date().toISOString()}"}`
      }]
    });

    const rawText = (msg.content[0] as any).text;
    const analysis = JSON.parse(extractJson(rawText));

    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}