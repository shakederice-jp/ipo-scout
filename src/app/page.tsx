import type { Metadata } from "next";
import TrendsLinkCard from "@/components/TrendsLinkCard";
import CalendarClient from "@/components/CalendarClient";
import { CheckoutButton } from "@/components/CheckoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/get-companies";
import { TOP_FAQ } from "@/lib/ipo-faq";
import { companySlug, todayJst } from "@/lib/jp-format";
import { Zap, Crown, AlertCircle, User } from "lucide-react";

// 2026/9/14改修(追記⑩ロングテールキーワード対応): 「IPOカレンダー」「IPOスケジュール」を
// 前方に出したtitle/descriptionに変更。
// 2026/10/18改修(SEO・GEO対応): 検索されやすい「IPOスケジュール 2026」の形に合わせ、年を
// 自動で入れる(年が変わっても書き換え不要)。タイトルの末尾に「| IPO Scout」が二重に付いていた
// 問題はルートlayout.tsxのtemplate設定が原因で、そちらで解消している。
export async function generateMetadata(): Promise<Metadata> {
  const year = todayJst().slice(0, 4);
  const title = `IPOスケジュール${year}・新規上場一覧｜AI分析レポート｜大手町調査室九課`;
  const description = `${year}年のIPOスケジュール（新規上場一覧）を、上場日・ブックビルディング・申込・ロックアップ解除の日程まで掲載。目論見書をAIが解析した分析レポートで、総合スコアと9軸の詳細分析も読めます。`;
  return {
    title,
    description,
    openGraph: {
      title, description,
      url: "https://ipo.finance-tower.com",
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "website",
      images: [{ url: "https://ipo.finance-tower.com/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title, description,
      images: ["https://ipo.finance-tower.com/ogp.png"],
    },
    alternates: { canonical: "https://ipo.finance-tower.com" },
  };
}

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

  // 2026/10/7追加(GEO対応): 銘柄一覧は、以前はブラウザの中であとから取得していたため、
  // AIの検索・引用ボット(ほとんどがJavaScriptを実行しない)には「読み込み中...」の
  // 空のページにしか見えていなかった。最初のHTMLに実データを含めるため、サーバー側で
  // 先に取得して CalendarClient に渡す(ブラウザ側は従来どおり表示後に再取得して最新化する)。
  const initialCompanies = await getCompanies().catch(() => []);

  // 2026/10/18新設(SEO・GEO対応): 構造化データ(検索エンジン・生成AI向けの目印)。
  // ・FAQPage: 下のよくある質問と同じ内容。
  // ・ItemList: これから上場する銘柄を上場日の順に並べた一覧(銘柄ページは証券コードのURLで統一)。
  const todayStr = todayJst();
  const upcoming = initialCompanies
    .filter((co) => co.listing_date && co.listing_date >= todayStr)
    .sort((a, b) => a.listing_date.localeCompare(b.listing_date))
    .slice(0, 20);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: TOP_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `IPOスケジュール${todayStr.slice(0, 4)} 上場予定の銘柄`,
    itemListElement: upcoming.map((co, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${co.name}（上場日 ${co.listing_date}）`,
      url: `https://ipo.finance-tower.com/analysis/${companySlug(co)}`,
    })),
  };
  const siteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "大手町調査室九課 IPO分析",
    url: "https://ipo.finance-tower.com",
    inLanguage: "ja",
  };

  return (
    <div style={{ backgroundColor:"#f4fbfc", minHeight:"100vh", fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }} />
      {upcoming.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listLd) }} />}

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

      {/* 2026/10/29: ホーム画面に追加の案内は、全ページ共通の下部の帯(layout.tsx → InstallPwaButton)に移した */}


      {/* 2026/9/5追加: 「投資スタイル別IPO分析」という差別化ポイントをトップページ最上部で
          打ち出すコンパクトな帯。IPO当選・デイトレ狙いだけでなく、長期保有を考える層にも
          「自分に合った判断軸がある」と伝える狙い(サイト全体の投資スタイル別訴求、第2弾)。
          カレンダー一覧を大きく圧迫しないよう、あえて小さめの帯タイプにしている。
          9/5追記: 当初は濃いグラデーション背景の枠で囲んでいたが、色が濃すぎるとの
          指摘を受け、枠を撤去してページ背景の上に直接文字を置く形に変更した。 */}
      <div style={{ maxWidth:1200, margin:"16px auto 0", padding:"0 16px" }}>
        {/* 2026/10/18新設(SEO・GEO対応): トップページに見出し(h1)が無かったため追加。
            検索エンジンと生成AIに「このページは何のページか」を最初に伝える。 */}
        <h1 style={{ fontSize:20, fontWeight:900, color:"#082b2e", lineHeight:1.4, margin:"0 0 6px" }}>
          IPOスケジュール{todayJst().slice(0,4)}｜新規上場企業の上場日・申込日程とAI分析
        </h1>
        <div style={{ fontSize:15, fontWeight:900, color:"#082b2e", lineHeight:1.4, marginBottom:4 }}>
          IPO当選・初日の値動きだけじゃない。
        </div>
        <p style={{ fontSize:12, color:"#2a7a7e", margin:0, lineHeight:1.7 }}>
          超短期・短期・長期といった投資スタイル別にAIが多角的に分析を加えた、今までにない画期的なIPO分析サイトです。各銘柄のIPO分析ページにおいては、IPO中・上級者向け分析だけでなく、初心者向けの分析もご用意しています。財務諸表等が読めなくても内容が理解できるようになっています。
        </p>
        {/* 2026/10/18新設(SEO対応): 一覧表・結果・解除予定・申込方法・用語集への入口。
            検索から来た人が1クリックで目的のページへ進めるよう、目立つ位置に置く。 */}
        <nav aria-label="IPO情報メニュー" style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
          {[
            { href:"/schedule", label:"📋 上場スケジュール一覧表", primary:true },
            { href:"/results", label:"📊 初値の結果一覧" },
            { href:"/lockup", label:"🔓 ロックアップ解除予定" },
            { href:"/how-to-apply", label:"📝 IPOの申込方法" },
            { href:"/glossary", label:"📖 IPO用語集" },
          ].map((l) => (
            <a key={l.href} href={l.href} style={{
              fontSize:12, fontWeight:900, textDecoration:"none", whiteSpace:"nowrap",
              padding:"8px 14px", borderRadius:20,
              backgroundColor: l.primary ? "#0d4f52" : "white",
              color: l.primary ? "white" : "#0d4f52",
              border: `1.5px solid ${l.primary ? "#0d4f52" : "#66c3c6"}`,
            }}>{l.label}</a>
          ))}
        </nav>
      </div>

      {/* メインレイアウト */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"16px 16px 40px", display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>

        {/* 左：カレンダー＋IPO一覧 */}
        <div style={{ flex:"1 1 560px", minWidth:0 }}>
          <CalendarClient initialCompanies={initialCompanies} />

          {/* 2026/10/18新設(SEO・GEO対応): IPOの基本のよくある質問。FAQPage構造化データと
              同じ配列(src/lib/ipo-faq.ts)から作るので、見た目と内容が一致する。 */}
          <section aria-label="IPOのよくある質問" style={{ marginTop:20, backgroundColor:"white", border:"1px solid #b3e8ea", borderRadius:16, padding:"16px 18px" }}>
            <h2 style={{ fontSize:15, fontWeight:900, color:"#082b2e", margin:"0 0 12px" }}>IPOのよくある質問</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {TOP_FAQ.map((f, i) => (
                <div key={i}>
                  <h3 style={{ fontSize:13, fontWeight:900, color:"#0d4f52", margin:"0 0 4px" }}>{f.q}</h3>
                  <p style={{ fontSize:12, color:"#334155", lineHeight:1.8, margin:0 }}>{f.a}</p>
                  {f.href && <a href={f.href} style={{ display:"inline-block", marginTop:4, fontSize:12, fontWeight:700, color:"#0d7c82" }}>{f.linkLabel} →</a>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 右：サイドバー */}
        <aside className="top-sidebar" style={{ flex:"0 0 300px", minWidth:280, display:"flex", flexDirection:"column", gap:12 }}>

          {/* 料金プランページへのリンク */}
          <a href="/plans" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#e8f9f9", textDecoration:"none", border:"1.5px solid #66c3c6" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>📋 料金プランを見る</div>
              <div style={{ fontSize:10, color:"#2a7a7e", marginTop:2 }}>無料〜¥4,890/月・有料3プラン比較</div>
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
              <CheckoutButton availablePlans={["plan_a", "plan_b", "plan_c"]} defaultPlan="plan_c" />
              <p style={{ fontSize:10, color:"#64748b", marginTop:10, lineHeight:1.6 }}>
                💡 各IPOレポートの単一購入は、各銘柄の分析ページからお申込みいただけます。
              </p>
            </div>
          </div>

          {/* トレンドページへのリンク */}
          <TrendsLinkCard />

{/* IPO投資ガイドへのリンク */}
<a href="/ipo-guide" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#f0fdf4", textDecoration:"none", border:"1.5px solid #22c55e" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>💡 IPO投資で資産を増やす法則</div>
              <div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>超短期・短期・長期の実践的戦略</div>
            </div>
            <span style={{ fontSize:16, color:"#22c55e" }}>→</span>
          </a>

                   {/* マイページ（冒頭） 2026/9/12改修: 「マイページ・通知設定」だけでは
                       無料でできることが伝わらなかったため、無料会員登録である旨と
                       使える機能を一言添えた(サイト全体のフリー/有料導線見直しの一環)。 */}
          <a href="/mypage" style={{ ...cardStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, padding:"12px 16px", backgroundColor:"#f59e0b", border:"2px solid #d97706", textDecoration:"none", color:"white", boxShadow:"0 2px 8px rgba(245,158,11,0.25)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, fontWeight:900, fontSize:14 }}>
              <User size={16} color="white" />
              👤 マイページ・通知設定
            </div>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>無料会員登録（課金不要）でご利用いただけます</div>
          </a>

          {/* 2026/9/6追加: 紹介プログラムがマイページの奥にしかなく気づかれにくかったため、
              トップページからも露出させる導線。マイページの「友達招待プログラム」に遷移する。 */}
          <a href="/campaign" style={{ ...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", backgroundColor:"#fef2f2", textDecoration:"none", border:"1.5px solid #dc2626" }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:"#082b2e" }}>🎁 友達紹介で有料分析＋週刊スライド2ヶ月読み放題</div>
              <div style={{ fontSize:10, color:"#b91c1c", marginTop:2, fontWeight:700 }}>🎉 先着300名限定キャンペーン実施中</div>
            </div>
            <span style={{ fontSize:16, color:"#dc2626" }}>→</span>
          </a>

{/* サービス説明・免責一言 */}
<div style={{ ...cardStyle, padding:"12px 14px", backgroundColor:"#f8fefe", display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:13, flexShrink:0 }}>📋</span>
            <p style={{ fontSize:10, color:"#2a7a7e", lineHeight:1.8, margin:0 }}>
              本サービスは、IPO銘柄が金融庁に提出する目論見書をAIが解析・要約し、投資判断に役立つ情報を抽出することを目的としています。目論見書に記載のない情報は「不明」「データ不足」と表示されます。AIによる試算・評価であり、投資勧誘ではありません。
            </p>
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
            {[{ label:"B 分析見放題＋通知プラン", price:"¥3,890/月" }, { label:"C フルパックプラン", price:"¥4,890/月" }].map(item => (
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