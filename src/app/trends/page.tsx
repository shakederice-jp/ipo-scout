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
// (「大株主・VC/PEの異動ウォッチ(◯◯社)」のように銘柄名が末尾に付くため)。
const CATEGORIES: { label: string; emoji: string; prefix?: boolean }[] = [
  { label: "直近承認銘柄のスコア傾向", emoji: "📊" },
  { label: "ロックアップ解除カレンダー", emoji: "🔓" },
  { label: "IPOカレンダー", emoji: "📅" },
  { label: "週内の重要経済指標カレンダー", emoji: "📈" },
  { label: "大株主・VC/PEの異動ウォッチ", emoji: "🏛️", prefix: true },
];

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
        .limit(100);
      setTrends(data ?? []);
      setLoading(false);
    };
    fetchTrends();

    // カテゴリーごとの件数(サイドバー表示用)。1件ずつでも過去記事があると
    // 分かるように、直近100件のウィンドウとは別に、DB全体から数える。
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
        .limit(200);
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
          .trends-sidebar { flex: 1 1 100% !important; min-width: 0 !important; max-width: 100% !important; }
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
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              IPO・スタートアップ・資金調達の最新動向を毎日3回情報をチェックし、動きがあった時だけ更新
              {updatedAt && <span style={{ marginLeft: 8, color: "#66c3c6" }}>最終更新: {updatedAt}</span>}
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
              {articlesToShow.map(t => (
                t.is_theme_article ? (
                  // テーマ記事(長文解説): 本文全体 + 参照記事リンク一覧
                  <div key={t.id} style={{ background: "white", borderRadius: 12, padding: 20,
                    border: "1px solid #66c3c6", boxShadow: "0 2px 8px rgba(102,195,198,0.15)" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#fef3c7", color: "#d97706", fontWeight: 700 }}>
                        📝 特集記事
                      </span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
                        {SECTOR_EMOJI[t.sector?.split("/")[0].trim()] ?? "📌"} {t.sector}
                      </span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {new Date(t.fetched_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 900, color: "#082b2e", margin: "0 0 12px" }}>{t.title}</h3>
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.9, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>
                      {t.content}
                    </p>
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
                )
              ))}
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
          </div>

          <a href="/" style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", textDecoration: "none", border: "1.5px solid #66c3c6" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#082b2e" }}>📋 IPO分析レポートトップ</div>
              <div style={{ fontSize: 10, color: "#2a7a7e", marginTop: 2 }}>銘柄一覧・カレンダーを見る</div>
            </div>
            <span style={{ fontSize: 16, color: "#66c3c6" }}>→</span>
          </a>
        </aside>

      </div>
    </div>
  );
}
