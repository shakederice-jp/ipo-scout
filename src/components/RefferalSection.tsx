"use client";
import { useState } from "react";
import { Gift, Copy, Check } from "lucide-react";

export default function ReferralSection({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);
  
  const referralCode = "A375D106";
  const referralUrl = `https://ipo-scout-six.vercel.app?ref=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tweetText = encodeURIComponent(
    `📊 IPOのAI深度分析を無料体験！\nこのリンクから登録するとプレミアムプランが2ヶ月無料（今だけ・期間限定）👇\n${referralUrl}\n#大手町調査室九課 #IPO投資`
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "2px solid #b3e8ea" }}>
      <div className="px-4 py-3" style={{ backgroundColor: "#66c3c6" }}>
        <div className="flex items-center gap-2">
          <Gift size={16} style={{ color: "#082b2e" }} />
          <span className="font-black text-sm" style={{ color: "#082b2e" }}>
            友達招待プログラム
          </span>
          {referralCount > 0 && (
            <span className="font-bold rounded-full px-2 py-0.5 ml-auto"
              style={{ fontSize: "10px", backgroundColor: "#082b2e", color: "#66c3c6" }}>
              {referralCount}人招待済み
            </span>
          )}
        </div>
        <p style={{ fontSize: "10px", marginTop: "2px", color: "#0d4f52" }}>
          🎁 今だけ・期間限定（予告なく終了）
        </p>
      </div>
      <div className="p-4 bg-white space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div className="font-black text-sm" style={{ color: "#15803d" }}>招待した人</div>
            <div className="font-bold mt-1" style={{ fontSize: "11px", color: "#166534" }}>
              プレミアム<br/>
              <span className="text-base font-black">2ヶ月無料</span>
            </div>
            <div style={{ fontSize: "9px", color: "#15803d", marginTop: "2px" }}>※登録月含む</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <div className="font-black text-sm" style={{ color: "#1d4ed8" }}>招待された人</div>
            <div className="font-bold mt-1" style={{ fontSize: "11px", color: "#1e40af" }}>
              プレミアム<br/>
              <span className="text-base font-black">2ヶ月無料</span>
            </div>
            <div style={{ fontSize: "9px", color: "#1d4ed8", marginTop: "2px" }}>※登録月含む</div>
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: "#f4fbfc", border: "1px solid #dff3f4" }}>
          <div className="font-bold mb-1" style={{ fontSize: "10px", color: "#2a7a7e" }}>あなたの招待リンク</div>
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate font-mono" style={{ fontSize: "10px", color: "#0d4f52" }}>
              {referralUrl}
            </span>
            <button onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg px-2 py-1 font-bold shrink-0"
              style={{ fontSize: "10px", backgroundColor: copied ? "#dcfce7" : "#66c3c6", color: copied ? "#15803d" : "white" }}>
              {copied ? <><Check size={10} />コピー済み</> : <><Copy size={10} />コピー</>}
            </button>
          </div>
        </div>
        <a href={`https://twitter.com/intent/tweet?text=${tweetText}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl py-2 font-black w-full"
          style={{ fontSize: "12px", backgroundColor: "#000", color: "white", textDecoration: "none" }}>
          𝕏 でシェアする
        </a>
        <div className="rounded-xl p-3" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
          <p style={{ fontSize: "10px", color: "#92400e", lineHeight: "1.6" }}>
            ⚠️ 本特典は期間限定・予告なく打ち切る場合があります。
          </p>
        </div>
      </div>
    </div>
  );
}