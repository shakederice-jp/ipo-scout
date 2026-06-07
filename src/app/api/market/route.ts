import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

    const { data: company } = await supabase
      .from('ipo_companies')
      .select('name, structured_data, analysis_summary')
      .eq('id', companyId)
      .single();

    if (!company) return NextResponse.json({ error: 'company not found' }, { status: 404 });

    const companyName = company.name;
    const structured = company.structured_data || {};
    const businessDesc = structured.business_description || '';
    const sector = structured.sector || '';

    const prompt = `以下のIPO企業について、市場・競合情報を収集・整理してください。

企業名：${companyName}
セクター：${sector}
事業概要：${businessDesc}

Web検索を使って以下の情報を収集し、日本語でまとめてください：

1. 主幹事証券会社
2. 同業他社・競合企業（3〜5社）とその特徴
3. 業界PER・バリュエーション水準
4. 直近の同セクターIPO事例（1〜3件）
5. 市場トレンド・業界動向

JSONで出力してください（マークダウン不要）：
{
  "lead_underwriter": "主幹事証券会社名",
  "competitors": [{"name": "企業名", "feature": "特徴"}],
  "industry_per": "業界PER水準の説明",
  "recent_ipos": [{"name": "企業名", "date": "上場日", "result": "初値結果"}],
  "market_trend": "市場トレンドの説明",
  "summary": "総合的な市場環境コメント（200字程度）"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{ role: 'user', content: prompt }],
    });

    // テキストブロックを結合
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    // JSONパース
    let marketData: any = {};
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      marketData = JSON.parse(clean);
    } catch {
      marketData = { summary: text, raw: true };
    }

    // Supabaseに保存
    const { error } = await supabase
      .from('ipo_companies')
      .update({ analysis_market: marketData })
      .eq('id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true, data: marketData });
  } catch (err: any) {
    console.error('market route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}