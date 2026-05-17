import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    const supabase = createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase接続エラー");

    // 既存ティッカーを取得
    const { data: existing } = await supabase.from("ipo_companies").select("ticker");
    const existingTickers = new Set((existing || []).map((r: any) => r.ticker));

    // IPOスケジュールを取得
    const html = await fetch("https://96ut.com/ipo/schedule.php?year=2026").then(r => r.text());
    const sourceText = html.slice(0, 8000);

    // Claudeにスケジュール表をパースさせる
    const parseMsg = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `以下のHTMLのIPOスケジュール表を読み取り、JSONのみで回答してください。

${sourceText}

[{"name":"銘柄名","ticker":"コード","listing_date":"YYYY-MM-DD","bb_start_date":"YYYY-MM-DD","apply_start_date":"YYYY-MM-DD","exchange":"グロースまたはスタンダードまたはプライム"}]`
      }],
    });

    const parseText = (parseMsg.content[0] as any).text.replace(/```json|```/g, "").trim();
    const ipos: any[] = JSON.parse(parseText);
    const newIpos = ipos.filter(ipo => !existingTickers.has(ipo.ticker));

    let added = 0;
    const errors: string[] = [];

    for (const ipo of newIpos.slice(0, 5)) {
      try {
        // Step1: ClaudeがAI分析を生成
        const analysisMsg = await claude.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `IPO企業「${ipo.name}」（${ipo.ticker}、${ipo.exchange}、上場日:${ipo.listing_date}）を分析し、JSONのみで回答:
{"sector":"セクター名","biz_type":"業態・ビジネスモデル","ai_summary":"150文字程度の事業概要","ai_score":65,"highlight":false}`
          }],
        });
        const analysisText = (analysisMsg.content[0] as any).text.replace(/```json|```/g, "").trim();
        let analysis = JSON.parse(analysisText);

        // Step2: Geminiが元データとの整合性をチェック
        const checkPrompt = `以下のIPO企業情報と、AIが生成した分析を比較してください。

【元データ（IPOスケジュールサイトより）】
銘柄名: ${ipo.name}
ティッカー: ${ipo.ticker}
取引所: ${ipo.exchange}
上場日: ${ipo.listing_date}

【AI生成分析】
セクター: ${analysis.sector}
業態: ${analysis.biz_type}
要約: ${analysis.ai_summary}
スコア: ${analysis.ai_score}

元データの銘柄名・ティッカー・取引所・日付と、AI分析の内容に明らかな矛盾や誤りがありますか？
以下のJSONのみで回答してください：
{"ok":true,"issues":"問題なし"}
または
{"ok":false,"issues":"具体的な問題点"}`;

        const geminiResult = await geminiModel.generateContent(checkPrompt);
        const geminiText = geminiResult.response.text().replace(/```json|```/g, "").trim();
        const check = JSON.parse(geminiText);

        // Step3: 問題があればClaudeが修正
        if (!check.ok) {
          const fixMsg = await claude.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `IPO企業「${ipo.name}」（${ipo.ticker}）の分析に以下の問題が指摘されました：
${check.issues}

修正した分析をJSONのみで回答:
{"sector":"セクター名","biz_type":"業態","ai_summary":"150文字の事業概要","ai_score":65,"highlight":false}`
            }],
          });
          const fixText = (fixMsg.content[0] as any).text.replace(/```json|```/g, "").trim();
          analysis = JSON.parse(fixText);
        }

        // Step4: Supabaseに保存
        await supabase.from("ipo_companies").insert({
          name: ipo.name, ticker: ipo.ticker,
          exchange: ipo.exchange || "グロース",
          listing_date: ipo.listing_date || null,
          bb_start_date: ipo.bb_start_date || null,
          apply_start_date: ipo.apply_start_date || null,
          sector: analysis.sector, biz_type: analysis.biz_type,
          ai_summary: analysis.ai_summary, ai_score: analysis.ai_score,
          highlight: analysis.highlight ?? false,
          status: "仮条件決定前",
        });
        added++;
      } catch (e: any) {
        errors.push(`${ipo.name}: ${e.message}`);
      }
    }

    return NextResponse.json({
      added,
      skipped: ipos.length - newIpos.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}