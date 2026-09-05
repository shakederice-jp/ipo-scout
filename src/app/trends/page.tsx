"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SECTOR_EMOJI: Record<string, string> = {
  "AI・機械学習": "🤖",
  "フィンテック": "💳",
  "半導体": "⚡",
  "ヘルスケア": "🏥",
  "SaaS・クラウド": "☁️",
  "小売・EC": "🛒",
  "製造・ロボット": "🦾",
  "エネルギー": "🔋",
  "不動産・建設": "🏗️",
  "その他": "📌",
};

// カテゴリー(=記事のテーマ)一覧。right="true"のものはタイトルの前方一致で判定する
// (「初値・その後の値動き(◯◯社・上場◯日目)」のように銘柄名等が末尾に付くため)。
// 2026/9/2: 「大株主・VC/PEの異動ウォッチ」は廃止し、「初値・その後の値動き」
// 「IPO投資ワンポイント講座」に入れ替えた。同日、さらに3テーマ
// (ロックアップ解除カウントダウン・経済指標イベント速報・IPO企業vs競合の決算比較)を追加。
// 2026/9/4: 「ビジネスモデル・ストーリー・競合との違い」を追加
// (分析ページの無料公開3要素の凝縮版、STEP8「深掘り3要素」で生成)。
const CATEGORIES: { label: string; emoji: string; prefix?: boolean }[] = [
  { label: "新規IPO紹介", emoji: "🆕", prefix: true },
  { label: "直近承認銘柄のスコア傾向", emoji: "📊" },
  { label: "ロックアップ解除カレンダー", emoji: "🔓" },
  { label: "IPOカレンダー", emoji: "📅" },
  { label: "週内の重要経済指標カレンダー", emoji: "📈" },
  { label: "初値・その後の値動き", emoji: "💹", prefix: true },
  { label: "IPO投資ワンポイント講座", emoji: "📘" },
  { label: "ロックアップ解除カウントダウン", emoji: "⏳", prefix: true },
  { label: "経済指標・イベント速報", emoji: "📰", prefix: true },
  { label: "IPO企業 vs 競合の決算比較", emoji: "⚖️", prefix: true },
  { label: "ビジネスモデル・ストーリー・競合との違い", emoji: "💼", prefix: true },
];

// テーマ記事のtitleから、対応するカテゴリー(右カラムのカテゴリーと同じ定義)を判定する。
// 記事上部のバッジ表示とサイドバーのカテゴリー名を共通化するために使う。
function categoryForArticle(title: string) {
  return CATEGORIES.find((c) => (c.prefix ? title.startsWith(c.label) : title === c.label)) ?? null;
}

