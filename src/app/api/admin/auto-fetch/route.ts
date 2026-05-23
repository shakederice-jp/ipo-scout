import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";


function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr){ esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}
export async function POST() {
  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
    const supabase = createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase接続エラー");

    // 既存ティチE��ーを取征E
    const { data: existing } = await supabase.from("ipo_companies").select("ticker");
    const existingTickers = new Set((existing || []).map((r: any) => r.ticker));

    // IPOスケジュールを取征E
    const html = await fetch("https://96ut.com/ipo/schedule.php?year=2026").then(r => r.text());
    const sourceText = html.slice(0, 8000);

    // Claudeにスケジュール表をパースさせめE
    const parseMsg = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `以下�EHTMLのIPOスケジュール表を読み取り、JSONのみで回答してください、E

${sourceText}

[{"name":"銘柄吁E,"ticker":"コーチE,"listing_date":"YYYY-MM-DD","bb_start_date":"YYYY-MM-DD","apply_start_date":"YYYY-MM-DD","exchange":"グロースまた�Eスタンダードまた�Eプライム"}]`
      }],
    });

    const parseText = (parseMsg.content[0] as any).text.replace(/```json|```/g, "").trim();
    const ipos: any[] = JSON.parse(parseText);
    const newIpos = ipos.filter(ipo => !existingTickers.has(ipo.ticker));

    let added = 0;
    const errors: string[] = [];

    for (const ipo of newIpos.slice(0, 5)) {
      try {
        // Step1: ClaudeがAI刁E��を生戁E
        const analysisMsg = await claude.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `IPO企業、E{ipo.name}」！E{ipo.ticker}、E{ipo.exchange}、上場日:${ipo.listing_date}�E�を刁E��し、JSONのみで回筁E
{"sector":"セクター吁E,"biz_type":"業態�EビジネスモチE��","ai_summary":"150斁E��程度の事業概要E,"ai_score":65,"highlight":false}`
          }],
        });
        const rawAnalysis = (analysisMsg.content[0] as any).text; const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/); const analysisText = jsonMatch ? jsonMatch[0] : rawAnalysis.replace(/```json|```/g, "").trim();
        let analysis; try { analysis = JSON.parse(analysisText); } catch { analysis = { sector: "���̑�", biz_type: "�s��", ai_summary: "�������͂Ɏ��s���܂���", ai_score: 50, highlight: false }; }

        // Step2: Geminiが�EチE�Eタとの整合性をチェチE��
        const checkPrompt = `以下�EIPO企業惁E��と、AIが生成した�E析を比輁E��てください、E

【�EチE�Eタ�E�EPOスケジュールサイトより）、E
銘柄吁E ${ipo.name}
チE��チE��ー: ${ipo.ticker}
取引所: ${ipo.exchange}
上場日: ${ipo.listing_date}

【AI生�E刁E��、E
セクター: ${analysis.sector}
業慁E ${analysis.biz_type}
要紁E ${analysis.ai_summary}
スコア: ${analysis.ai_score}

允E��ータの銘柄名�EチE��チE��ー・取引所・日付と、AI刁E��の冁E��に明らかな矛盾めE��りがありますか�E�E
以下�EJSONのみで回答してください�E�E
{"ok":true,"issues":"問題なぁE}
また�E
{"ok":false,"issues":"具体的な問題点"}`;

        const geminiResult = await geminiModel.generateContent(checkPrompt);
        const rawGemini = geminiResult.response.text(); const geminiMatch = rawGemini.match(/\{[\s\S]*\}/); const geminiText = geminiMatch ? geminiMatch[0] : rawGemini.replace(/```json|```/g, "").trim();
        let check; try { check = JSON.parse(geminiText); } catch { check = { ok: true, issues: "" }; }

        // Step3: 問題があればClaudeが修正
        if (!check.ok) {
          const fixMsg = await claude.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `IPO企業、E{ipo.name}」！E{ipo.ticker}�E��E刁E��に以下�E問題が持E��されました�E�E
${check.issues}

修正した刁E��をJSONのみで回筁E
{"sector":"セクター吁E,"biz_type":"業慁E,"ai_summary":"150斁E���E事業概要E,"ai_score":65,"highlight":false}`
            }],
          });
          const rawFix = (fixMsg.content[0] as any).text; const fixMatch = rawFix.match(/\{[\s\S]*\}/); const fixText = fixMatch ? fixMatch[0] : rawFix.replace(/```json|```/g, "").trim();
          try { analysis = JSON.parse(fixText); } catch { /* keep previous */ }
        }

        // Step4: Supabaseに保孁E
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