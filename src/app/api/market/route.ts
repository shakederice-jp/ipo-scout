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

    // Step1: Web検索で情報収集
    const searchResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `「${companyName}」（${sector}）のIPOに関して以下を検索してください：

1. 主幹事証券会社名
2. 競合・同業他社（3〜5社、特徴も含めて）
3. 業界PER・バリュエーション水準
4. 直近2〜3年以内の同セクター・同業種のIPO事例を5社以上検索し、それぞれの「初値が公募価格に対して何％上昇・下落したか」を数値で教えてください。例：「公募価格比+36.1%」「公募価格比-5.2%」のように必ず数値で表してください。
5. 市場全体のIPOトレンド

必ず複数社の初値パフォーマンスを数値付きで調べてください。`
      }],
    });

    // 検索結果のテキストを収集
    const searchText = searchResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    // Step2: 収集した情報をJSONに整形
    const formatResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `以下の情報を元に、JSONのみで出力してください。マークダウン不要。

収集情報：
${searchText}

企業名：${companyName}
セクター：${sector}
事業概要：${businessDesc}

【重要】recent_iposには必ず3〜5社を含めてください。"result"フィールドは必ず「+36.1%」「-5.2%」のように符号付きの数値パーセントで表してください。「好調」「公募価格を上回った」などの文章表現は不可です。

出力形式（JSONのみ、説明文不要）：
{
  "lead_underwriter": "主幹事証券会社名（不明なら空文字）",
  "competitors": [{"name": "企業名", "feature": "特徴"}],
  "industry_per": "業界PER水準",
  "recent_ipos": [
    {"name": "企業名", "date": "2024年6月", "result": "+36.1%"},
    {"name": "企業名", "date": "2024年3月", "result": "-5.2%"},
    {"name": "企業名", "date": "2023年12月", "result": "+12.0%"},
    {"name": "企業名", "date": "2023年9月", "result": "+8.5%"},
    {"name": "企業名", "date": "2023年6月", "result": "+22.3%"}
  ],
  "market_trend": "市場トレンド",
  "summary": "総合コメント200字"
}`
      }],
    });

    const formatText = formatResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    let marketData: any = {};
    try {
      const clean = formatText.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      marketData = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: formatText, raw: true };
    } catch {
      marketData = { summary: formatText, raw: true };
    }

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