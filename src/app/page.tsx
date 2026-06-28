import type { Metadata } from "next";
import RefferalSection from "@/components/RefferalSection";
import CalendarClient from "@/components/CalendarClient";
import { CheckoutButton } from "@/components/CheckoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrendingUp, Zap, Crown, AlertCircle, User } from "lucide-react";

export const metadata: Metadata = {
  title: "IPO企業情報AI分析レポート｜大手町調査室九課",
  description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。大手町調査室九課が運営。",
  openGraph: {
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
    url: "https://ipo-jp.vercel.app",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "https://ipo-jp.vercel.app/ogp.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
    images: ["https://ipo-jp.vercel.app/ogp.png"],
  },
  alternates: { canonical: "https://ipo-jp.vercel.app" },
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "white",
  borderRadius: 16,
  border: "1px solid #b3e8ea",
  overflow: "hidden",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const supabase = createSupabaseServerClient();
  const { data: { session } } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const userId = session?.user?.id ?? null;

  return (
    <div style={{ backgroundColor:"#f4fbfc", minHeight:"100vh", fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

<style>{`
        @media (max-width: 700px) {
          .top-sidebar { flex: 1 1 100% !important; min-width: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* 決済結果バナー */}
      {params.checkout === "success" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#dcfce7", border:"1px solid #bbf7d0" }}>
          <span style={{ fontSize:16 }}>🎉</span>
          <p style={{ fontSize:13, fontWeight:700, color:"#15803d", margin:0 }}>お支払いが完了しました。プレミアムプランへようこそ！</p>
        </div>
      )}
      {params.checkout === "cancel" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={14} color="#d97706" />
          <p style={{ fontSize:13, color:"#92400e", margin:0 }}>決済はキャンセルされました。</p>
        </div>
      )}

      {/* リード文 */}
      <div style={{ margin:"12px 16px 0", ...cardStyle, padding:"14px 16px", display:"flex", alignItems:"flex-start", gap:12, backgroundColor:"#e8f9f9", border:"1.5px solid #b3e8ea" }}>
        <div style={{ borderRadius:10, padding:8, backgroundColor:"#66c3c6", flexShrink:0 }}>
          <TrendingUp size={16} color="white" />
        </div>
        <div>
          <div style={{ fontWeight:900, fontSize:14, color:"#082b2e", marginBottom:2 }}>まず無料でお試しください</div>
          <p style={{ fontSize:12, color:"#2a7a7e", lineHeight:1.7, margin:0 }}>
            毎月、日付順で最初の<strong style={{ color:"#082b2e" }}>2銘柄の分析レポートは完全無料</strong>でご覧いただけます。特定銘柄だけをピックアップして読む場合は¥500です。
          </p>
        </div>
      </div>

      {/* メインレイアウト */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"16px 16px 40px", display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>

        {/* 左：カレンダー＋IPO一覧 */}
        <div style={{ flex:"1 1 560px", minWidth:0 }}>
          <CalendarClient />
        </div>

        {/* 右：サイドバー */}
        <aside className="top-sidebar" style={{ flex:"0 0 300px", minWidth:280, display:"flex", flexDirection:"column", gap:12 }}>

          {/* マイページ（冒頭） */}
          <a href="/mypage" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 16px", backgroundColor:"#f59e0b", border:"2px solid #d97706", textDecoration:"none", fontWeight:900, fontSize:14, color:"white", boxShadow:"0 2px 8px rgba(245,158,11,0.25)" }}>
            <User size={16} color="white" />
            👤 マイページ・通知設定
          </a>

          {/* 購入パネル */}
          <div style={cardStyle}>
            <div style={{ padding:"12px 16px", backgroundColor:"#66c3c6", display:"flex", alignItems:"center", gap:8 }}>
              <Crown size={16} color="#082b2e" />
              <div>
                <div style={{ fontWeight:900, fontSize:13, color:"#082b2e" }}>プレミアム資料の購入</div>
                <div style={{ fontSize:10, color:"#0d4f52" }}>Stripeで安全決済 🔒</div>
              </div>
            </div>
            <div style={{ padding:16, backgroundColor:"white" }}>
              <CheckoutButton />
            </div>
          </div>

          {/* 通知案内 */}
          <div style={{ ...cardStyle, padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Zap size={16} color="#66c3c6" />
              <span style={{ fontWeight:900, fontSize:13, color:"#082b2e" }}>通知サービス</span>
            </div>
            <p style={{ fontSize:12, color:"#2a7a7e", lineHeight:1.7, margin:"0 0 12px" }}>
              上場日・BB・申込開始・ロックアップ解除を<strong style={{ color:"#082b2e" }}>前週金曜日18時</strong>にまとめてお届けします。
            </p>
            {[{ label:"通知プラン", price:"¥890/月" }, { label:"コンプリートパック", price:"¥2,490/月" }].map(item => (
              <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderRadius:10, padding:"8px 12px", marginBottom:6, backgroundColor:"#f4fbfc", border:"1px solid #dff3f4" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#0d4f52" }}>{item.label}</span>
                <span style={{ fontSize:11, fontWeight:900, color:"#66c3c6" }}>{item.price}</span>
              </div>
            ))}
          </div>

          <RefferalSection userId={userId ?? "test"} />
        </aside>
      </div>

      {/* フッター */}
      <footer style={{ borderTop:"1px solid #b3e8ea", backgroundColor:"white", padding:"24px 16px", textAlign:"center" }}>
        <p style={{ fontSize:10, color:"#94a3b8", lineHeight:1.7, margin:0 }}>
          本サービスの分析・スコアはAIによる試算値であり、投資勧誘ではありません。<br/>
          最終的な投資判断はご自身の責任のもとで行ってください。<br/>
          © 2025 大手町調査室九課
        </p>
      </footer>
    </div>
  );
}