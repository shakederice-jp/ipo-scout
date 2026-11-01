import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// 2026/11/1新設(集客施策1): 銘柄ごとのシェア画像(OGP画像)を自動で作る。
// X・LINE・Facebookなどにこのサイトの銘柄ページのURLを貼ったとき、
// 会社名・証券コード・上場日・公募価格(または仮条件)・AI総合スコアが入った画像が出る。
// 例: https://ipo.finance-tower.com/og/1234  (1234 は証券コード。UUIDでも可)
// ・登録済みの公開情報(スコアと等級は、ページの説明文にも載せているもの)だけを使う。分析の本文は載せない。
// ・会社が見つからない/取得に失敗したときは、共通のOGP画像(/ogp.png)に切り替える(シェアが壊れないように)。
// ・日本語フォントは、既存の /api/og-infographic と同じく public/fonts のNotoSansJPを使う。

const BG = "linear-gradient(135deg, #082b2e 0%, #0d4f52 60%, #66c3c6 140%)";

function yen(n: unknown): string {
  const v = Number(n);
  return n == null || !Number.isFinite(v) ? "" : `${v.toLocaleString("ja-JP")}円`;
}

function jpDate(d?: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

async function loadCompany(id: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const filter = id.includes("-") ? `id=eq.${encodeURIComponent(id)}` : `ticker=eq.${encodeURIComponent(id.toUpperCase())}`;
  const select = "name,ticker,exchange,sector,listing_date,price_range_min,price_range_max,ipo_price,score:analysis_summary->total_score,grade:analysis_summary->grade";
  const res = await fetch(`${base}/rest/v1/ipo_companies?select=${encodeURIComponent(select)}&${filter}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = () => Response.redirect(new URL("/ogp.png", req.url), 302);

  try {
    const co = await loadCompany(id);
    if (!co) return fallback();

    const fontData = await fetch(new URL("/fonts/NotoSansJP-Bold.ttf", req.url)).then((r) => r.arrayBuffer());

    const score = co.score != null && Number.isFinite(Number(co.score)) ? Math.round(Number(co.score)) : null;
    const grade = typeof co.grade === "string" && co.grade ? co.grade : null;
    const name = truncate(String(co.name ?? ""), 26);
    const nameSize = name.length > 18 ? 54 : name.length > 12 ? 64 : 76;
    const ld = jpDate(co.listing_date);
    const pub = yen(co.ipo_price);
    const range = co.price_range_min != null && co.price_range_max != null
      ? (co.price_range_min === co.price_range_max ? yen(co.price_range_min) : `${yen(co.price_range_min)}〜${yen(co.price_range_max)}`)
      : "";
    const meta = [co.exchange ? String(co.exchange) : "", co.sector ? String(co.sector) : ""].filter(Boolean).join(" ・ ");

    const facts: { label: string; value: string }[] = [];
    if (ld) facts.push({ label: "上場日", value: ld });
    if (pub) facts.push({ label: "公募価格", value: pub });
    else if (range) facts.push({ label: "仮条件", value: range });

    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: BG, color: "white", fontFamily: "NotoSansJP", padding: "44px 64px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#66c3c6" }}>AI×IPO分析</div>
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#b3e8ea" }}>大手町調査室九課</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {meta ? <div style={{ display: "flex", fontSize: 26, color: "#b3e8ea", marginBottom: 12 }}>{meta}</div> : null}
              <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
              {co.ticker ? <div style={{ display: "flex", fontSize: 34, color: "#66c3c6", marginTop: 12 }}>{`証券コード ${co.ticker}`}</div> : null}
            </div>
            {score !== null ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 230, height: 230, borderRadius: 115, backgroundColor: "rgba(255,255,255,0.1)", border: "6px solid #66c3c6" }}>
                <div style={{ display: "flex", fontSize: 22, color: "#b3e8ea" }}>AI総合評価</div>
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1 }}>{score}</div>
                  <div style={{ display: "flex", fontSize: 28, color: "#b3e8ea" }}>/100</div>
                </div>
                {grade ? <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#f5c451" }}>{`${grade}ランク`}</div> : null}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {facts.length > 0 ? (
              <div style={{ display: "flex", gap: 20 }}>
                {facts.map((f) => (
                  <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 24px" }}>
                    <div style={{ display: "flex", fontSize: 24, color: "#b3e8ea" }}>{f.label}</div>
                    <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{f.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: 24, color: "#b3e8ea" }}>初値シナリオ・9軸スコアを無料で確認 ｜ ipo.finance-tower.com</div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [{ name: "NotoSansJP", data: fontData, style: "normal", weight: 700 }],
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
      }
    );
  } catch {
    return fallback();
  }
}
