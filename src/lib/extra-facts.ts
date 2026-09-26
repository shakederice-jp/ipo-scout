// 2026/9/26新設(ナインクロス独自試算 ⑦⑧⑨): 目論見書から、既存の構造化データ(structured_data)
// では取れていなかった数値を追加で取り出す。
//   ・上場前の発行済株式総数(時価総額の計算に必要)
//   ・公募株数/売出株数/オーバーアロットメント株数(売出比率・吸収金額に必要)
//   ・ロックアップの価格条件(「発行価格の1.5倍以上で売却する場合を除く」の倍率)
//   ・代表者(本人+資産管理会社)の持株比率(上場前)
//   ・目論見書に明記された市場規模
//
// 「事実でない数字は出さない」方針を守るため、次の二重チェックをしている。
//   1. ロックアップの倍率は、AIを使わず正規表現で目論見書本文から直接読む。
//   2. AIに読ませる項目は、必ず「本文の該当箇所の引用」を一緒に返させ、その引用が本当に
//      目論見書本文に含まれているか・引用の中にその数字が書かれているかをプログラムで照合する。
//      照合に通らなかった数字は捨てる(null にする)。
// 結果は structured_data.extra_facts に保存する(既存の構造化データは上書きしない)。
import Anthropic from "@anthropic-ai/sdk";

export const EXTRA_FACTS_VERSION = 1;

export type ExtraFacts = {
  version: number;
  extracted_at: string;
  shares_before_ipo: number | null;
  new_shares: number | null;
  secondary_shares: number | null;
  overallotment_shares: number | null;
  lockup_price_multiple: number | null;
  representative: { name: string; ratio_pct: number } | null;
  market_size: { oku_yen: number; label: string; source: string; year: string } | null;
  rejected: string[]; // 照合に通らず捨てた項目(原因調査用)
};

// 全角・半角や空白の違いを無視して照合するための正規化
function norm(s: string): string {
  return (s || "").normalize("NFKC").replace(/\s+/g, "");
}

function toNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = String(s).normalize("NFKC").replace(/,/g, "").match(/-?[0-9]+(\.[0-9]+)?/);
  return m ? parseFloat(m[0]) : null;
}

// 「1,234,567」「1234567」のどちらの書き方でも本文中にその数字があるか
function numberAppearsIn(n: number, text: string): boolean {
  const plain = String(Math.round(n));
  const withComma = Math.round(n).toLocaleString("en-US");
  return text.includes(withComma) || text.includes(plain);
}

