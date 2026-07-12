"use client";
import { useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Cell
} from "recharts";

const C = {
  teal: "#66c3c6",
  nav: "#0d4f52",
  bg: "#f4fbfc",
  gold: "#f59e0b",
  red: "#ef4444",
  green: "#22c55e",
  purple: "#8b5cf6",
};

// サンプルデータ
const initialReturnData = [
  { label: "流通比率\n10%未満", rate: 142 },
  { label: "流通比率\n10〜20%", rate: 87 },
  { label: "流通比率\n20〜30%", rate: 34 },
  { label: "流通比率\n30%以上", rate: 12 },
];

const lockupData = [
  { month: "上場日", price: 100 },
  { month: "1ヶ月", price: 118 },
  { month: "2ヶ月", price: 132 },
  { month: "3ヶ月 (LU解除)", price: 95 },
  { month: "4ヶ月", price: 88 },
  { month: "5ヶ月", price: 102 },
  { month: "6ヶ月", price: 115 },
];

const longTermData = [
  { year: "1年目", 成長株: 130, 市場平均: 108 },
  { year: "2年目", 成長株: 175, 市場平均: 112 },
  { year: "3年目", 成長株: 240, 市場平均: 118 },
  { year: "4年目", 成長株: 310, 市場平均: 125 },
  { year: "5年目", 成長株: 480, 市場平均: 132 },
];

const radarData = [
  { subject: "流通比率", value: 85 },
  { subject: "主幹事力", value: 70 },
  { subject: "業績成長", value: 90 },
  { subject: "市場環境", value: 65 },
  { subject: "VCロック", value: 75 },
  { subject: "公募割安度", value: 80 },
];

const checkItems = [
  { icon: "🎯", label: "流通比率20%以下", weight: "高", desc: "株数が少ないほど需給が引き締まる" },
  { icon: "🏦", label: "大手主幹事(野村・大和等)", weight: "高", desc: "販売力が強く機関投資家への配分も厚い" },
  { icon: "📈", label: "直近3期売上成長率20%以上", weight: "高", desc: "成長の裏付けが需要を呼ぶ" },
  { icon: "🔒", label: "VC保有比率50%以下", weight: "中", desc: "売り圧力の源泉。低いほど安心" },
  { icon: "💰", label: "公募PER 市場平均以下", weight: "中", desc: "割安なほど初値プレミアムが乗りやすい" },
  { icon: "🌊", label: "同セクター直近IPOが好調", weight: "中", desc: "テーマ性と市場の熱量を確認" },
];

