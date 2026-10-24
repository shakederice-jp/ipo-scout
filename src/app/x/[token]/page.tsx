import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import XPostActions from "./XPostActions";

// 2026/10/24新設(束B・⑧): X投稿メールのボタンの行き先。原稿を表示し、コピー・Xへの投稿ができる。
// ・リンクを知っている人だけが開ける(ランダムな文字列。検索には出さない)。
// ・原稿はメール送信のたびに x_post_links テーブルへ保存される(src/lib/x-short-link.ts)。
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "X投稿用の原稿｜大手町調査室九課",
  robots: { index: false, follow: false, nocache: true },
};

export default async function XPostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-z0-9]{8,32}$/.test(token)) notFound();

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase
    .from("x_post_links")
    .select("post_text, kind, title, image_url, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) notFound();

  const created = data.created_at ? new Date(data.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";

  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ background: "#0d4f52", padding: "16px 20px", borderRadius: "12px 12px 0 0" }}>
          <p style={{ color: "#a0d4d6", margin: "0 0 4px", fontSize: 11, fontWeight: 700 }}>📝 X投稿用の原稿</p>
          <h1 style={{ color: "white", margin: 0, fontSize: 16, lineHeight: 1.5 }}>
            {[data.kind, data.title].filter(Boolean).join("｜") || "投稿用の原稿"}
          </h1>
          {created ? <p style={{ color: "rgba(255,255,255,0.7)", margin: "4px 0 0", fontSize: 11 }}>{created} JST</p> : null}
        </div>
        <div style={{ background: "white", padding: 20, borderRadius: "0 0 12px 12px", border: "1px solid #b3e8ea" }}>
          {data.image_url ? (
            <div style={{ marginBottom: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.image_url} alt="" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>🖼 画像（Xに添付してください）</p>
            </div>
          ) : null}
          <div id="x-post-text" style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.9, whiteSpace: "pre-wrap", backgroundColor: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", wordBreak: "break-word" }}>
            {data.post_text}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94a3b8" }}>{data.post_text.length}文字（リンク・ハッシュタグ込み）</p>
          <XPostActions text={data.post_text} />
          <p style={{ margin: "16px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.7, textAlign: "center" }}>
            ボタンを押すと、Xの投稿画面が原稿入りで開きます。内容を確認してから投稿してください。
          </p>
        </div>
      </div>
    </div>
  );
}