// 「公募100,000株」「公募株式数600,000株」「売出:69,320,100株」などから株数を読む。
// 「公募:未記載、売出:69,320,100株」のような書き方で売出の数字を公募と取り違えないよう、
// キーワードと数字の間には「株式数」「:」程度しか挟まない書き方だけを認める。
export function sharesFrom(text: string | undefined | null, keyword: string): number | null {
  if (!text) return null;
  const re = new RegExp(keyword + "(?:株式数|の株式数|株数|数)?\\s*[:：]?\\s*(?:約|上限|最大)?\\s*([0-9][0-9,]*)\\s*株");
  const m = text.normalize("NFKC").match(re);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

// ロックアップの価格条件(倍率)を本文から直接読む。複数ある場合は一番低い倍率
// (=最初に売却制限が外れる株価)を採用する。
export function findLockupPriceMultiple(rawText: string): number | null {
  const t = rawText.normalize("NFKC");
  const re = /(?:発行価格|売出価格)の\s*([0-9]+(?:\.[0-9]+)?)\s*倍以上/g;
  let m: RegExpExecArray | null;
  const found: number[] = [];
  while ((m = re.exec(t))) {
    const v = parseFloat(m[1]);
    if (v >= 1 && v <= 5) found.push(v);
  }
  return found.length ? Math.min(...found) : null;
}

// 「7,240億円」「1兆2,832億円」「3,500百万円」などを億円に換算する
// 引用文の中に金額が複数ある場合(「2023年の7,240億円から2029年には1兆2,832億円」など)は、
// 文中で最初に出てくる金額を採用する。
export function parseMarketSizeOku(text: string): number | null {
  const t = text.normalize("NFKC").replace(/,/g, "");
  const re = /([0-9]+(?:\.[0-9]+)?)兆([0-9]+(?:\.[0-9]+)?)億円|([0-9]+(?:\.[0-9]+)?)兆円|([0-9]+(?:\.[0-9]+)?)億円|([0-9]+(?:\.[0-9]+)?)百万円/;
  const m = t.match(re);
  if (!m) return null;
  if (m[1] != null) return parseFloat(m[1]) * 10000 + parseFloat(m[2]);
  if (m[3] != null) return parseFloat(m[3]) * 10000;
  if (m[4] != null) return parseFloat(m[4]);
  if (m[5] != null) return parseFloat(m[5]) / 100;
  return null;
}

const anthropic = new Anthropic();

type AiAnswer = {
  shares_before_ipo?: number | null;
  shares_evidence?: string | null;
  representative_name?: string | null;
  representative_components?: { label?: string; pct?: number; evidence?: string }[] | null;
  market_size_label?: string | null;
  market_size_source?: string | null;
  market_size_year?: string | null;
  market_size_evidence?: string | null;
};

async function askAi(companyName: string, rawText: string): Promise<AiAnswer | null> {
  const prompt = `以下は日本のIPO企業「${companyName}」の目論見書(抜粋)です。次の3項目だけを読み取り、JSONのみで返してください。
推測・計算・一般知識での補完は禁止です。目論見書本文に書かれている数字だけを使い、書かれていなければ null にしてください。
各項目には、根拠となる本文の該当箇所を「一字一句そのまま」20〜80字で引用してください(要約・言い換え禁止)。

1. shares_before_ipo: 本書提出日現在(株式分割がある場合は分割後)の発行済株式総数(株)。上場時の公募・売出しは含めない。
   shares_evidence: その数字が書かれている箇所の引用。
2. representative_name: 代表取締役(社長)の氏名。
   representative_components: 代表者本人の持株比率と、代表者の資産管理会社(本人が議決権の過半数を持つ会社)の持株比率を、別々の要素として配列で。
     各要素は {"label": "本人" または 会社名, "pct": 数値(%), "evidence": 引用}。
     「大株主の状況」の「所有株式数の割合」や、「同氏と同氏が議決権の過半数を所有している会社の所有株式の合計は…%」のような記載を使う。
     比率が本文に書かれていない場合は null。
3. 市場規模: この会社の主要な事業領域の市場規模として、目論見書に金額で明記されているもの(調査会社の推計など)を1つだけ。
   market_size_label: 何の市場か(例:「国内ビジネスコンサルティング市場」)
   market_size_source: 出典(例:「IDC Japan」。書かれていなければ null)
   market_size_year: 何年の数字か(例:「2023年」)
   market_size_evidence: 金額が書かれている箇所の引用(金額を必ず含めること)
   書かれていない場合は4項目とも null。

出力形式(このキーのみ):
{"shares_before_ipo":null,"shares_evidence":null,"representative_name":null,"representative_components":null,"market_size_label":null,"market_size_source":null,"market_size_year":null,"market_size_evidence":null}

【目論見書(抜粋)】
${rawText.slice(0, 70000)}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1200,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "{" },
    ],
  });
  const text = "{" + ((msg.content[0] as any)?.text ?? "");
  const end = text.lastIndexOf("}");
  try {
    return JSON.parse(text.slice(0, end + 1));
  } catch {
    return null;
  }
}

export async function extractExtraFacts(
  companyName: string,
  rawProspectus: Record<string, string> | null,
  structured: any
): Promise<ExtraFacts> {
  const rawText = Object.entries(rawProspectus ?? {})
    .map(([k, v]) => `【${k}】\n${v}`)
    .join("\n\n");
  const normalizedRaw = norm(rawText);
  const rejected: string[] = [];

  // --- 公募・売出・OA株数: 既存の構造化データの記載から読み、目論見書本文に同じ数字があるか照合 ---
  const publicText: string = structured?.ipo_details?.public_shares ?? "";
  const oaText: string = structured?.ipo_details?.overallotment ?? "";
  const verifyShares = (n: number | null, label: string) => {
    if (n == null) return null;
    if (numberAppearsIn(n, normalizedRaw)) return n;
    rejected.push(`${label}(${n})が本文と一致しない`);
    return null;
  };
  let newShares = verifyShares(sharesFrom(publicText, "公募"), "公募株数");
  // 「公募なし・売出のみ」のIPOは、本文にその旨があるときだけ0とみなす
  if (newShares == null && /公募[^。]{0,10}(なし|行わない|該当事項はありません)/.test(publicText.normalize("NFKC"))) newShares = 0;
  const secondaryShares = verifyShares(sharesFrom(publicText, "売出"), "売出株数");
  const oaShares = verifyShares(sharesFrom(publicText, "オーバーアロットメント") ?? sharesFrom(oaText, ""), "OA株数");

  // --- ロックアップの価格条件(正規表現のみ) ---
  const lockupMultiple = findLockupPriceMultiple(rawText);

  // --- AIで読む項目(引用照合つき) ---
  let sharesBefore: number | null = null;
  let representative: ExtraFacts["representative"] = null;
  let marketSize: ExtraFacts["market_size"] = null;

  let ai: AiAnswer | null = null;
  if (rawText.length > 1000) {
    try {
      ai = await askAi(companyName, rawText);
    } catch (e: any) {
      rejected.push(`AI読み取り失敗: ${e?.message ?? e}`);
    }
  }

  const evidenceOk = (ev: string | null | undefined) => !!ev && norm(ev).length >= 6 && normalizedRaw.includes(norm(ev));

  if (ai) {
    // 発行済株式総数
    const sb = typeof ai.shares_before_ipo === "number" ? ai.shares_before_ipo : toNum(ai.shares_before_ipo as any);
    if (sb != null && sb > 0) {
      if (evidenceOk(ai.shares_evidence) && numberAppearsIn(sb, norm(ai.shares_evidence!))) sharesBefore = Math.round(sb);
      else rejected.push(`発行済株式総数(${sb})の引用照合に失敗`);
    }

    // 代表者の持株比率(本人+資産管理会社)
    const comps = Array.isArray(ai.representative_components) ? ai.representative_components : [];
    if (ai.representative_name && comps.length > 0) {
      let sum = 0;
      let ok = true;
      for (const c of comps) {
        const pct = typeof c?.pct === "number" ? c.pct : toNum(c?.pct as any);
        if (pct == null || pct < 0 || pct > 100 || !evidenceOk(c?.evidence)) { ok = false; break; }
        const ev = norm(c!.evidence!);
        if (!ev.includes(String(pct)) && !ev.includes(pct.toFixed(1)) && !ev.includes(pct.toFixed(2))) { ok = false; break; }
        sum += pct;
      }
      if (ok && sum > 0 && sum <= 100) representative = { name: String(ai.representative_name), ratio_pct: Math.round(sum * 10) / 10 };
      else rejected.push("代表者の持株比率の引用照合に失敗");
    }

    // 市場規模(金額は引用文からプログラムで読み直す)
    if (ai.market_size_evidence && ai.market_size_label) {
      const oku = parseMarketSizeOku(ai.market_size_evidence);
      if (evidenceOk(ai.market_size_evidence) && oku != null && oku > 0) {
        marketSize = {
          oku_yen: oku,
          label: String(ai.market_size_label).slice(0, 40),
          source: String(ai.market_size_source ?? "").slice(0, 30),
          year: String(ai.market_size_year ?? "").slice(0, 12),
        };
      } else {
        rejected.push("市場規模の引用照合に失敗");
      }
    }
  }

  return {
    version: EXTRA_FACTS_VERSION,
    extracted_at: new Date().toISOString(),
    shares_before_ipo: sharesBefore,
    new_shares: newShares,
    secondary_shares: secondaryShares,
    overallotment_shares: oaShares,
    lockup_price_multiple: lockupMultiple,
    representative,
    market_size: marketSize,
    rejected,
  };
}
