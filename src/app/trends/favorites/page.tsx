"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Status = "loading" | "ok" | "not_logged_in" | "not_premium" | "error";

export default function FavoriteArticlesPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/favorites");
        if (res.status === 401) { setStatus("not_logged_in"); return; }
        if (res.status === 403) { setStatus("not_premium"); return; }
        if (!res.ok) { setStatus("error"); return; }
        const data = await res.json();
        setFavorites(data.favorites ?? []);
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    };
    load();
  }, []);

  const handleRemove = async (marketTrendsId: string) => {
    setFavorites(prev => prev.filter(f => f.market_trends_id !== marketTrendsId));
    try {
      await fetch(`/api/favorites?marketTrendsId=${encodeURIComponent(marketTrendsId)}`, { method: "DELETE" });
    } catch {
      // 削除に失敗しても画面上は既に消しているため、ここでは静かに無視する
      // (次回このページを開いたときにDBの実際の状態で再描画される)
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px 40px" }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#082b2e", margin: 0 }}>お気に入り記事</h1>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
            保存した記事は期限なくいつでも読み返せます(有料プラン会員限定・記事の単体購入のみの方は対象外です)
          </p>
        </div>

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>読み込み中...</div>
        )}

        {status === "not_logged_in" && (
          <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 16px" }}>お気に入り機能を使うにはログインが必要です</p>
            <Link href="/auth"
              style={{ fontSize: 13, fontWeight: 700, color: "white", backgroundColor: "#66c3c6", padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
              ログイン / 新規登録
            </Link>
          </div>
        )}

        {status === "not_premium" && (
          <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 16px", lineHeight: 1.8 }}>
              お気に入り保存は有料プラン会員限定の機能です。<br />
              (記事を1本購入しただけの方は対象外です)
            </p>
            <Link href="/plans"
              style={{ fontSize: 13, fontWeight: 700, color: "white", backgroundColor: "#f59e0b", padding: "10px 20px", borderRadius: 8, textDecoration: "none" }}>
              プランを見る
            </Link>
          </div>
        )}

        {status === "error" && (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
            読み込みに失敗しました。時間をおいて再度お試しください
          </div>
        )}

        {status === "ok" && (
          favorites.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 13, lineHeight: 1.8 }}>
              まだお気に入りに保存した記事がありません。<br />
              <Link href="/trends" style={{ color: "#66c3c6" }}>マーケットトレンドの記事一覧</Link>から保存してみましょう
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {favorites.map((f) => (
                <div key={f.id} style={{ background: "white", borderRadius: 12, padding: 20,
                  border: "1px solid #66c3c6", boxShadow: "0 2px 8px rgba(102,195,198,0.15)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" as const }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
                      {f.sector && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
                          📌 {f.sector}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {f.fetched_at
                          ? new Date(f.fetched_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })
                          : ""}
                      </span>
                    </div>
                    <button onClick={() => handleRemove(f.market_trends_id)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid #e2e8f0",
                        backgroundColor: "white", color: "#94a3b8", cursor: "pointer" }}>
                      ✕ 削除
                    </button>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 900, color: "#082b2e", margin: "0 0 12px" }}>{f.title}</h3>
                  {f.content && (
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.9, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>
                      {f.content}
                    </p>
                  )}
                  {Array.isArray(f.source_links) && f.source_links.length > 0 && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#2a7a7e", marginBottom: 6 }}>🔗 情報源</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {f.source_links.map((link: any, i: number) => (
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
              ))}
            </div>
          )
        )}

        <div style={{ marginTop: 24 }}>
          <Link href="/trends" style={{ fontSize: 12, color: "#66c3c6", textDecoration: "none" }}>
            ← マーケットトレンドに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
