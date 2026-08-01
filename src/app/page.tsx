import type { Metadata } from "next";
import CalendarClient from "@/components/CalendarClient";
import { CheckoutButton } from "@/components/CheckoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Zap, Crown, AlertCircle, User } from "lucide-react";

export const metadata: Metadata = {
  title: "IPO企業惁E��AI刁E��レポ�Eト｜大手町調査室九課",
  description: "2026年IPO予定企業のAI刁E��レポ�Eト。総合スコア・株価シナリオ・9軸詳細刁E��を掲載。大手町調査室九課が運営、E,
  openGraph: {
    title: "IPO企業惁E��AI刁E��レポ�Eト｜大手町調査室九課",
    description: "2026年IPO予定企業のAI刁E��レポ�Eト。総合スコア・株価シナリオ・9軸詳細刁E��を掲載、E,
    url: "https://ipo.finance-tower.com",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "https://ipo.finance-tower.com/ogp.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO企業惁E��AI刁E��レポ�Eト｜大手町調査室九課",
    description: "2026年IPO予定企業のAI刁E��レポ�Eト。総合スコア・株価シナリオ・9軸詳細刁E��を掲載、E,
    images: ["https://ipo.finance-tower.com/ogp.png"],
  },
  alternates: { canonical: "https://ipo.finance-tower.com" },
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
          <p style={{ fontSize:13, fontWeight:700, color:"#15803d", margin:0 }}>お支払いが完亁E��ました。�Eレミアムプランへようこそ�E�E/p>
        </div>
      )}
      {params.checkout === "cancel" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={14} color="#d97706" />
          <p style={{ fontSize:13, color:"#92400e", margin:0 }}>決済�Eキャンセルされました、E/p>
        </div>
      )}


      {/* メインレイアウチE*/}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"16px 16px 40px", display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>

        {/* 左�E�カレンダー�E�IPO一覧 */}
        <div style={{ flex:"1 1 560px", minWidth:0 }}>
          <CalendarClient />
        </div>

        {/* 右�E�サイドバー */}
        <aside className="top-sidebar" style={{ flex:"0 0 300px", minWidth:280, display:"flex", flexDirection:"column", gap:12 }}>

          {/* トレンド�Eージへのリンク */}
          <a href="/trends" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#0d4f52", border:"2px solid #0d4f52", textDecoration:"none" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:900, color:"white" }}>📡 大手町発マ�EケチE��トレンチE/div>
              <div style={{ fontSize:10, color:"#a0d4d6", marginTop:2 }}>IPO・スタートアチE�E・賁E��調達�E最新動向</div>
            </div>
            <span style={{ fontSize:16, color:"#66c3c6" }}>ↁE/span>
          </a>

{/* IPO投賁E��イドへのリンク */}
<a href="/ipo-guide" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#f0fdf4", textDecoration:"none", border:"1.5px solid #22c55e" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>💡 IPO投賁E��賁E��を増やす法則</div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>趁E��期�E短期�E長期�E実践皁E��略</div>
            </div>
            <span style={{ fontSize:16, color:"#22c55e" }}>ↁE/span>
          </a>

                   {/* マイペ�Eジ�E��E頭�E�E*/}
          <a href="/mypage" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 16px", backgroundColor:"#f59e0b", border:"2px solid #d97706", textDecoration:"none", fontWeight:900, fontSize:14, color:"white", boxShadow:"0 2px 8px rgba(245,158,11,0.25)" }}>
            <User size={16} color="white" />
            👤 マイペ�Eジ・通知設宁E
          </a>

