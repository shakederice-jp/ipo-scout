import type { Metadata } from "next";
import CalendarClient from "@/components/CalendarClient";
import { CheckoutButton } from "@/components/CheckoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Zap, Crown, AlertCircle, User } from "lucide-react";

export const metadata: Metadata = {
  title: "IPO企業情報AI分析レポート｜大手町調査室九課",
  description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。大手町調査室九課が運営。",
  openGraph: {
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
    url: "https://ipo.finance-tower.com",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "https://ipo.finance-tower.com/ogp.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO企業情報AI分析レポート｜大手町調査室九課",
    description: "2026年IPO予定企業のAI分析レポート。総合スコア・株価シナリオ・9軸詳細分析を掲載。",
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
          <p style={{ fontSize:13, fontWeight:700, color:"#15803d", margin:0 }}>お支払いが完了しました。プレミアムプランへようこそ！</p>
        </div>
      )}
      {params.checkout === "cancel" && (
        <div style={{ margin:"12px 16px 0", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={14} color="#d97706" />
          <p style={{ fontSize:13, color:"#92400e", margin:0 }}>決済はキャンセルされました。</p>
        </div>
      )}


      {/* 2026/9/5追加: 「投資スタイル別IPO分析」という差別化ポイントをトップページ最上部で
          打ち出すコンパクトな帯。IPO当選・デイトレ狙いだけでなく、長期保有を考える層にも
          「自分に合った判断軸がある」と伝える狙い(サイト全体の投資スタイル別訴求、第2弾)。
          カレンダー一覧を大きく圧迫しないよう、あえて小さめの帯タイプにしている。
          9/5追記: 当初は濃いグラデーション背景の枠で囲んでいたが、色が濃すぎるとの
          指摘を受け、枠を撤去してページ背景の上に直接文字を置く形に変更した。 */}
      <div style={{ maxWidth:1200, margin:"16px auto 0", padding:"0 16px" }}>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div style={{ flex:"1 1 320px" }}>
            <div style={{ fontSize:15, fontWeight:900, color:"#082b2e", lineHeight:1.4, marginBottom:4 }}>
              IPO当選・初日の値動きだけじゃない。
            </div>
            <p style={{ fontSize:12, color:"#2a7a7e", margin:0, lineHeight:1.7 }}>
              超短期・短期・長期といった投資スタイル別にAIが多角的に分析を加えた、今までにない画期的なIPO分析サイトです。
            </p>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:900, color:"#b91c1c", backgroundColor:"#fee2e2", borderRadius:20, padding:"5px 12px" }}>⚡ 超短期</span>
            <span style={{ fontSize:11, fontWeight:900, color:"#92400e", backgroundColor:"#fef3c7", borderRadius:20, padding:"5px 12px" }}>📈 短期</span>
            <span style={{ fontSize:11, fontWeight:900, color:"#5b21b6", backgroundColor:"#ede9fe", borderRadius:20, padding:"5px 12px" }}>🌱 長期</span>
          </div>
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

          {/* トレンドページへのリンク */}
          <a href="/trends" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#0d4f52", border:"2px solid #0d4f52", textDecoration:"none" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:900, color:"white" }}>📡 大手町発マーケットトレンド</div>
              <div style={{ fontSize:10, color:"#a0d4d6", marginTop:2 }}>IPO・スタートアップ・資金調達の最新動向</div>
            </div>
            <span style={{ fontSize:16, color:"#66c3c6" }}>→</span>
          </a>

{/* IPO投資ガイドへのリンク */}
<a href="/ipo-guide" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#f0fdf4", textDecoration:"none", border:"1.5px solid #22c55e" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>💡 IPO投資で資産を増やす法則</div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>超短期・短期・長期の実践的戦略</div>
            </div>
            <span style={{ fontSize:16, color:"#22c55e" }}>→</span>
          </a>

                   {/* マイページ（冒頭） */}
          <a href="/mypage" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 16px", backgroundColor:"#f59e0b", border:"2px solid #d97706", textDecoration:"none", fontWeight:900, fontSize:14, color:"white", boxShadow:"0 2px 8px rgba(245,158,11,0.25)" }}>
            <User size={16} color="white" />
            👤 マイページ・通知設定
          </a>

{/* サービス説明・免責一言 */}
<div style={{ ...cardStyle, padding:"12px 14px", backgroundColor:"#f8fefe", display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:13, flexShrink:0 }}>📋</span>
            <p style={{ fontSize:10, color:"#2a7a7e", lineHeight:1.8, margin:0 }}>
              本サービスは、IPO銘柄が金融庁に提出する目論見書をAIが解析・要約し、投資判断に役立つ情報を抽出することを目的としています。目論見書に記載のない情報は「不明」「データ不足」と表示されます。AIによる試算・評価であり、投資勧誘ではありません。
            </p>
          </div>

          {/* 料金プランページへのリンク */}
          <a href="/plans" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#e8f9f9", textDecoration:"none", border:"1.5px solid #66c3c6" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>📋 料金プランを見る</div>
              <div style={{ fontSize:10, color:"#2a7a7e", marginTop:2 }}>無料〜¥2,490/月・4プラン比較</div>
            </div>
            <span style={{ fontSize:16, color:"#66c3c6" }}>→</span>
          </a>

          {/* 購入パネル */}
          <div style={cardStyle}>
            <div style={{ padding:"12px 16px", backgroundColor:"#66c3c6", display:"flex", alignItems:"center", gap:8 }}>
              <Crown size={16} color="#082b2e" />
              <div>
                <div style={{ fontWeight:900, fontSize:13, color:"#082b2e" }}>有料プランのお申込み</div>
                <div style={{ fontSize:10, color:"#0d4f52" }}>Stripeで安全決済 🔒</div>
              </div>
            </div>
            <div style={{ padding:16, backgroundColor:"white" }}>
              <CheckoutButton availablePlans={["notify", "report", "complete"]} defaultPlan="notify" />
              <p style={{ fontSize:10, color:"#64748b", marginTop:10, lineHeight:1.6 }}>
                💡 各IPOレポートの単一購入は、各銘柄の分析ページからお申込みいただけます。
              </p>
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

        </aside>
      </div>
    </div>
  );
}