import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    const supabase = getSupabase();

    const { data: company, error } = await supabase
      .from("ipo_companies")
      .select("name, sector, raw_prospectus")
      .eq("id", company_id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    if (!company.raw_prospectus) {
      return NextResponse.json({ error: "EDINETデータがありません。先に①を実行してください。" }, { status: 400 });
    }

    const sections = (company.raw_prospectus ?? {}) as Record<string, string>;
    const rawText = Object.entries(sections)
      .map(([label, content]) => `【${label}】\n${content}`)
      .join("\n\n")
      .slice(0, 80000);

    const prompt = `以下は日本のIPO企業「${company.name}」の目論見書テキストです。
必要な財務・株主数値はデータを抽出してJSONのみで返してください。前置き・後置き・マークダウン記法は一切不要です。
数値は必ず具体的な数字で表現してください。目論見書に記載がない場合は"目論見書に記載なし"と表現してください（ただし、価格未決定など開示時点でまだ確定していない項目は"未定"としてください）。
特にpublic_shares、fundraising_amountは、目論見書本文に明記された数字のみを使用し、決して推測や概算をしないでください。本文に明記がない場合は素直に"目論見書に記載なし"としてください。
float_ratio（流通比率）のみ、以下の計算式で必ず算出してください（他の独自解釈は禁止）：
  ・上場後発行済株式総数 ＝ 既存の発行済株式総数（「株式等の状況」内の発行済株式数） ＋ 公募株式数（新規発行株式数）
  ・流通株式数 ＝ 公募株式数 ＋ 売出株式数（引受人の買取引受による売出し） ＋ オーバーアロットメント株式数
  ・float_ratio ＝ 流通株式数 ÷ 上場後発行済株式総数 × 100（％、小数点1桁、"推定XX.X%程度"の形式で出力）

key_metricsについては、目論見書内の「主要な経営指標等の推移」という表（回次・決算年月ごとに売上高、経常利益、当期純利益、総資産額、純資産額、自己資本比率、自己資本利益率、１株当たり純資産額、１株当たり当期純利益などが並ぶ表）から、記載されている全期間分（通常5期分）を、古い期から新しい期の順に配列で抽出してください。値が「―」など未記載の場合はnullとしてください。数値は目論見書記載の単位（千円など）のまま、桁を変換せずに使用してください。

【目論見書テキスト】
${rawText}

【抽出するJSON形式】
{
  "company_name": "企業名",
  "business_summary": "事業内容の要約（200字以内）",
  "financials": {
    "revenue_trend": "売上高の推移（例：2022年3月期19.3億円→2023年3月期29.1億円→...）",
    "profit_trend": "営業利益の推移",
    "profit_margin": "直近の営業利益率（例：10.5%）",
    "cash_flow": "営業キャッシュフローの状況"
  },
  "key_metrics": [
    {
      "period": "決算期（例：2025年8月期）",
      "revenue": "売上高（千円単位の数値そのまま、例：285,5346千円）",
      "ordinary_profit": "経常利益（例：358,755千円）",
      "net_profit": "当期純利益（例：248,907千円）",
      "total_assets": "総資産額（例：2,060,585千円）",
      "net_assets": "純資産額（例：310,956千円）",
      "equity_ratio": "自己資本比率（例：15.1%）",
      "roe": "自己資本利益率・ROE（例：133.5%）",
      "eps": "1株当たり当期純利益（例：62.23円）",
      "bps": "1株当たり純資産額（例：77.74円）"
    }
  ],
  "ipo_details": {
    "total_shares": "発行済株式総数（例：9,000,000株）",
    "public_shares": "公募・売出株式数（例：公募100,000株・売出1,200,000株）",
    "float_ratio": "流通株式比率の推定（例：推定20%程度）",
    "fundraising_amount": "調達資金総額（例：1,013,850千円）",
    "use_of_proceeds": "資金使途の要約",
   "lockup_period": "ロックアップ期間（例：上場後180日間）",
    "lockup_targets": "ロックアップ対象者（例：創業者・主要役員）※注意：ロックアップ条項の文章は「〇〇は、主幹事会社に対し〜売却等を行わない旨合意しております」という構造になっています。売却を制限される対象者は文の主語（〇〇の部分、通常は創業者や既存株主）であり、主幹事会社（証券会社名）自体はロックアップの相手方であって対象者ではありません。証券会社名をlockup_targetsに含めないでください。",
    "overallotment": "オーバーアロットメントの有無と規模"
  },
  "shareholders": [
    {
      "name": "株主名（個人名または法人名）",
      "ratio": "保有比率（例：43.9%）※必ず%付きの数値で",
      "shares": "保有株式数（例：3,950,000株）",
      "type": "属性（創業者/VC/事業会社/役員/その他）",
      "lockup": "ロックアップ（有/無/記載なし）"
    }
  ],
  "risks": [
    {
      "title": "リスクタイトル",
      "severity": "高/中/低",
      "description": "内容（50字以内）"
    }
  ],
  "management": "代表取締役の主な情報",
  "growth_drivers": "成長ドライバー（主な2〜3点）",
  "concerns": "懸念点（主な2〜3点）"
}

特に株主構成については、以下の優先順位で情報を集めてください：
1. 目論見書内に「大株主の状況」という一覧表がある場合は、そこから氏名・保有株式数・持株比率を正確に抽出してください。
2. その表が存在しない場合（株主数が少ない非上場企業からの新規上場でよくあります）は、次の手がかりから株主を推測して構成してください：
   - 役員の状況・経営陣の記載にある「（注）所有株式数には、資産管理会社〇〇が所有する株式数を含む」等の注記
   - ロックアップ条項に明記されている「売出人」「貸株人」「当社株主である〇〇」等の氏名・社名
   - 「所有者別状況」の表にある株主区分（個人、その他の法人等）ごとの株主数・所有株式数(単元)の割合
   これらを組み合わせ、氏名・推定保有比率・推定株式数を可能な範囲で埋めてください。
   特に重要：創業者個人と、その資産管理会社（「株式会社〇〇」のような名前）は、たとえ「所有株式数に資産管理会社の分を含む」という注記があっても、必ず別々の株主として2行に分けて出力してください（1人にまとめないでください）。
   按分する際は、「所有者別状況」の「その他の法人」区分の比率・株主数を、必ず法人名（「株式会社」「合同会社」等を含む名前）の方に割り当ててください。「個人」区分の比率・株主数は、必ず個人名（人物の氏名）の方に割り当ててください。法人と個人を取り違えないよう、割り当てたあとに「法人名には法人区分の数値が入っているか」を確認してください。
   具体例：所有者別状況に「その他の法人60%、個人40%」とあり、株主が「南太郎（個人）」と「株式会社サウスホールディングス（南太郎の資産管理会社）」の2名だった場合 → 株式会社サウスホールディングスに60%、南太郎個人に40%を割り当てる。
   【最終確認・必須】出力する直前に、shareholders配列を見直し、以下を確認してください：
   ・名前に「株式会社」「合同会社」等が含まれる行には、必ず「その他の法人」区分の比率（多くの場合60%側）が入っているか？
   ・人物の氏名のみの行には、必ず「個人」区分の比率（多くの場合40%側）が入っているか？
   ・逆になっていたら、出力前に必ず入れ替えてください。
   ・法人名（「株式会社〇〇」等）を省略して「その他個人株主」のような曖昧な名称にせず、目論見書に記載された正式名称をそのまま使用してください。
   文中に明記がなく概算した場合は、ratioやsharesの末尾に「（推定）」と付け加えてください。
持株比率は必ず「XX.X%」形式の数値で返してください。`;

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 5500,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: '{"company_name":"' }
      ]
    });

    const raw2 = (msg.content[0] as any).text ?? "";
    const text = '{"company_name":"' + raw2;

    let structured: any = null;
    try {
      structured = JSON.parse(text);
    } catch {
      for (let i = text.length - 1; i > text.length - 200; i--) {
        if (text[i] === '}') {
          try {
            structured = JSON.parse(text.slice(0, i + 1));
            if (structured) break;
          } catch { continue; }
        }
      }
    }

    if (!structured) {
      return NextResponse.json({ error: "データの構造化に失敗しました。再試行してください。" }, { status: 500 });
    }

    // 流通比率はAIの自由記述だと不安定なため、保存直前にプログラムで確実に再計算する
    function extractShares(text: string | undefined | null, keyword?: string): number | null {
      if (!text) return null;
      const pattern = keyword
        ? new RegExp(keyword + "[^0-9]{0,5}([0-9,]+)\\s*株")
        : /([0-9,]+)\s*株/;
      const m = text.match(pattern);
      if (!m) return null;
      return parseInt(m[1].replace(/,/g, ""), 10);
    }

    if (structured?.ipo_details) {
      const existingTotal = extractShares(structured.ipo_details.total_shares);
      const publicSharesText = structured.ipo_details.public_shares ?? "";
      const newShares = extractShares(publicSharesText, "公募");
      const soldShares = extractShares(publicSharesText, "売出");
      const oaShares = extractShares(structured.ipo_details.overallotment);

      if (existingTotal && newShares) {
        const postIpoTotal = existingTotal + newShares;
        const floatShares = newShares + (soldShares ?? 0) + (oaShares ?? 0);
        const ratio = Math.round((floatShares / postIpoTotal) * 1000) / 10;
        structured.ipo_details.float_ratio = `推定${ratio}%程度`;
      }
    }

    await supabase.from("ipo_companies").update({
      structured_data: structured,
      analysis_detail: null,
    }).eq("id", company_id);

    return NextResponse.json({
      success: true,
      message: "✅ 構造化完了！次に「③Claudeで分析」を実行してください。",
      preview: {
        business: structured.business_summary?.slice(0, 80),
        financials: structured.financials?.revenue_trend,
        public_shares: structured.ipo_details?.public_shares,
        lockup: structured.ipo_details?.lockup_period,
        float_ratio: structured.ipo_details?.float_ratio,
        risks_count: structured.risks?.length ?? 0,
        shareholders_count: structured.shareholders?.length ?? 0,
      }
    });
  } catch (e: any) {
    console.error("structure error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}