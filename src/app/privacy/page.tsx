import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー｜大手町調査室九課",
  robots: { index: false },
};

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Noto Sans JP',sans-serif" } as React.CSSProperties,
  h1:   { fontSize: 22, fontWeight: 900, color: "#082b2e", marginBottom: 24, paddingBottom: 12, borderBottom: "2px solid #b3e8ea" } as React.CSSProperties,
  h2:   { fontSize: 15, fontWeight: 900, color: "#0d4f52", marginTop: 28, marginBottom: 8 } as React.CSSProperties,
  p:    { fontSize: 13, color: "#374151", lineHeight: 1.9, marginBottom: 12 } as React.CSSProperties,
  ul:   { fontSize: 13, color: "#374151", lineHeight: 1.9, paddingLeft: 20, marginBottom: 12 } as React.CSSProperties,
  note: { marginTop: 32, fontSize: 11, color: "#94a3b8", lineHeight: 1.8 } as React.CSSProperties,
};

export default function PrivacyPage() {
  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>プライバシーポリシー</h1>

        <p style={S.p}>大手町調査室九課（以下「当社」）は、IPO企業情報AI分析レポート（以下「本サービス」）において取得する個人情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。</p>

        <h2 style={S.h2}>1. 取得する情報</h2>
        <ul style={S.ul}>
          <li>メールアドレス・パスワード（会員登録時）</li>
          <li>クレジットカード情報（決済代行業者Stripeが保持。当社は保持しません）</li>
          <li>閲覧・操作ログ（Google Analyticsによる匿名統計情報）</li>
          <li>お問い合わせ時にご提供いただいた情報</li>
        </ul>

        <h2 style={S.h2}>2. 利用目的</h2>
        <ul style={S.ul}>
          <li>本サービスの提供・運営・改善</li>
          <li>会員管理・決済処理・通知メールの送信</li>
          <li>サービスに関するお知らせ・メンテナンス情報の連絡</li>
          <li>利用状況の分析によるサービス品質向上</li>
          <li>法令に基づく対応</li>
        </ul>

        <h2 style={S.h2}>3. 第三者への提供</h2>
        <p style={S.p}>当社は、以下の場合を除き、取得した個人情報を第三者に提供しません。</p>
        <ul style={S.ul}>
          <li>ご本人の同意がある場合</li>
          <li>法令に基づき開示が必要な場合</li>
          <li>人の生命・財産の保護のために必要な場合</li>
        </ul>

        <h2 style={S.h2}>4. 業務委託先への提供</h2>
        <p style={S.p}>サービス運営のため、以下の事業者に個人情報の一部を提供することがあります。各社は独自のプライバシーポリシーに従い情報を管理します。</p>
        <ul style={S.ul}>
          <li>Supabase, Inc.（認証・データベース管理）</li>
          <li>Stripe, Inc.（決済処理）</li>
          <li>Vercel, Inc.（サーバーホスティング）</li>
          <li>Resend, Inc.（メール送信）</li>
          <li>Google LLC（アクセス解析：Google Analytics）</li>
          <li>Anthropic, PBC（AI分析処理）</li>
        </ul>

        <h2 style={S.h2}>5. Cookieの使用</h2>
        <p style={S.p}>本サービスでは、利用状況の分析のためGoogle AnalyticsのCookieを使用しています。Cookieの使用を無効にしたい場合はブラウザの設定からオプトアウトできます。</p>

        <h2 style={S.h2}>6. 個人情報の管理</h2>
        <p style={S.p}>当社は、個人情報の漏洩・滅失・毀損の防止のため、適切なセキュリティ対策を実施します。不要となった個人情報は速やかに削除します。</p>

        <h2 style={S.h2}>7. 開示・訂正・削除の請求</h2>
        <p style={S.p}>ご本人からの個人情報の開示・訂正・削除の請求には、本人確認の上、合理的な期間内に対応します。下記お問い合わせ先までご連絡ください。</p>

        <h2 style={S.h2}>8. 未成年の利用</h2>
        <p style={S.p}>本サービスは18歳以上の方を対象としています。未成年の方がご利用になる場合は、保護者の同意を得た上でご利用ください。</p>

        <h2 style={S.h2}>9. プライバシーポリシーの改定</h2>
        <p style={S.p}>本ポリシーは予告なく変更されることがあります。重要な変更がある場合は本サービス上でお知らせします。</p>

        <h2 style={S.h2}>10. お問い合わせ</h2>
        <p style={S.p}>
          個人情報の取り扱いに関するお問い合わせは以下までご連絡ください。<br />
          <strong>大手町調査室九課</strong><br />
          メール：otemachi.sec9@gmail.com
        </p>

        <p style={S.note}>制定・最終更新：2026年6月</p>
      </div>
    </div>
  );
}