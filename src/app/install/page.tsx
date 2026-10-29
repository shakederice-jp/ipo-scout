import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ホーム画面に追加する方法（iPhone・Android）｜大手町調査室九課",
  description: "IPO企業情報AI分析レポートをスマホのホーム画面に追加して、アプリのようにワンタップで開く方法を、iPhoneとAndroidに分けてご案内します。",
  alternates: { canonical: "https://ipo.finance-tower.com/install" },
};

const C = { dark: "#0d4f52", mid: "#66c3c6", pale: "#e0f7f8", pale2: "#f4fbfc", line: "#b3e8ea", text: "#0f2a2c" };

// 「共有」ボタン(四角に上向き矢印)の絵
function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: "-5px" }}>
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}
// 「⋮」メニュー(縦の3点)
function DotsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={C.dark} aria-hidden style={{ verticalAlign: "-5px" }}>
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}
// 「ホーム画面に追加」の絵(四角にプラス)
function AddIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: "-5px" }}>
      <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: C.dark, color: "#fff", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <span style={{ fontSize: 14, color: C.text, lineHeight: 1.8 }}>{children}</span>
    </li>
  );
}

export default function InstallPage() {
  const card = { backgroundColor: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "18px 20px", marginTop: 20 } as const;
  return (
    <div style={{ backgroundColor: C.pale2, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1.5, margin: 0 }}>
          ホーム画面に追加する方法
        </h1>
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.9, marginTop: 12 }}>
          「IPO企業情報AI分析レポート」を、スマホのホーム画面に追加できます。アイコンを1回タップするだけで開けるので、検索したりブックマークを探したりする手間がなくなります。追加は無料で、アプリのダウンロードや会員登録は要りません。
        </p>

        <div style={{ ...card, display: "flex", gap: 14, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png?v=2" alt="ホーム画面に表示されるアイコン" width={72} height={72} style={{ borderRadius: 16, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8 }}>
            追加すると、ホーム画面にこのアイコンが並びます。タップすると、ブラウザの枠（アドレス欄）がない、アプリのような画面で開きます。
          </div>
        </div>

        <section style={card}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: 0 }}>iPhone・iPadの場合（Safari）</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
            <Step n={1}>Safariでこのサイトを開きます。</Step>
            <Step n={2}>画面の下（iPadは上）にある<strong>共有ボタン</strong> <ShareIcon /> （四角から上向きの矢印が出ている形）をタップします。</Step>
            <Step n={3}>メニューを下にスクロールして、<strong>「ホーム画面に追加」</strong> <AddIcon /> をタップします。</Step>
            <Step n={4}>右上の<strong>「追加」</strong>をタップすると、ホーム画面にアイコンが追加されます。</Step>
          </ol>
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, margin: "10px 0 0" }}>
            ※ Safari以外のブラウザ（Chromeなど）では、メニューの出方が違うことがあります。見つからないときは、Safariで開き直してください。
          </p>
        </section>

        <section style={card}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: 0 }}>Androidの場合（Chrome）</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
            <Step n={1}>Chromeでこのサイトを開きます。</Step>
            <Step n={2}>画面の右上にある<strong>メニュー</strong> <DotsIcon /> （縦に3つ並んだ点）をタップします。</Step>
            <Step n={3}><strong>「ホーム画面に追加」</strong> または <strong>「アプリをインストール」</strong> <AddIcon /> をタップします。</Step>
            <Step n={4}>確認の画面で<strong>「追加」</strong>（または「インストール」）をタップします。</Step>
          </ol>
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, margin: "10px 0 0" }}>
            ※ 画面の下に「追加する」ボタンが出たときは、そのボタンを押すだけでも追加できます。
          </p>
        </section>

        <section style={{ ...card, backgroundColor: C.pale, borderColor: C.line }}>
          <h2 style={{ fontSize: 15, fontWeight: 900, color: C.dark, margin: 0 }}>X・LINE・Instagramなどのアプリから開いている場合</h2>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9, margin: "8px 0 0" }}>
            これらのアプリの中で開いた画面（アプリ内ブラウザ）では、ホーム画面に追加できません。画面の右上や右下のメニューから、<strong>「ブラウザで開く」「Safariで開く」</strong>などを選んで、通常のブラウザで開き直してから、上の手順を行ってください。
          </p>
        </section>

        <section style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 900, color: C.dark, margin: 0 }}>よくある質問</h2>
          <div style={{ marginTop: 10, fontSize: 13, color: "#475569", lineHeight: 1.9 }}>
            <p style={{ margin: "0 0 10px" }}><strong style={{ color: C.text }}>Q. お金はかかりますか？</strong><br />A. かかりません。追加も、その後の利用も無料です（有料プランの内容は、これまでと変わりません）。</p>
            <p style={{ margin: "0 0 10px" }}><strong style={{ color: C.text }}>Q. 普通にサイトを見るのと違いはありますか？</strong><br />A. 見られる内容は同じです。ホーム画面から1タップで開けて、アドレス欄のない画面で見られるようになります。</p>
            <p style={{ margin: 0 }}><strong style={{ color: C.text }}>Q. 消したいときは？</strong><br />A. ホーム画面のアイコンを長押しして、削除（またはホーム画面から削除）を選ぶだけです。サイトの会員情報などには影響しません。</p>
          </div>
        </section>

        <p style={{ marginTop: 24, textAlign: "center" }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 800, color: C.dark }}>← トップページへ戻る</a>
        </p>
      </div>
    </div>
  );
}