export default function IpoGuidePage() {
  const [activeTab, setActiveTab] = useState<"ultra" | "short" | "long">("ultra");

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, fontFamily: "'Noto Sans JP', sans-serif" }}>

      {/* ヒーローセクション */}
      <div style={{ background: `linear-gradient(135deg, ${C.nav} 0%, #1a6b6e 60%, #2a8a8e 100%)`, padding: "60px 24px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(102,195,198,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(102,195,198,0.1) 0%, transparent 40%)" }} />
        <div style={{ position: "relative", maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "inline-block", background: "rgba(102,195,198,0.2)", border: "1px solid rgba(102,195,198,0.4)", borderRadius: 20, padding: "4px 16px", marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: C.teal, fontWeight: 700, letterSpacing: 2 }}>大手町調査室九課 特別レポート</span>
          </div>
          <h1 style={{ fontSize: "clamp(24px, 5vw, 40px)", fontWeight: 900, color: "white", margin: "0 0 16px", lineHeight: 1.3 }}>
            お宝銘柄を探せ。<br/>
            <span style={{ color: C.teal }}>IPO投資で資産を増やす</span><br/>
            実践的法則
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.8)", lineHeight: 1.8, margin: "0 0 32px" }}>
            新規上場（IPO）は、個人投資家が機関投資家と同じスタートラインに立てる数少ない機会。<br/>
            超短期・短期・長期——それぞれの戦略を知れば、勝率は劇的に変わる。
          </p>

          {/* アンカーリンクボタン */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            {[
              { id: "ultra", label: "⚡ 超短期（初値狙い）", color: C.gold },
              { id: "short", label: "📈 短期（1〜3ヶ月）", color: C.teal },
              { id: "long", label: "🌱 長期（数年〜）", color: C.green },
            ].map(btn => (
              <button key={btn.id} onClick={() => scrollTo(btn.id)}
                style={{ padding: "10px 20px", borderRadius: 8, border: `2px solid ${btn.color}`, background: "transparent", color: btn.color, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = btn.color; (e.target as HTMLElement).style.color = "white"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = btn.color; }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 60px" }}>

        {/* 前提：IPO投資の優位性 */}
        <div style={{ background: "white", borderRadius: 16, padding: "28px 24px", margin: "32px 0", border: "1px solid #b3e8ea" }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: C.nav, margin: "0 0 16px" }}>なぜIPO投資は有利なのか</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {[
              { icon: "🎯", title: "公募価格という基準線", desc: "上場前に決まる「公募価格」を基準に初値が形成される。需要超過なら高値スタートが期待できる" },
              { icon: "📊", title: "情報の非対称性", desc: "目論見書という一次情報が公開される。AIで素早く分析できれば大きな優位性になる" },
              { icon: "🔒", title: "ロックアップ制度", desc: "主要株主の売却制限が一定期間かかる。需給が安定しやすい側面がある" },
            ].map((item, i) => (
              <div key={i} style={{ background: C.bg, borderRadius: 10, padding: "16px" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.nav, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 超短期セクション ═══ */}
        <div id="ultra" style={{ scrollMarginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "40px 0 20px" }}>
            <span style={{ background: C.gold, color: "white", fontWeight: 900, fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>CHAPTER 1</span>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: C.nav, margin: 0 }}>⚡ 超短期戦略 — 初値で勝つ</h2>
          </div>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.8, marginBottom: 24 }}>
            上場初日の「初値」で売却するスキャルピング的戦略。需給分析が命。流通株数が少なく、人気が集中した銘柄は公募価格の2〜3倍になることも珍しくない。
          </p>

          {/* 流通比率と騰落率グラフ */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>流通比率と平均初値騰落率の関係</h3>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 16px" }}>※サンプルデータによる例示。流通比率が低いほど初値上昇率が高い傾向がある</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={initialReturnData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `+${v}%`} />
                <Tooltip formatter={(v: any) => [`+${v}%`, "平均初値騰落率"]} />
                <Bar dataKey="rate" name="平均初値騰落率" radius={[6, 6, 0, 0]}>
                  {initialReturnData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? C.gold : i === 1 ? C.teal : i === 2 ? "#94a3b8" : "#cbd5e1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 勝率を上げる6つのチェックリスト */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 16px" }}>初値狙いの勝率チェックリスト</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {checkItems.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: C.bg, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.nav }}>{item.label}</span>
                      <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 20, background: item.weight === "高" ? "#fef3c7" : "#f1f5f9", color: item.weight === "高" ? "#d97706" : "#64748b", fontWeight: 700 }}>重要度: {item.weight}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* レーダーチャート */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>お宝銘柄のスコア例（6軸評価）</h3>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 16px" }}>※サンプルデータ。全方位で高スコアの銘柄が初値買いの最良候補</p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: C.nav }} />
                <Radar name="スコア" dataKey="value" stroke={C.teal} fill={C.teal} fillOpacity={0.3} />
                <Tooltip formatter={(v: any) => [`${v}点`, "スコア"]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* ポイントまとめ */}
          <div style={{ background: `linear-gradient(135deg, #fef3c7, #fffbeb)`, borderRadius: 12, padding: "16px 20px", border: "1px solid #fde68a" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#92400e", marginBottom: 8 }}>⚡ 超短期の核心</div>
            <p style={{ fontSize: 13, color: "#78350f", lineHeight: 1.7, margin: 0 }}>
              流通比率・主幹事・需給の3点セットを見るだけで、初値勝率は大幅に上がる。当社のAI分析では9軸スコアで需給の強弱を数値化。目論見書を読む時間がなくても、お宝銘柄を素早く見極められる。
            </p>
          </div>
        </div>

        {/* ═══ 短期セクション ═══ */}
        <div id="short" style={{ scrollMarginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "48px 0 20px" }}>
            <span style={{ background: C.teal, color: "white", fontWeight: 900, fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>CHAPTER 2</span>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: C.nav, margin: 0 }}>📈 短期戦略 — ロックアップを読む</h2>
          </div>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.8, marginBottom: 24 }}>
            上場後1〜3ヶ月で売却する中期戦略。最大の注目点は「ロックアップ解除日」。創業者やVCの売却制限が外れるタイミングで需給が一変することがある。
          </p>

          {/* ロックアップ解除後の株価推移 */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>ロックアップ解除前後の典型的な株価推移</h3>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 16px" }}>※サンプルデータによる例示（公募価格=100として指数化）</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={lockupData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} domain={[70, 150]} />
                <Tooltip formatter={(v: any) => [`${v}`, "株価指数"]} />
                <ReferenceLine x="3ヶ月 (LU解除)" stroke="#ef4444" strokeDasharray="4 4" label={{ value: "LU解除", position: "top", fontSize: 10, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="price" stroke={C.teal} strokeWidth={3} dot={{ fill: C.teal, r: 4 }} name="株価指数" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
              <span style={{ fontSize: 12, color: "#dc2626" }}>⚠️ ロックアップ解除後は大株主の売却が始まり株価が急落するケースも。解除日の2週間前には利益確定を検討しよう。</span>
            </div>
          </div>

          {/* 初値売り vs 保有比較表 */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 16px" }}>初値売り vs 短期保有 損益シミュレーション</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#64748b", fontWeight: 700, borderBottom: "2px solid #e2e8f0" }}>銘柄タイプ</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "#64748b", fontWeight: 700, borderBottom: "2px solid #e2e8f0" }}>初値騰落率</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: C.teal, fontWeight: 700, borderBottom: "2px solid #e2e8f0" }}>初値売り損益</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: C.gold, fontWeight: 700, borderBottom: "2px solid #e2e8f0" }}>3ヶ月後損益</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#64748b", fontWeight: 700, borderBottom: "2px solid #e2e8f0" }}>推奨戦略</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: "高需給・成長株", first: "+80%", sell: "+80,000円", hold: "+120,000円", rec: "保有継続", recColor: C.green },
                    { type: "高需給・割高株", first: "+60%", sell: "+60,000円", hold: "+20,000円", rec: "初値売り", recColor: C.teal },
                    { type: "中需給・普通株", first: "+20%", sell: "+20,000円", hold: "+5,000円", rec: "初値売り", recColor: C.teal },
                    { type: "低需給・公募割れ", first: "-10%", sell: "-10,000円", hold: "-25,000円", rec: "早期損切り", recColor: C.red },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0fafa" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: C.nav }}>{row.type}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: row.first.startsWith("-") ? C.red : C.green, fontWeight: 700 }}>{row.first}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>{row.sell}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>{row.hold}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 10px", borderRadius: 20, background: row.recColor + "20", color: row.recColor, fontWeight: 700, fontSize: 11 }}>{row.rec}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: "12px 0 0" }}>※公募100株（10万円）を取得した場合のシミュレーション。手数料・税金は考慮外。</p>
          </div>

          <div style={{ background: `linear-gradient(135deg, #f0fdf4, #dcfce7)`, borderRadius: 12, padding: "16px 20px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#166534", marginBottom: 8 }}>📈 短期の核心</div>
            <p style={{ fontSize: 13, color: "#14532d", lineHeight: 1.7, margin: 0 }}>
              「成長株は保有、割高株は初値売り」が鉄則。AI分析の短期グレード（B以上）かつロックアップ解除まで90日以上あれば保有継続を検討する価値がある。
            </p>
          </div>
        </div>

        {/* ═══ 長期セクション ═══ */}
        <div id="long" style={{ scrollMarginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "48px 0 20px" }}>
            <span style={{ background: C.green, color: "white", fontWeight: 900, fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>CHAPTER 3</span>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: C.nav, margin: 0 }}>🌱 長期戦略 — 10倍株を狙う</h2>
          </div>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.8, marginBottom: 24 }}>
            数年単位で保有する長期投資。IPOは「企業が最も透明性高く情報開示するタイミング」。目論見書を深く読み込み、真の成長企業を見抜けば10倍・100倍の可能性がある。
          </p>

          {/* 長期リターン比較グラフ */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>成長株IPO vs 市場平均 長期リターン比較</h3>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 16px" }}>※サンプルデータによる例示（公募価格=100として指数化）</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={longTermData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} />
                <Tooltip formatter={(v: any) => [`${v}`]} />
                <Legend />
                <Line type="monotone" dataKey="成長株" stroke={C.green} strokeWidth={3} dot={{ fill: C.green, r: 4 }} />
                <Line type="monotone" dataKey="市場平均" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 財務チェック表 */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 16px" }}>長期保有に値する企業の財務チェック</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {[
                { icon: "📊", label: "売上成長率", target: "3年連続20%以上", desc: "成長の持続性を確認" },
                { icon: "💹", label: "営業利益率", target: "10%以上（改善傾向）", desc: "稼ぐ力があるか" },
                { icon: "🔄", label: "ROE", target: "15%以上", desc: "株主資本を効率よく使えているか" },
                { icon: "💎", label: "自己資本比率", target: "40%以上", desc: "財務の安定性・倒産リスク" },
                { icon: "🏆", label: "市場シェア", target: "業界トップ3以内", desc: "競合優位性の源泉" },
                { icon: "🔁", label: "ストック収益比率", target: "50%以上", desc: "サブスク等の安定収益基盤" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "14px", background: C.bg, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.nav, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.green, marginBottom: 4 }}>目安: {item.target}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 成長ステージ表 */}
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 20, border: "1px solid #b3e8ea" }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: C.nav, margin: "0 0 16px" }}>成長ステージ別 投資判断フロー</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { stage: "黎明期（赤字・急成長）", signal: "売上成長率50%以上・TAM巨大", action: "小口で仕込む", color: C.purple },
                { stage: "成長期（黒転・拡大）", signal: "売上成長30%・利益率改善中", action: "本命として積み増し", color: C.green },
                { stage: "成熟期（安定成長）", signal: "配当開始・ROE安定", action: "長期保有継続", color: C.teal },
                { stage: "停滞期（成長鈍化）", signal: "成長率10%以下・競合激化", action: "段階的に利確", color: C.gold },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${row.color}30` }}>
                  <div style={{ width: 6, height: 40, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.nav, marginBottom: 3 }}>{row.stage}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>シグナル: {row.signal}</div>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: 20, background: row.color + "20", color: row.color, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" as const }}>{row.action}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: `linear-gradient(135deg, #f0fdf4, #dcfce7)`, borderRadius: 12, padding: "16px 20px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#166534", marginBottom: 8 }}>🌱 長期の核心</div>
            <p style={{ fontSize: 13, color: "#14532d", lineHeight: 1.7, margin: 0 }}>
              長期グレードAの銘柄を「黎明期〜成長期」に仕込み、「停滞期」のシグナルが出たら利確——これが10倍株への王道。AI分析の長期軸スコアを参考に、数年後の姿を今から見据えよう。
            </p>
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: `linear-gradient(135deg, ${C.nav}, #1a6b6e)`, borderRadius: 16, padding: "36px 24px", marginTop: 48, textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "white", margin: "0 0 12px" }}>
            今週のお宝銘柄を<br/>AI分析で確認する
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 24px", lineHeight: 1.7 }}>
            超短期・短期・長期、3つの視点でスコアリング。<br/>目論見書をAIが解析した一次情報があなたの武器になる。
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/" style={{ display: "inline-block", padding: "12px 28px", background: C.teal, color: "white", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              📊 IPO分析レポートを見る →
            </Link>
            <Link href="/trends" style={{ display: "inline-block", padding: "12px 28px", background: "rgba(255,255,255,0.15)", color: "white", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none", border: "1px solid rgba(255,255,255,0.3)" }}>
              📡 マーケットトレンドを見る
            </Link>
          </div>
        </div>

        {/* 免責事項 */}
        <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 24, lineHeight: 1.7 }}>
          ※本ページのグラフ・表はすべてサンプルデータによる例示であり、投資勧誘を目的とするものではありません。<br/>
          実際の投資判断はご自身の責任のもとで行ってください。© 大手町調査室九課
        </p>
      </div>
    </div>
  );
}