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
      .select('name, structured_data, analysis_summary, listing_date')
      .eq('id', companyId)
      .single();

    if (!company) return NextResponse.json({ error: 'company not found' }, { status: 404 });

    const companyName = company.name;
    const structured = company.structured_data || {};
    const businessDesc = structured.business_description || '';
    const sector = structured.sector || '';
    const dbListingDate = company.listing_date || null;

    // Step1: Web検索で情報収集
    // 2026/9/12追記: 「上場まであと○日」カウントダウン機能のため、目論見書以外の
    // 複数のネット情報源から上場予定日を確認する項目(6)を追加。目論見書記載の日付が
    // 変更されるケース(仮条件決定後の日程確定・延期等)があるため、独立した情報源
    // 2件以上が一致した場合のみ「確認済み」として扱う設計(下記JSON整形・保存処理を参照)。
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
6. 「${companyName}」の上場（予定）日について、目論見書以外の複数のネット情報源（日本取引所グループ、Yahoo!ファイナンス、株探、みんかぶ、会社の公式サイト・適時開示、証券会社のIPOカレンダー等）を最低2つ調べてください。それぞれの情報源名と、そこに記載されている上場日（西暦年月日）を明記してください。現時点でDBに登録されている予定日は「${dbListingDate ?? "未登録"}」です。情報源同士で日付が一致するかどうかも分かるように書いてください。

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

【上場日の確認について】収集情報の中から、上場（予定）日に関する記述を探し、以下のルールでlisting_date_checkを埋めてください。
- 独立した情報源が2つ以上見つかり、日付が一致していれば found_date にその日付をYYYY-MM-DD形式で入れ、agreement_count に一致した情報源の数を入れる。
- 情報源が1つしか見つからない、または情報源同士で日付が食い違う場合は、found_date は null にし、agreement_count は実際に見つかった情報源の数（0または1、または食い違いがある場合は0）にする。
- note には簡潔な根拠（情報源名や食い違いの内容）を日本語で書く。

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
  "summary": "総合コメント200字",
  "listing_date_check": { "found_date": "2026-10-15", "agreement_count": 2, "note": "根拠の簡潔な説明" }
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

    // 上場予定日の確認結果を反映(2026/9/12新設「上場まであと○日」カウントダウン用)。
    // 独立した情報源2件以上が一致した場合のみ「確認済み」とし、DBの日付と食い違う場合は
    // ネット情報の方を正として更新する(目論見書時点より新しい日程確定情報とみなす)。
    // 一致が得られなかった場合はconfirmedをfalseのままにし、トップページ・分析ページの
    // カウントダウン表示は非表示のままにする(ユーザー要望「日程未定は信用を無くす」への対応)。
    const dateCheck = marketData.listing_date_check || {};
    const foundDate: string | null = dateCheck.found_date || null;
    const agreementCount: number = Number(dateCheck.agreement_count) || 0;
    let listingDateNote = "ネット情報での確認ができませんでした（情報源不足、または情報が食い違っています）";
    const updatePayload: Record<string, any> = { analysis_market: marketData };

    if (foundDate && agreementCount >= 2) {
      updatePayload.listing_date_confirmed = true;
      if (dbListingDate && foundDate !== dbListingDate) {
        updatePayload.listing_date = foundDate;
        listingDateNote = `上場予定日を目論見書記載の日付から${foundDate}に更新しました（ネット情報${agreementCount}件で一致）`;
      } else {
        listingDateNote = `上場予定日を確認しました（ネット情報${agreementCount}件で一致・${foundDate}）`;
      }
    }

    const { error } = await supabase
      .from('ipo_companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true, data: marketData, listing_date_note: listingDateNote });
  } catch (err: any) {
    console.error('market route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}