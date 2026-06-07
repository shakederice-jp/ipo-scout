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
1. 主幹事証券会社
2. 競合・同業他社
3. 業界PER・バリュエーション
4. 直近の同セクターIPO事例

検索して得た情報をそのまま教えてください。`
      }],
    });

    // 検索結果のテキストを収集
    const searchText = searchResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    // Step2: 収集した情報をJSONに整形（Web検索なし）
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

出力形式（JSONのみ、説明文不要）：
{"lead_underwriter":"主幹事証券会社名（不明なら空文字）","competitors":[{"name":"企業名","feature":"特徴"}],"industry_per":"業界PER水準","recent_ipos":[{"name":"企業名","date":"上場日","result":"初値結果"}],"market_trend":"市場トレンド","summary":"総合コメント200字"}`
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