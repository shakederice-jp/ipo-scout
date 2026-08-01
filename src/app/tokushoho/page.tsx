import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "迚ｹ螳壼膚蜿門ｼ墓ｳ輔↓蝓ｺ縺･縺剰｡ｨ險假ｽ懷､ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ",
  robots: { index: false },
};

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Noto Sans JP',sans-serif" } as React.CSSProperties,
  h1:   { fontSize: 22, fontWeight: 900, color: "#082b2e", marginBottom: 24, paddingBottom: 12, borderBottom: "2px solid #b3e8ea" } as React.CSSProperties,
  table:{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th:   { backgroundColor: "#e8f9f9", color: "#0d4f52", fontWeight: 700, padding: "10px 14px", textAlign: "left" as const, border: "1px solid #b3e8ea", width: "30%", verticalAlign: "top" as const },
  td:   { padding: "10px 14px", border: "1px solid #b3e8ea", color: "#374151", lineHeight: 1.8, verticalAlign: "top" as const },
  note: { marginTop: 24, fontSize: 11, color: "#94a3b8", lineHeight: 1.8 } as React.CSSProperties,
};

const rows = [
  ["雋ｩ螢ｲ莠区･ｭ閠・,         "螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ"],
  ["驕句霧邨ｱ諡ｬ雋ｬ莉ｻ閠・,     "繝溘Ζ繧ｱ繝・ヤ繝､"],
  ["謇蝨ｨ蝨ｰ",            "譚ｱ莠ｬ驛ｽ荳ｭ螟ｮ蛹ｺ譌･譛ｬ讖句・逕ｺ17-2-4F\n・郁ｫ区ｱゅ′縺ゅ▲縺溷ｴ蜷医・驕・ｻ槭↑縺城幕遉ｺ縺励∪縺呻ｼ・],
  ["髮ｻ隧ｱ逡ｪ蜿ｷ",          "髱槫・陦ｨ\n・郁ｫ区ｱゅ′縺ゅ▲縺溷ｴ蜷医・驕・ｻ槭↑縺城幕遉ｺ縺励∪縺呻ｼ・],
  ["繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ",    "otemachi.sec9@gmail.com"],
  ["雋ｩ螢ｲURL",           "https://ipo.finance-tower.com"],
  ["繧ｵ繝ｼ繝薙せ蜷・,        "IPO莨∵･ｭ諠・ｱAI蛻・梵繝ｬ繝昴・繝・],
  ["雋ｩ螢ｲ萓｡譬ｼ",          "騾夂衍繝励Λ繝ｳ・堋･890/譛・n繝ｬ繝昴・繝育┌蛻ｶ髯舌・繝ｩ繝ｳ・堋･1,890/譛・n繧ｳ繝ｳ繝励Μ繝ｼ繝医ヱ繝・け・堋･2,490/譛・n繧ｷ繝ｳ繧ｰ繝ｫ繝ｬ繝昴・繝茨ｼ堋･500/莉ｶ\n・郁｡ｨ遉ｺ萓｡譬ｼ縺ｯ縺吶∋縺ｦ遞手ｾｼ・・],
  ["謾ｯ謇墓婿豕・,          "繧ｯ繝ｬ繧ｸ繝・ヨ繧ｫ繝ｼ繝画ｱｺ貂茨ｼ・tripe・・],
  ["謾ｯ謇墓凾譛・,          "縺顔筏縺苓ｾｼ縺ｿ譎ゅ↓蜊ｳ譎よｱｺ貂医よ怦鬘阪・繝ｩ繝ｳ縺ｯ豈取怦閾ｪ蜍墓峩譁ｰ"],
  ["繧ｵ繝ｼ繝薙せ謠蝉ｾ帶凾譛・,  "豎ｺ貂亥ｮ御ｺ・ｾ後∝叉譎ょ茜逕ｨ蜿ｯ閭ｽ"],
  ["霑泌刀繝ｻ繧ｭ繝｣繝ｳ繧ｻ繝ｫ",  "譛磯｡阪・繝ｩ繝ｳ縺ｯ縺・▽縺ｧ繧ゅ・繧､繝壹・繧ｸ繧医ｊ繧ｭ繝｣繝ｳ繧ｻ繝ｫ蜿ｯ閭ｽ縺ｧ縺吶・n繧ｭ繝｣繝ｳ繧ｻ繝ｫ蠕後・蠖捺怦譛ｫ縺ｾ縺ｧ蛻ｩ逕ｨ縺ｧ縺阪∝ｽ捺怦蛻・・霑秘≡縺ｯ陦後＞縺ｾ縺帙ｓ縲・n繧ｷ繝ｳ繧ｰ繝ｫ繝ｬ繝昴・繝医・繝・ず繧ｿ繝ｫ繧ｳ繝ｳ繝・Φ繝・・諤ｧ雉ｪ荳翫∬ｳｼ蜈･蠕後・霑秘≡縺ｯ縺頑妙繧翫＠縺ｦ縺・∪縺吶・],
  ["蜍穂ｽ懃腸蠅・,          "譛譁ｰ迚医・Google Chrome / Safari / Firefox / Edge 繧呈耳螂ｨ"],
  ["迚ｹ蛻･譚｡莉ｶ",          "縺ｪ縺・],
];

export default function TokushohoPage() {
  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>迚ｹ螳壼膚蜿門ｼ墓ｳ輔↓蝓ｺ縺･縺剰｡ｨ險・/h1>
        <table style={S.table}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th style={S.th}>{label}</th>
                <td style={S.td}>{value.split("\n").map((line, i) => (
                  <span key={i}>{line}{i < value.split("\n").length - 1 && <br />}</span>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={S.note}>
          窶ｻ 譛ｬ陦ｨ險倥・迚ｹ螳壼膚蜿門ｼ輔↓髢｢縺吶ｋ豕募ｾ狗ｬｬ11譚｡縺ｫ蝓ｺ縺･縺崎｡ｨ遉ｺ縺励※縺・∪縺吶・br />
          窶ｻ 萓｡譬ｼ繝ｻ蜀・ｮｹ縺ｯ莠亥相縺ｪ縺丞､画峩縺輔ｌ繧句ｴ蜷医′縺ゅｊ縺ｾ縺吶・br />
          譛邨よ峩譁ｰ・・026蟷ｴ6譛・
        </p>
      </div>
    </div>
  );
}