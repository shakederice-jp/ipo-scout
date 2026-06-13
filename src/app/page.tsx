import type { Metadata } from "next";
import RefferalSection from "@/components/RefferalSection";
export const metadata: Metadata = {
  title: "IPO企業情報AI分析レポート｜大手町調査室九課",
  description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。大手町調査室九課が運営。",
  openGraph: {
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
    url: "https://ipo-scout-six.vercel.app",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
  },
  alternates: {
    canonical: "https://ipo-scout-six.vercel.app",
  },
};

import { fetchIpoCompanies, createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutButton } from "@/components/CheckoutButton";
import {
  BarChart2, Calendar, Star, Lock, TrendingUp,
  Building2, Zap, AlertCircle, Crown
} from "lucide-react";

const FREE_LIMIT = 3;

function formatDate(value: string | null) {
  if (!value) return "未定";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dow = ["日","月","火","水","木","金","土"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日（${dow}）`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; dot: string }> = {
    "上場日":             { bg:"#fef2f2", color:"#b91c1c", dot:"#ef4444" },
    "公募申込中":         { bg:"#fffbeb", color:"#b45309", dot:"#f59e0b" },
    "ブックビルディング": { bg:"#e8f9f9", color:"#0d4f52", dot:"#66c3c6" },
    "上場済み":           { bg:"#f1f5f9", color:"#64748b", dot:"#94a3b8" },
  };
  const s = map[status] ?? map["ブックビルディング"];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold"
      style={{ fontSize:"10px", backgroundColor: s.bg, color: s.color }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }}/>
      {status}
    </span>
  );
}

function IpoCard({
  company, order,
}: {
  company: {
    id: string;
    name: string;
    ticker?: string | null;
    sector?: string | null;
    listing_date?: string | null;
    status: string;
    highlight: boolean;
    ai_summary?: string | null;
    ai_score?: number | null;
    [key: string]: unknown;
  };
  order: number;
})
{
  const isFree = (company as any).is_free === true;
  const CIRCLED = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩",
                   "⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
  const circled = CIRCLED[order - 1] ?? `(${order})`;

  return (
    <article className="rounded-2xl transition-all hover:shadow-md"
      style={{
        backgroundColor:"white",
        border:`2px solid ${company.highlight ? "#fde68a" : "#dff3f4"}`,
        padding:"16px 18px",
      }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="font-black text-2xl leading-none"
            style={{ color: isFree ? "#0d4f52" : "#9ca3af" }}>
            {circled}
          </span>
          <span className="font-bold rounded-full px-2 py-0.5"
            style={{ fontSize:"9px",
              backgroundColor: isFree ? "#dcfce7" : "#fef3c7",
              color: isFree ? "#15803d" : "#92400e" }}>
            {isFree ? "無料" : "有料"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {company.highlight && <Star size={13} style={{ color:"#d97706" }} fill="#d97706"/>}
            <h3 className="font-black text-base leading-tight" style={{ color:"#082b2e" }}>
              {company.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={company.status}/>
            {company.sector && (
              <span style={{ fontSize:"11px", color:"#2a7a7e" }}>{company.sector}</span>
            )}
            {company.ticker && (
              <span className="font-bold" style={{ fontSize:"11px", color:"#66c3c6" }}>
                {company.ticker}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold" style={{ fontSize:"10px", color:"#2a7a7e" }}>上場想定日</div>
          <div className="font-black" style={{ fontSize:"12px", color:"#082b2e" }}>
          {formatDate(company.listing_date as string | null)}
          </div>
        </div>
      </div>

      {isFree ? (
        <div className="rounded-xl p-3"
          style={{ backgroundColor:"#f4fbfc", border:"1px solid #dff3f4" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={11} style={{ color:"#66c3c6" }}/>
            <span className="font-bold" style={{ fontSize:"10px", color:"#2a7a7e" }}>AI分析要約</span>
          </div>
          <p style={{ fontSize:"12px", color:"#0d4f52", lineHeight:"1.7" }}>
            {company.ai_summary ?? "要約は未登録です。"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl p-3"
          style={{ backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Lock size={11} style={{ color:"#d97706" }}/>
            <span className="font-bold" style={{ fontSize:"10px", color:"#92400e" }}>
              AI分析要約（プレミアム会員または¥500の単品購入で閲覧）
            </span>
          </div>
          <p style={{ fontSize:"11px", color:"#b45309" }}>
            超短期・短期・長期の9軸スコア、経営陣プロファイル、競合比較、
            ロックアップカレンダーを含む完全レポートを閲覧できます。
          </p>
        </div>
      )}
    </article>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const supabase = createSupabaseServerClient();
const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
const userId = session?.user?.id ?? null;
  const { data: companies, error } = await fetchIpoCompanies();
  const list = companies ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor:"#f4fbfc",
      fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

      {/* ナビゲーションバー */}
      

      {/* 決済結果バナー */}
      {params.checkout === "success" && (
        <div className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ backgroundColor:"#dcfce7", border:"1px solid #bbf7d0" }}>
          <span style={{ fontSize:"16px" }}>🎉</span>
          <p className="text-sm font-bold" style={{ color:"#15803d" }}>
            お支払いが完了しました。プレミアムプランへようこそ！
          </p>
        </div>
      )}
      {params.checkout === "cancel" && (
        <div className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={14} style={{ color:"#d97706" }}/>
          <p className="text-sm" style={{ color:"#92400e" }}>
            決済はキャンセルされました。必要な際にまたお試しください。
          </p>
        </div>
      )}

      {/* 無料枠の説明 */}
      <div className="mx-4 mt-4 rounded-2xl px-4 py-3 flex items-start gap-3"
        style={{ backgroundColor:"#e8f9f9", border:"1.5px solid #b3e8ea" }}>
        <div className="rounded-xl p-2 shrink-0" style={{ backgroundColor:"#66c3c6" }}>
          <TrendingUp size={16} className="text-white"/>
        </div>
        <div>
          <div className="font-black mb-0.5" style={{ fontSize:"14px", color:"#082b2e" }}>
            まず無料でお試しください
          </div>
          <p style={{ fontSize:"12px", color:"#2a7a7e", lineHeight:"1.7" }}>
            毎月、日付順で最初の
            <span className="font-black" style={{ color:"#082b2e" }}>3銘柄の分析レポートは完全無料</span>
            でご覧いただけます。特定銘柄だけをピックアップして読む場合は¥500です。
          </p>
        </div>
      </div>

      <a href="/calendar" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 24px", margin:"0 16px 12px", backgroundColor:"#66c3c6", color:"white", textDecoration:"none", borderRadius:10, fontWeight:700, fontSize:15 }}><span style={{ fontSize:18 }}>📅</span> IPOカレンダーを見る →</a>

<main className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6 items-start">

  {/* 左：銘柄一覧 */}
        <section className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} style={{ color:"#66c3c6" }}/>
            <h2 className="font-black text-lg" style={{ color:"#082b2e" }}>IPO予定企業一覧</h2>
          </div>
          {error ? (
            <div className="rounded-2xl p-5"
              style={{ backgroundColor:"#fef2f2", border:"1px solid #fecaca" }}>
              <p className="font-black text-sm mb-1" style={{ color:"#b91c1c" }}>データ取得エラー</p>
              <p className="text-sm" style={{ color:"#991b1b" }}>{error}</p>
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl p-8 text-center"
              style={{ backgroundColor:"white", border:"1px solid #dff3f4" }}>
              <p style={{ color:"#2a7a7e", fontSize:"13px" }}>
                表示できる企業がありません。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const monthOrderMap: Record<string, number> = {};
                return list.map((company) => {
                  const monthKey = (company.listing_date ?? "unknown").slice(0, 7);
                  monthOrderMap[monthKey] = (monthOrderMap[monthKey] ?? 0) + 1;
                  const order = monthOrderMap[monthKey];
                  return (
                    <a key={company.id} href={`/analysis/${company.id}`} style={{textDecoration:"none"}}>
                      <IpoCard company={company as any} order={order}/>
                    </a>
                  );
                });
              })()}
            </div>
          )}
        </section>
        

        {/* 右：サイドバー */}
        <aside className="w-full lg:w-80 lg:sticky lg:top-20 space-y-4 shrink-0">

          {/* 購入パネル */}
          <div className="rounded-2xl overflow-hidden" style={{ border:"2px solid #b3e8ea" }}>
            <div className="px-4 py-3" style={{ backgroundColor:"#66c3c6" }}>
              <div className="flex items-center gap-2">
                <Crown size={16} style={{ color:"#082b2e" }}/>
                <span className="font-black text-sm" style={{ color:"#082b2e" }}>
                  プレミアム資料の購入
                </span>
              </div>
              <p style={{ fontSize:"10px", marginTop:"2px", color:"#0d4f52" }}>
                Stripeで安全決済 🔒
              </p>
            </div>
            <div className="p-4 bg-white">
              <CheckoutButton/>
            </div>
          </div>

          {/* 通知案内 */}
          <div className="rounded-2xl p-4" style={{ backgroundColor:"white", border:"1px solid #dff3f4" }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} style={{ color:"#66c3c6" }}/>
              <span className="font-black text-sm" style={{ color:"#082b2e" }}>通知サービス</span>
            </div>
            <p style={{ fontSize:"12px", color:"#2a7a7e", lineHeight:"1.7" }}>
              上場日・BB・申込開始・ロックアップ解除を
              <span className="font-bold" style={{ color:"#082b2e" }}>前週金曜日18時</span>
              にまとめてお届けします。
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                { label:"通知プラン",       price:"¥890/月" },
                { label:"コンプリートパック", price:"¥2,490/月" },
              ].map(item => (
                <div key={item.label}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ backgroundColor:"#f4fbfc", border:"1px solid #dff3f4" }}>
                  <span className="font-bold" style={{ fontSize:"11px", color:"#0d4f52" }}>
                    {item.label}
                  </span>
                  <span className="font-black" style={{ fontSize:"11px", color:"#66c3c6" }}>
                    {item.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <RefferalSection userId={userId ?? "test"} />
        </aside>
      </main>
      <a href="/calendar" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 24px", margin:"12px 16px 0", backgroundColor:"#66c3c6", color:"white", textDecoration:"none", borderRadius:10, fontWeight:700, fontSize:15 }}><span style={{ fontSize:18 }}>📅</span> IPOカレンダーを見る →</a>
      {/* フッター */}
      <footer className="border-t mt-8 px-4 py-6 text-center"
        style={{ borderColor:"#b3e8ea", backgroundColor:"white" }}>
        <p style={{ fontSize:"10px", color:"#94a3b8", lineHeight:"1.7" }}>
          本サービスの分析・スコアはAIによる試算値であり、投資勧誘ではありません。<br/>
          最終的な投資判断はご自身の責任のもとで行ってください。<br/>
          © 2025 大手町調査室九課
        </p>
      </footer>
    </div>
  );
}
