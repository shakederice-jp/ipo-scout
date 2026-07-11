"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import AppHeader from "@/components/AppHeader";
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

export default function TrendsPage() {
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "featured">("featured");
  const [activeSector, setActiveSector] = useState<string>("all");

  useEffect(() => {
    const fetchTrends = async () => {
      const { data } = await supabase
        .from("market_trends")
        .select("*")
        .order("sector_score", { ascending: false })
        .order("fetched_at", { ascending: false })
        .limit(100);
      setTrends(data ?? []);
      setLoading(false);
    };
    fetchTrends();
  }, []);

  // セクター集計
  const sectorCounts = trends.reduce((acc, t) => {
    const s = t.sector ?? "その他";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // セクタースコア集計（平均）
  const sectorScores = trends.reduce((acc, t) => {
    const s = t.sector ?? "その他";
    if (!acc[s]) acc[s] = { total: 0, count: 0 };
    acc[s].total += t.sector_score ?? 5;
    acc[s].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const topSectors = Object.entries(sectorScores)
    .map(([sector, v]) => ({ sector, avg: Math.round((v as any).total / (v as any).count), count: (v as any).count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  const filtered = trends.filter(t => {
    if (activeTab === "featured" && !t.is_featured) return false;
    if (activeSector !== "all" && t.sector !== activeSector) return false;
    return true;
  });

  const updatedAt = trends[0]?.fetched_at
    ? new Date(trends[0].fetched_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc" }}>
      <AppHeader />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>

        {/* ヘッダー */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>📡</span>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#082b2e", margin: 0 }}>
              大手町発マーケットトレンド
            </h1>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
            IPO・スタートアップ・資金調達の最新動向を毎日3回自動更新
            {updatedAt && <span style={{ marginLeft: 8, color: "#66c3c6" }}>最終更新: {updatedAt}</span>}
          </p>
        </div>

        {/* 注目セクターランキング */}
        {topSectors.length > 0 && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h2 style={{ fontSize: 13, fontWeight: 900, color: "#082b2e", margin: "0 0 14px" }}>
              🔥 今日の注目セクターランキング
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topSectors.map((s, i) => (
                <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 10 }}
                  onClick={() => setActiveSector(activeSector === s.sector ? "all" : s.sector)}
                  role="button" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "#64748b", minWidth: 20 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 16 }}>{SECTOR_EMOJI[s.sector.split("/")[0].trim()] ?? "📌"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#082b2e", flex: 1 }}>{s.sector}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: "#e2e8f0", overflow: "hidden" }}>
                      <div style={{ width: `${s.avg * 10}%`, height: "100%", backgroundColor: "#66c3c6", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{s.avg}/10</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.count}件</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* タブ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "featured", label: "⭐ 注目ニュース" },
            { key: "all", label: "📋 すべて" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                backgroundColor: activeTab === tab.key ? "#0d4f52" : "white",
                color: activeTab === tab.key ? "white" : "#64748b",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              {tab.label}
            </button>
          ))}
          {activeSector !== "all" && (
            <button onClick={() => setActiveSector("all")}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #66c3c6", cursor: "pointer", fontSize: 12,
                backgroundColor: "#f0fdf4", color: "#0d4f52", fontWeight: 700 }}>
              {activeSector} ✕
            </button>
          )}
        </div>

        {/* ニュース一覧 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
            {activeTab === "featured" ? "注目ニュースはまだありません" : "ニュースがありません"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(t => (
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
            ))}
          </div>
        )}

        {/* フッター */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <Link href="/" style={{ fontSize: 12, color: "#66c3c6", textDecoration: "none" }}>
            ← IPO分析レポートトップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}