// 記事本文(content)は、Xにそのままコピペしても崩れないようにプレーンテキストで
// 保存している(URLも裸のURLのまま)。そのため画面表示ではリンクにならず、
// 「続きは大手町調査室９課公式HPで読む」の文字や末尾のURLがただの文字列に見えてしまっていた。
// ここでは保存データ自体は変えず、表示時だけ「CTAの文言」と「本文中の裸のURL」を
// クリックできるリンクに変換する(2026/8/29)。
const TRENDS_CTA_PHRASE = "続きは大手町調査室９課公式HPで読む";
function renderTrendContent(content: string): React.ReactNode {
  const urlRegex = /https?:\/\/\S+/g;
  const firstUrlMatch = content.match(urlRegex);
  const primaryUrl = firstUrlMatch ? firstUrlMatch[0] : null;
  if (!primaryUrl) return content;

  const linkStyle: React.CSSProperties = { color: "#0d4f52", fontWeight: 700, textDecoration: "underline", wordBreak: "break-all" };
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  // CTAの文言が含まれていれば、その文言自体を分析ページへのリンクにする
  const ctaIndex = remaining.indexOf(TRENDS_CTA_PHRASE);
  if (ctaIndex !== -1) {
    parts.push(remaining.slice(0, ctaIndex));
    parts.push(
      <a key={`cta-${key++}`} href={primaryUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {TRENDS_CTA_PHRASE}
      </a>
    );
    remaining = remaining.slice(ctaIndex + TRENDS_CTA_PHRASE.length);
  }

  // 残りの部分にある裸のURLもリンクにする(CTAが無い記事や、末尾に単独で出てくるURL行向け)
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  urlRegex.lastIndex = 0;
  while ((m = urlRegex.exec(remaining)) !== null) {
    parts.push(remaining.slice(lastIndex, m.index));
    parts.push(
      <a key={`url-${key++}`} href={m[0]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[0]}
      </a>
    );
    lastIndex = m.index + m[0].length;
  }
  parts.push(remaining.slice(lastIndex));

  return parts;
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "white",
  borderRadius: 16,
  border: "1px solid #b3e8ea",
  overflow: "hidden",
};

export default function TrendsPage() {
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "featured">("featured");

  // カテゴリー別アーカイブ用の状態。カテゴリーを選ぶと、直近100件のウィンドウに
  // 縛られず、そのカテゴリーの過去記事をまとめて取得し直す。
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryArticles, setCategoryArticles] = useState<any[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  // お気に入り保存(有料プラン会員限定)のボタン状態と通知トースト
  const [favoriteStatus, setFavoriteStatus] = useState<Record<string, "saving" | "saved">>({});
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);

  // 「新規IPO紹介」記事の文章(X投稿用)をワンタップでコピーするためのボタン用。
  // navigator.clipboard が使えない環境(古いブラウザ等)向けに、失敗時は
  // テキストエリア+選択状態にする代替手段を用意しておく。
  const handleCopyText = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setFavoriteMessage("文章をコピーしました。Xの投稿画面に貼り付けてください");
    } catch {
      setFavoriteMessage("コピーに失敗しました。お手数ですが文章を選択してコピーしてください");
    }
  };

  const handleFavorite = async (t: any) => {
    setFavoriteStatus(prev => ({ ...prev, [t.id]: "saving" }));
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTrendsId: t.id,
          title: t.title,
          content: t.content,
          sector: t.sector,
          sourceLinks: t.source_links,
          fetchedAt: t.fetched_at,
        }),
      });
      if (res.status === 401) {
        setFavoriteMessage("お気に入り保存にはログインが必要です");
      } else if (res.status === 403) {
        setFavoriteMessage("お気に入り保存は有料プラン会員限定の機能です(記事の単体購入のみの方は対象外です)");
      } else if (!res.ok) {
        setFavoriteMessage("保存に失敗しました。時間をおいて再度お試しください");
      } else {
        setFavoriteStatus(prev => ({ ...prev, [t.id]: "saved" }));
        setFavoriteMessage("お気に入りに保存しました");
        return;
      }
    } catch {
      setFavoriteMessage("保存に失敗しました。時間をおいて再度お試しください");
    }
    setFavoriteStatus(prev => {
      const next = { ...prev };
      delete next[t.id];
      return next;
    });
  };

  useEffect(() => {
    const fetchTrends = async () => {
      // 以前は sector_score(スコア)を最優先で並べていたため、スコアが高い
      // 古い記事(例: sector_score:9の8/8〜8/10の記事)がいつまでもページ最上部に
      // 居座り続け、その後どれだけ新しい記事が追加されても(theme記事は
      // sector_score:8固定のため)上に出てこない、という不具合が起きていた。
      // 「毎日更新される最新ニュース一覧」なので、まず日付の新しい順に並べる。
      const { data } = await supabase
        .from("market_trends")
        .select("*")
        .order("fetched_at", { ascending: false })
        .order("sector_score", { ascending: false })
        .limit(20);
      setTrends(data ?? []);
      setLoading(false);
    };
    fetchTrends();

    // カテゴリーごとの件数(サイドバー表示用)。1件ずつでも過去記事があると
    // 分かるように、直近20件のウィンドウとは別に、DB全体から数える。
    const fetchCategoryCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        CATEGORIES.map(async (c) => {
          const base = supabase.from("market_trends").select("id", { count: "exact", head: true });
          const { count } = c.prefix ? await base.ilike("title", `${c.label}%`) : await base.eq("title", c.label);
          counts[c.label] = count ?? 0;
        })
      );
      setCategoryCounts(counts);
    };
    fetchCategoryCounts();
  }, []);

  // カテゴリーを選んだら、そのカテゴリーの過去記事をまとめて取得し直す
  useEffect(() => {
    if (!activeCategory) {
      setCategoryArticles([]);
      return;
    }
    const cat = CATEGORIES.find((c) => c.label === activeCategory);
    if (!cat) return;
    setCategoryLoading(true);
    const fetchCategoryArticles = async () => {
      const base = supabase
        .from("market_trends")
        .select("*")
        .order("fetched_at", { ascending: false })
        .limit(60);
      const { data } = cat.prefix ? await base.ilike("title", `${cat.label}%`) : await base.eq("title", cat.label);
      setCategoryArticles(data ?? []);
      setCategoryLoading(false);
    };
    fetchCategoryArticles();
  }, [activeCategory]);

  // カテゴリー選択中はアーカイブ一覧を、それ以外は通常の最新一覧(更新順)を表示する
  const articlesToShow = activeCategory ? categoryArticles : trends;
  const showLoading = activeCategory ? categoryLoading : loading;

  const updatedAt = trends[0]?.fetched_at
    ? new Date(trends[0].fetched_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc" }}>

      <style>{`
        @media (max-width: 700px) {
          .trends-sidebar { flex: 1 1 100% !important; min-width: 0 !important; max-width: 100% !important; order: -1; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 40px", display: "flex", flexWrap: "wrap" as const, gap: 16, alignItems: "flex-start" }}>

        {/* 左：メインコンテンツ */}
        <div style={{ flex: "1 1 560px", minWidth: 0 }}>

          {/* ヘッダー */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>📡</span>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#082b2e", margin: 0 }}>
                大手町発マーケットトレンド
              </h1>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>
              IPO・スタートアップ・資金調達の最新動向を毎日3回情報をチェックし、動きがあった時だけ更新
              {updatedAt && <span style={{ marginLeft: 8, color: "#66c3c6" }}>最終更新: {updatedAt}</span>}
            </p>
            {/* 2026/9/5追加: サイト全体の「投資スタイル別IPO分析」訴求(第4弾)。
                トップページ・料金プランページと同じ強めのトーンで、トレンドページにも
                投資スタイル別の視点を打ち出す一文を追加。 */}
            <p style={{ fontSize: 12, color: "#2a7a7e", fontWeight: 700, margin: 0, lineHeight: 1.7 }}>
              超短期・短期・長期といった投資スタイル別の視点も交えてお届けする、今までにない画期的なマーケットトレンド情報です。
            </p>
          </div>

          {activeCategory ? (
            /* カテゴリー選択中: アーカイブ一覧のヘッダー */
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>🗂 カテゴリー</div>
                <h2 style={{ fontSize: 15, fontWeight: 900, color: "#082b2e", margin: 0 }}>
                  {activeCategory}の記事一覧({categoryCounts[activeCategory] ?? categoryArticles.length}件)
                </h2>
              </div>
              <button onClick={() => setActiveCategory(null)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #66c3c6", cursor: "pointer", fontSize: 12,
                  backgroundColor: "#f0fdf4", color: "#0d4f52", fontWeight: 700 }}>
                ← 最新の記事に戻る
              </button>
            </div>
          ) : (
            <>
              {/* 今日の最新記事(更新順であることの案内) */}
              {trends.length > 0 && (
                <div style={{ background: "white", borderRadius: 12, padding: "14px 20px", marginBottom: 20,
                  border: "1px solid #b3e8ea", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📰</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#082b2e" }}>今日の最新記事</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>上にいくほど新しい記事です</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 記事一覧(最新一覧・カテゴリーアーカイブ共通) */}
          {showLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>読み込み中...</div>
          ) : articlesToShow.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
              {activeCategory ? "このカテゴリーの記事はまだありません" : activeTab === "featured" ? "注目ニュースはまだありません" : "ニュースがありません"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {articlesToShow.map(t => {
                const cat = t.is_theme_article ? categoryForArticle(t.title) : null;
                return t.is_theme_article ? (
                  // テーマ記事(長文解説): 本文全体 + 参照記事リンク一覧
                  <div key={t.id} style={{ background: "white", borderRadius: 12, padding: 20,
                    border: "1px solid #66c3c6", boxShadow: "0 2px 8px rgba(102,195,198,0.15)" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#fef3c7", color: "#d97706", fontWeight: 700 }}>
                        📝 特集記事
                      </span>
                      {cat ? (
                        // カテゴリーバッジ: 右カラムのカテゴリー名と共通化し、クリックでそのカテゴリーの記事一覧に飛べるようにする
                        <button
                          onClick={() => { setActiveCategory(cat.label); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d",
                            fontWeight: 700, border: "none", cursor: "pointer" }}>
                          {cat.emoji} {cat.label}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
                          {SECTOR_EMOJI[t.sector?.split("/")[0].trim()] ?? "📌"} {t.sector}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {new Date(t.fetched_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 900, color: "#082b2e", margin: "0 0 12px" }}>{t.title}</h3>
                    {t.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image_url} alt={t.title} style={{ width: "100%", maxWidth: 360, borderRadius: 12, marginBottom: 14, display: "block" }} />
                    )}
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.9, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>
                      {renderTrendContent(t.content)}
                    </p>
                    <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap" as const, gap: 8, marginBottom: Array.isArray(t.source_links) && t.source_links.length > 0 ? 12 : 0 }}>
                      {t.image_url && (
                        <>
                          <button
                            onClick={() => handleCopyText(t.content)}
                            style={{ fontSize: 11, padding: "6px 12px", borderRadius: 20, border: "1px solid #66c3c6",
                              backgroundColor: "white", color: "#0d4f52", fontWeight: 700, cursor: "pointer" }}>
                            📋 文章をコピー(X投稿用)
                          </button>
                          <a
                            href={`/api/download-infographic?url=${encodeURIComponent(t.image_url)}&name=${encodeURIComponent(`${t.title}.png`)}`}
                            style={{ fontSize: 11, padding: "6px 12px", borderRadius: 20, border: "1px solid #66c3c6",
                              backgroundColor: "white", color: "#0d4f52", fontWeight: 700, textDecoration: "none" }}>
                            🖼 画像を保存
                          </a>
                        </>
                      )}
                      <button
                        onClick={() => handleFavorite(t)}
                        disabled={favoriteStatus[t.id] === "saving" || favoriteStatus[t.id] === "saved"}
                        style={{ fontSize: 11, padding: "6px 12px", borderRadius: 20,
                          border: "1px solid #f59e0b",
                          backgroundColor: favoriteStatus[t.id] === "saved" ? "#fef3c7" : "white",
                          color: "#d97706", fontWeight: 700,
                          cursor: favoriteStatus[t.id] === "saving" ? "default" : "pointer" }}>
                        {favoriteStatus[t.id] === "saved" ? "★ お気に入り済み" : favoriteStatus[t.id] === "saving" ? "保存中..." : "☆ お気に入りに追加"}
                      </button>
                    </div>
                    {Array.isArray(t.source_links) && t.source_links.length > 0 && (
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#2a7a7e", marginBottom: 6 }}>🔗 情報源</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {t.source_links.map((link: any, i: number) => (
                            link.url ? (
                              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: "#66c3c6", textDecoration: "none" }}>
                                ・[{link.source}] {link.title}
                              </a>
                            ) : (
                              <span key={i} style={{ fontSize: 11, color: "#94a3b8" }}>
                                ・[{link.source}] {link.title}
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // 通常のニュース1件
                  <div key={t.id} style={{ background: "white", borderRadius: 12, padding: 16,
                    border: `1px solid ${t.is_featured ? "#66c3c6" : "#e2e8f0"}`,
                    boxShadow: t.is_featured ? "0 2px 8px rgba(102,195,198,0.15)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                        {t.is_featured && (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#fef3c7", color: "#d97706", fontWeight: 700 }}>
                            ⭐ 注目
                          </span>
                        )}
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
                          {SECTOR_EMOJI[t.sector?.split("/")[0].trim()] ?? "📌"} {t.sector}
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f8fafc", color: "#64748b" }}>
                          {t.source}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "#66c3c6", fontWeight: 700, whiteSpace: "nowrap" as const }}>
                        {t.sector_score}/10
                      </span>
                    </div>
                    <a href={t.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 14, fontWeight: 700, color: "#082b2e", textDecoration: "none", lineHeight: 1.5, display: "block", marginBottom: 6 }}>
                      {t.title}
                    </a>
                    {t.ai_comment && (
                      <p style={{ fontSize: 12, color: "#2a7a7e", margin: 0, padding: "6px 10px", backgroundColor: "#f0fdf4", borderRadius: 6, borderLeft: "3px solid #66c3c6" }}>
                        💡 {t.ai_comment}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* フッター */}
          <div style={{ marginTop: 32, padding: "20px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 12px" }}>
              ※ 各記事で実際に参照した情報源は、その記事内(🔗 情報源)に個別に表示しています。当サイトは自社データおよびEDINET等の公開情報をもとに記事を作成しています。
            </p>
            <Link href="/" style={{ fontSize: 12, color: "#66c3c6", textDecoration: "none" }}>
              ← IPO分析レポートトップに戻る
            </Link>
          </div>
        </div>

        {/* 右：カテゴリーアーカイブ サイドバー */}
        <aside className="trends-sidebar" style={{ flex: "0 0 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={cardStyle}>
            <div style={{ padding: "12px 16px", backgroundColor: "#0d4f52" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "white" }}>🗂 カテゴリーから探す</div>
              <div style={{ fontSize: 10, color: "#a0d4d6", marginTop: 2 }}>過去の記事もまとめて読めます</div>
            </div>
            <div style={{ padding: 10 }}>
              {CATEGORIES.map(c => (
                <button key={c.label} onClick={() => setActiveCategory(activeCategory === c.label ? null : c.label)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    width: "100%", textAlign: "left" as const, padding: "10px 10px", borderRadius: 10,
                    border: "none", cursor: "pointer", marginBottom: 4,
                    backgroundColor: activeCategory === c.label ? "#e8f9f9" : "transparent",
                  }}>
                  <span style={{ fontSize: 12, fontWeight: activeCategory === c.label ? 900 : 700, color: "#082b2e" }}>
                    {c.emoji} {c.label}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, marginLeft: 8 }}>
                    {categoryCounts[c.label] ?? 0}件
                  </span>
                </button>
              ))}
            </div>
            <div style={{ padding: "0 14px 14px" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
                ※「今日の最新記事」欄は直近20件までの表示です。それより前の記事も、上のカテゴリーから各カテゴリー直近60件まで遡って読めます(それより古い記事は一覧に出ません)。<br />
                有料プラン会員は、記事を「お気に入り」に保存して期限なく読み返せます(記事の単体購入のみの方は対象外です)。
              </p>
            </div>
          </div>

          <a href="/trends/favorites" style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", textDecoration: "none", border: "1.5px solid #f59e0b" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#082b2e" }}>⭐ お気に入り記事</div>
              <div style={{ fontSize: 10, color: "#d97706", marginTop: 2 }}>保存した記事を読み返す(有料プラン会員限定)</div>
            </div>
            <span style={{ fontSize: 16, color: "#f59e0b" }}>→</span>
          </a>

          <a href="/" style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", textDecoration: "none", border: "1.5px solid #66c3c6" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#082b2e" }}>📋 IPO分析レポートトップ</div>
              <div style={{ fontSize: 10, color: "#2a7a7e", marginTop: 2 }}>銘柄一覧・カレンダーを見る</div>
            </div>
            <span style={{ fontSize: 16, color: "#66c3c6" }}>→</span>
          </a>
        </aside>

      </div>

      {favoriteMessage && (
        <div style={{ position: "fixed", bottom: 20, right: 20, backgroundColor: "#082b2e", color: "white",
          padding: "10px 16px", borderRadius: 10, fontSize: 12, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", gap: 10, maxWidth: 320 }}>
          <span>{favoriteMessage}</span>
          <button onClick={() => setFavoriteMessage(null)}
            style={{ background: "none", border: "none", color: "#a0d4d6", cursor: "pointer", fontSize: 12, padding: 0 }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
