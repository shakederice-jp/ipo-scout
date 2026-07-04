"use client";
import { useState, useEffect } from "react";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };

export default function NewsSection() {
  const [newsData, setNewsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState<string>("ipo");

  useEffect(() => {
    fetch("/api/news")
      .then(r => r.json())
      .then(data => { setNewsData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  };

  const formatUpdated = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} 朝6時更新`;
  };

  if (loading) return (
    <div style={{ padding:"24px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
      ニュースを読み込み中...
    </div>
  );

  if (!newsData || !newsData.data) return null;

  const hasAnyNews = newsData.categories.some(
    (key: string) => (newsData.data[key]?.items?.length ?? 0) > 0
  );

  if (!hasAnyNews) return (
    <div style={{ padding:"16px", textAlign:"center", color:"#94a3b8", fontSize:12 }}>
      ニュースは毎朝6時に自動更新されます
    </div>
  );

  return (
    <div style={{ marginTop:32 }}>
      {/* ヘッダー */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, padding:"0 4px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18 }}>📰</span>
          <h2 style={{ fontSize:16, fontWeight:900, color:C.nav, margin:0 }}>最新ニュース</h2>
        </div>
        {newsData.last_updated && (
          <span style={{ fontSize:10, color:"#94a3b8" }}>
            🕕 {formatUpdated(newsData.last_updated)}
          </span>
        )}
      </div>

      {/* カテゴリタブ */}
      <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {newsData.categories.map((key: string) => {
          const cat = newsData.data[key];
          const isActive = openCategory === key;
          return (
            <button key={key} onClick={() => setOpenCategory(key)}
              style={{ padding:"6px 12px", borderRadius:20, border:`1px solid ${isActive ? C.teal : "#e2e8f0"}`,
                backgroundColor: isActive ? C.teal : "white",
                color: isActive ? "white" : "#475569",
                fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                transition:"all 0.15s" }}>
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ニュース一覧 */}
      {newsData.categories.map((key: string) => {
        if (key !== openCategory) return null;
        const cat = newsData.data[key];
        return (
          <div key={key} style={{ backgroundColor:"white", borderRadius:12, border:"1px solid #d0f0f0", overflow:"hidden" }}>
            {/* カテゴリ説明 */}
            <div style={{ padding:"10px 16px", backgroundColor:C.bg, borderBottom:"1px solid #d0f0f0" }}>
              <p style={{ fontSize:11, color:"#6b9ea0", margin:0 }}>
                📋 {cat.desc}　|　<span style={{ color:"#94a3b8" }}>1日1回 毎朝6時自動更新</span>
              </p>
            </div>
            {/* ニュース記事リスト */}
            {cat.items.length === 0 ? (
              <div style={{ padding:"24px", textAlign:"center", color:"#94a3b8", fontSize:12 }}>
                現在ニュースがありません。毎朝6時に自動更新されます。
              </div>
            ) : (
              <div>
                {cat.items.map((item: any, i: number) => (
                  <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:"block", padding:"12px 16px",
                      borderBottom: i < cat.items.length-1 ? "1px solid #f0fafa" : "none",
                      textDecoration:"none", transition:"background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.bg)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "white")}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>📄</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:600, color:"#082b2e", margin:"0 0 4px",
                          lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2,
                          WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                          {item.title}
                        </p>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {item.source && (
                            <span style={{ fontSize:10, color:"#94a3b8", backgroundColor:"#f1f5f9",
                              padding:"1px 6px", borderRadius:10 }}>
                              {item.source}
                            </span>
                          )}
                          {item.published_at && (
                            <span style={{ fontSize:10, color:"#94a3b8" }}>
                              {formatDate(item.published_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize:12, color:C.teal, flexShrink:0, marginTop:2 }}>→</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}