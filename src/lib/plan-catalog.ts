// 2026/10/24新設(束A・④3プラン化): 有料プランの「名前・金額・内容」をここ1か所にまとめた。
// 料金ページ(/plans)・購入パネル(CheckoutButton)・マイページ・分析ページの購入案内は、すべてここを見て表示する。
// 名前や金額を変えたいときは、このファイルだけを書き換えればよい(Stripeの金額は別途Stripe側のPriceを作り直す)。
//
// 画面に出すだけのファイルなので、サーバー専用の処理(Stripeなど)は読み込まない。
// 内部のプラン名(データベースの user_profiles.plan に入る値):
//   plan_a = A 分析見放題プラン / plan_b = B 分析見放題＋通知プラン / plan_c = C フルパックプラン(A・Bに週刊スライドと予定の自動登録を加えたもの)

export type PlanId = "plan_a" | "plan_b" | "plan_c";
export type PlanKey = PlanId | "single";

export const PLAN_ORDER: PlanId[] = ["plan_a", "plan_b", "plan_c"];

export type PlanInfo = {
  id: PlanId;
  letter: "A" | "B" | "C";
  name: string;
  price: string; // 表示用
  period: string;
  color: string;
  bg: string;
  border: string;
  target: string; // 誰向けか
  summary: string; // 購入パネルの1行説明
  analysis: boolean; // 有料分析ページ読み放題
  notify: boolean; // 通知(週次メール・BB/申込/上場日・ロックアップ解除)
  slides: boolean; // 週刊PDFスライド
  calendar: boolean; // 予定の自動登録(カレンダー購読)
};

export const PLAN_CATALOG: Record<PlanId, PlanInfo> = {
  plan_a: {
    id: "plan_a",
    letter: "A",
    name: "分析見放題プラン",
    price: "¥2,890",
    period: "/月",
    color: "#0369a1",
    bg: "#eff6ff",
    border: "#bfdbfe",
    target: "毎月すべての銘柄を研究したい方・情報量を重視する方",
    summary: "有料の分析ページが全銘柄読み放題",
    analysis: true,
    notify: false,
    slides: false,
    calendar: false,
  },
  plan_b: {
    id: "plan_b",
    letter: "B",
    name: "分析見放題＋通知プラン",
    price: "¥3,890",
    period: "/月",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#c4b5fd",
    target: "分析も通知も両方ほしい方・申込のタイミングを逃したくない方",
    summary: "分析ページ読み放題に加えて、BB・申込・上場日・ロックアップ解除の通知つき",
    analysis: true,
    notify: true,
    slides: false,
    calendar: false,
  },
  plan_c: {
    id: "plan_c",
    letter: "C",
    name: "フルパックプラン",
    price: "¥4,890",
    period: "/月",
    color: "#0d4f52",
    bg: "#e8f9f9",
    border: "#66c3c6",
    target: "忙しくても要点だけ押さえたい方・1週間の動きをまとめて見たい方",
    summary: "分析・通知に加えて、週1回のスライド(PDF)と予定の自動登録つき",
    analysis: true,
    notify: true,
    slides: true,
    calendar: true,
  },
};

export const SINGLE_PRICE = "¥500";
export const SINGLE_LABEL = "シングルレポート";

export function planLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const p = (PLAN_CATALOG as Record<string, PlanInfo>)[id];
  return p ? `${p.letter} ${p.name}` : null;
}