{/* サービス説明�E免責一言 */}
<div style={{ ...cardStyle, padding:"12px 14px", backgroundColor:"#f8fefe", display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:13, flexShrink:0 }}>📋</span>
            <p style={{ fontSize:10, color:"#2a7a7e", lineHeight:1.8, margin:0 }}>
              本サービスは、IPO銘柄が��融庁に提�Eする目論見書をAIが解析�E要紁E��、投賁E��断に役立つ惁E��を抽出することを目皁E��してぁE��す。目論見書に記載�EなぁE��報は「不�E」「データ不足」と表示されます、EIによる試算�E評価であり、投賁E��誘ではありません、E
            </p>
          </div>

          {/* 料��プランペ�Eジへのリンク */}
          <a href="/plans" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#e8f9f9", textDecoration:"none", border:"1.5px solid #66c3c6" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>📋 料��プランを見る</div>
              <div style={{ fontSize:10, color:"#2a7a7e", marginTop:2 }}>無料〜¥2,490/月�E4プラン比輁E/div>
            </div>
            <span style={{ fontSize:16, color:"#66c3c6" }}>ↁE/span>
          </a>

          {/* 購入パネル */}
          <div style={cardStyle}>
            <div style={{ padding:"12px 16px", backgroundColor:"#66c3c6", display:"flex", alignItems:"center", gap:8 }}>
              <Crown size={16} color="#082b2e" />
              <div>
                <div style={{ fontWeight:900, fontSize:13, color:"#082b2e" }}>有料プランのお申込み</div>
                <div style={{ fontSize:10, color:"#0d4f52" }}>Stripeで安�E決渁E🔒</div>
              </div>
            </div>
            <div style={{ padding:16, backgroundColor:"white" }}>
              <CheckoutButton availablePlans={["notify", "report", "complete"]} defaultPlan="notify" />
              <p style={{ fontSize:10, color:"#64748b", marginTop:10, lineHeight:1.6 }}>
                💡 各IPOレポ�Eト�E単一購入は、各銘柄の刁E��ペ�Eジからお申込みぁE��だけます、E
              </p>
            </div>
          </div>

          {/* 通知案�E */}
          <div style={{ ...cardStyle, padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Zap size={16} color="#66c3c6" />
              <span style={{ fontWeight:900, fontSize:13, color:"#082b2e" }}>通知サービス</span>
            </div>
            <p style={{ fontSize:12, color:"#2a7a7e", lineHeight:1.7, margin:"0 0 12px" }}>
              上場日・BB・申込開始�EロチE��アチE�E解除めEstrong style={{ color:"#082b2e" }}>前週金曜日18晁E/strong>にまとめてお届けします、E
            </p>
            {[{ label:"通知プラン", price:"¥890/朁E }, { label:"コンプリートパチE��", price:"¥2,490/朁E }].map(item => (
              <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderRadius:10, padding:"8px 12px", marginBottom:6, backgroundColor:"#f4fbfc", border:"1px solid #dff3f4" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#0d4f52" }}>{item.label}</span>
                <span style={{ fontSize:11, fontWeight:900, color:"#66c3c6" }}>{item.price}</span>
              </div>
            ))}
          </div>

        </aside>
      </div>


      {/* フッター */}
      <footer style={{ borderTop:"1px solid #b3e8ea", backgroundColor:"white", padding:"24px 16px", textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:10 }}>
        <a href="/tokushoho" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>特定商取引法に基づく表訁E/a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/privacy" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>プライバシーポリシー</a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/contact" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>お問ぁE��わせ</a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/guide" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>こ�Eサイト�E使ぁE��</a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/plans" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>料��プラン</a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/trends" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>📡 マ�EケチE��トレンチE/a>
          <span style={{ color:"#e2e8f0" }}>|</span>
          <a href="/ipo-guide" style={{ fontSize:11, color:"#66c3c6", textDecoration:"none" }}>💡 IPO投賁E�E法則</a>
        </div>
        <p style={{ fontSize:10, color:"#94a3b8", lineHeight:1.7, margin:0 }}>
          本サービスの刁E��・スコアはAIによる試算値であり、投賁E��誘ではありません、Ebr/>
          最終的な投賁E��断はご�E身の責任のもとで行ってください、Ebr/>
          © 2026 大手町調査室九課�E�本サービスのコンチE��チE�EAI刁E��結果の無断転載�E褁E��を禁じます、E
        </p>
      </footer>
    </div>
  );
}