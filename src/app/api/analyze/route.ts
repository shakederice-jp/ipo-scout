export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    // 既存の分析データを確認（48時間以内なら再利用）
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

    // Claude Sonnetで詳細分析を生成
    const analysisMsg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [{
        role: "user",
        content: `あなたはIPO投資のやさしい解説者です。以下のIPO企業を分析してください。

読み手は「投資の知識がほとんどない一般のサラリーマン・年配の方・女性の方」です。
次のことを必ず守ってください：
- 専門用語を使う場合は必ずカッコ内でわかりやすく説明する
- 「〜です」「〜ます」調の丁寧な文体を使う
- 冷たい・突き放した表現は避け、親しみやすく温かみのある文体にする
- 具体的な数字や事例を使って説明する
- 「なぜそれが大事なのか」を必ず一般の人の目線で説明する
- 各項目の説明は200字以上の十分な文量で書く
- JSONのみで回答する（前置き・後書き・マークダウン記号は不要）

企業情報：
会社名：${company.name}
チッカー（証券コード）：${company.ticker || "未定"}
取引所：${company.exchange || "未定"}
セクター（業種）：${company.sector || "不明"}
業態：${company.biz_type || "不明"}
上場日：${company.listing_date || "未定"}

以下のJSON構造で回答してください：
{
  "summary": "この会社が何をしている会社なのか、どんなビジネスモデルなのかを300字程度でわかりやすく説明してください。また、この銘柄に投資を検討する際のポイントと注意点を、投資初心者の方にも伝わるよう親しみやすい言葉で書いてください",
  "total_score": 65,
  "grade": "B",
  "highlight_reason": null,
  "axes": {
    "ultra_short": [
      {
        "id": "float",
        "index": "難・1",
        "title": "需給・ロック内容",
        "score": 70,
        "why_matters": "上場直後に株を売れる人が少ないほど株価が上がりやすくなります。たとえば100人しか売れる状態でないのに1000人が買いたければ、自然と値段は上がります。この項目では『売りたい人の数と量』を確認します",
        "description": "この企業のロックアップ（一定期間は株を売れない取り決め）の期間と条件、および大株主がどれくらいの比率で株を保有しているかを詳しく分析します。一般的にロックアップ期間が長く、大株主の保有比率が低いほど上場直後の需給環境は良好です。また、ベンチャーキャピタル（新興企業に投資する会社）がどの程度保有しているかも重要なポイントです",
        "verdict": "判断待ち",
        "doc_guide": "目論見書（投資家向けの会社説明書）の『株主の状況』ページをご確認ください。特に上位10名の大株主の保有比率とロックアップの有無をチェックしましょう"
      },
      {
        "id": "lockup",
        "index": "難・2",
        "title": "VC保有・売り圧力",
        "score": 65,
        "why_matters": "ベンチャーキャピタル（VC）とは、上場前から会社にお金を出している投資会社のことです。VCは上場後に利益確定のために株を売ることがあり、その売りが多いと株価が下がりやすくなります。VCの保有比率が高いほど、上場後に株価が下がるリスクがあります",
        "description": "VCの保有株数・比率、ロックアップ解除のタイミング、過去の投資ラウンド（資金調達の段階）での評価額などを分析します。ロックアップ解除後に大量の売りが出る可能性があるため、投資タイミングの判断に活用してください",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の大株主一覧でVC系株主の保有比率を確認しましょう。また『売出し』の項目にVCが含まれているかどうかも重要です"
      },
      {
        "id": "timing",
        "index": "難・3",
        "title": "市場環境・上場タイミング",
        "score": 60,
        "why_matters": "株式市場全体の雰囲気（地合いと呼びます）が良いときは、どの銘柄も上がりやすくなります。逆に市場全体が下落しているときはIPO銘柄も影響を受けます。上場するタイミングが市場環境に合っているかどうかを確認します",
        "description": "上場予定時期の株式市場全体の状況、同じ業種の他のIPO銘柄がどのような初値（上場初日の株価）をつけているか、金利や経済指標などのマクロ環境を分析します。市場環境が良好なタイミングでの上場かどうかが、初値形成に大きく影響します",
        "verdict": "判断待ち",
        "doc_guide": "直近1〜2ヶ月のIPO銘柄の初値騰落率を調べると市場の雰囲気がわかります。IPO情報サイト（ipokabu.netなど）でまとめて確認できます"
      }
    ],
    "short": [
      {
        "id": "valuation",
        "index": "週1-1",
        "title": "バリュエーション・割安感",
        "score": 65,
        "why_matters": "バリュエーションとは「会社の値付け」のことです。公開価格（IPO価格）が会社の実力に対して安いのか高いのかを判断します。割安であればあるほど、上場後に株価が上がる余地があります",
        "description": "PER（株価収益率：株価が1株あたり利益の何倍かを示す指標）やPSR（株価売上高倍率）を使って、同じ業界の上場企業と比較します。公開価格での時価総額が利益や売上に対して妥当かどうかを分析します。割安に設定されているIPOは上場後に株価が上がりやすい傾向があります",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の業績予想（売上高・営業利益）と公開価格から計算できます。同業他社のPERと比較すると割安感がわかります"
      },
      {
        "id": "vc_sell",
        "index": "週1-2",
        "title": "ロックアップ解除後の売り圧力",
        "score": 60,
        "why_matters": "ロックアップ（株を売れない期間）が解除されるタイミングで、大株主が一斉に売ることがあります。このタイミングを事前に把握しておくことで、株価下落リスクを避けられます",
        "description": "主要株主のロックアップ解除日（通常は上場から90〜180日後）と、解除後に売り出される可能性のある株数を分析します。解除日が近づくと株価が下がりやすいため、中期で保有する場合は特に注意が必要です",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の『売出し・ロックアップ』の項目を確認しましょう。解除条件（上場後〇日、または株価が公開価格の〇倍になったら解除など）もチェックしてください"
      },
      {
        "id": "growth",
        "index": "週1-3",
        "title": "成長性・市場規模",
        "score": 65,
        "why_matters": "会社が将来どれだけ大きくなれるかは、その会社が狙っている市場の大きさで決まります。市場規模が大きく、かつ会社の成長スピードが速いほど、株価が長期的に上がる可能性が高くなります",
        "description": "この企業が参入している市場の規模（TAM：対応可能な最大市場規模）と年間成長率、過去3年間の売上高成長率、競合他社と比べた市場シェアの変化などを分析します。特に売上高が年間30%以上成長しているグロース企業は投資家から高い評価を得やすい傾向があります",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の『事業の概要』と『経営成績』をご確認ください。売上の成長率と利益率のトレンドが読み取れます"
      }
    ],
    "long": [
      {
        "id": "management",
        "index": "長キ-1",
        "title": "経営陣・ガバナンス",
        "score": 70,
        "why_matters": "会社の成長を左右するのは、最終的には経営者の力量です。優秀な経営陣がいる会社は、困難な状況でも乗り越え、長期的に成長し続ける可能性が高くなります。特に創業者の経歴や実績は重要な判断材料です",
        "description": "創業者や代表取締役の経歴・過去の事業実績、主要な役員構成の多様性、社外取締役の独立性（会社から独立した立場で経営を監視できるか）、コンプライアンス（法令遵守）体制の整備状況などを詳しく分析します。また、創業者が大株主として経営に強いコミットメントを持っているかどうかも確認します",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の『役員の状況』ページをご確認ください。代表取締役の経歴欄と、社外取締役の選任理由が参考になります"
      },
      {
        "id": "unit_econ",
        "index": "長キ-2",
        "title": "ユニットエコノミクス",
        "score": 60,
        "why_matters": "ユニットエコノミクスとは「1人のお客さんから長期的にどれだけ稼げるか」を示す指標です。お客さんを1人獲得するコストより、そのお客さんから得られる収益が大きければ大きいほど、会社のビジネスは健全に成長できます",
        "description": "LTV（顧客生涯価値：1人のお客さんが取引を続ける間に会社にもたらす総利益）、CAC（顧客獲得コスト：新しいお客さんを1人獲得するのにかかる費用）、解約率（毎月何%のお客さんが解約するか）などの指標を分析します。LTV÷CACが3倍以上あれば優良なビジネスモデルとされています",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の財務データや事業説明の項目を確認しましょう。SaaS企業などはARR（年次経常収益）や解約率の開示があることが多いです"
      },
      {
        "id": "competitor",
        "index": "長キ-3",
        "title": "競合優位性",
        "score": 65,
        "why_matters": "競合他社が真似できない強みを持っている会社ほど、長期的に高い利益率を維持できます。この強みのことを『競争優位性』または『堀（ほり）』と呼びます。堀が深い会社は長期投資に向いています",
        "description": "この企業が持つ独自技術・特許、ブランド力、ネットワーク効果（ユーザーが増えるほどサービスの価値が上がる仕組み）、スイッチングコスト（お客さんが他社に乗り換えにくい仕組み）などを分析します。主要な競合他社と比較して、どの点で優れているかを具体的に評価します",
        "verdict": "判断待ち",
        "doc_guide": "目論見書の『競合他社との比較』や『強みと弱み』の項目をご確認ください。特許・商標の保有状況も参考になります"
      }
    ]
  },
  "sources": [
    {"label":"東証新規上場情報","url":"https://www.jpx.co.jp/listing/stocks/new/index.html"},
    {"label":"EDINET・有価証券届出書","url":"https://disclosure2.edinet-fsa.go.jp/"},
    {"label":"銘柄情報IPO","url":"https://minkabu.jp/stock/${company.ticker || ''}"},
    {"label":"IPO情報","url":"https://ipokabu.net/"}
  ],
  "generated_at": "${new Date().toISOString()}"
}`
      }]
    });

    const rawText = (analysisMsg.content[0] as any).text;
    let analysis = JSON.parse(extractJson(rawText));

    // Gemini整合性チェック
    try {
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const geminiModel = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const checkPrompt = `IPO企業の分析結果を整合性チェックしてください。企業：${company.name}（${company.sector}）。分析サマリー：${analysis.summary}\n問題がなければJSON：\n{"ok":true,"issues":""}\n問題があれば：\n{"ok":false,"issues":"問題の内容"}`;
      const geminiResult = await geminiModel.generateContent(checkPrompt);
      const rawGemini = geminiResult.response.text();
      const geminiText = extractJson(rawGemini);
      let check: { ok: boolean; issues: string };
      try { check = JSON.parse(geminiText); } catch { check = { ok: true, issues: "" }; }

      if (!check.ok && check.issues) {
        const fixMsg = await claude.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `IPO分析の整合性を修正してください。問題点：${check.issues}\n企業：${company.name}\n現在のsummary：${analysis.summary}\n修正後のsummaryのみJSONで返してください：\n{"summary":"修正後のテキスト","total_score":65,"grade":"B"}`
          }]
        });
        const fixRaw = (fixMsg.content[0] as any).text;
        try {
          const fix = JSON.parse(extractJson(fixRaw));
          if (fix.summary) analysis.summary = fix.summary;
          if (fix.total_score) analysis.total_score = fix.total_score;
          if (fix.grade) analysis.grade = fix.grade;
        } catch {}
      }
    } catch {}

    // DBに保存
    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}