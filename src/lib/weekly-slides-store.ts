// 2026/10/20新設(案2・週刊ブリーフのPDFスライド): スライドの作成・保存・公開の処理。
// ・作成: データを組み立て → 自動チェック → PDF作成 → ページ数の確認 → Storage(weekly-slides)に保存 → weekly_slides に記録
// ・状態(status): pending=管理者の確認待ち / published=会員に公開中 / rejected=公開しない
// ・環境変数 WEEKLY_SLIDES_AUTO_PUBLISH=1 のときだけ、自動チェックが通った号を自動で公開する(初期値は確認待ち)
import { loadSlidesData, verifySlidesData } from "@/lib/weekly-slides-data";
import { renderWeeklySlides, slideCount } from "@/lib/weekly-slides-pdf";
import type { SlidesData } from "@/lib/weekly-slides-types";

export const SLIDES_BUCKET = "weekly-slides";
const SITE_URL = "https://ipo.finance-tower.com";
const FONT_URL = `${SITE_URL}/fonts/NotoSansJP-Bold.ttf`;

export interface WeeklySlideRow {
  id: string;
  issue_date: string;
  issue_label: string;
  status: "pending" | "published" | "rejected";
  file_path: string;
  page_count: number | null;
  check_ok: boolean | null;
  check_issues: string[] | null;
  created_at: string;
  published_at: string | null;
}

// PDFの実際のページ数(react-pdfはページごとに「/Type /Page」を書き出す)
function countPdfPages(buf: Buffer): number {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return m ? m.length : 0;
}

export interface GenerateResult {
  ok: boolean;
  message: string;
  row?: WeeklySlideRow;
  issues: string[];
  pages?: number;
  expectedPages?: number;
  data?: SlidesData;
}

export async function generateWeeklySlides(supabase: any, opts: { force?: boolean; dry?: boolean } = {}): Promise<GenerateResult> {
  const data = await loadSlidesData(supabase);
  const check = verifySlidesData(data);
  const issues = [...check.issues];

  const { data: existing } = await supabase.from("weekly_slides").select("*").eq("issue_date", data.thisFri).maybeSingle();
  if (existing && !opts.force && !opts.dry) {
    return { ok: true, message: `今週号(${data.issueLabel})は作成済みです(状態: ${existing.status})。作り直すときは force=1 を付けてください`, row: existing, issues: existing.check_issues ?? [] };
  }
  // 公開済みの号は、force でも上書きしない(会員が読んでいる内容が、黙って変わるのを防ぐ)
  if (existing?.status === "published" && !opts.dry) {
    return { ok: false, message: "公開済みの号は作り直せません。先に管理画面で非公開にしてください", row: existing, issues: existing.check_issues ?? [] };
  }

  const buf = await renderWeeklySlides(data, FONT_URL);
  const pages = countPdfPages(buf);
  const expected = slideCount(data);
  if (pages !== expected) issues.push(`ページ数が想定と違います(想定${expected}枚 / 実際${pages}枚)。文字がはみ出して、ページが増えた可能性があります`);

  if (opts.dry) {
    return { ok: issues.length === 0, message: "試作のみ(保存していません)", issues, pages, expectedPages: expected, data };
  }

  const path = `${data.thisFri}.pdf`;
  const up = await supabase.storage.from(SLIDES_BUCKET).upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDFの保存に失敗しました: ${up.error.message}`);

  const checkOk = issues.length === 0;
  const autoPublish = process.env.WEEKLY_SLIDES_AUTO_PUBLISH === "1" && checkOk;
  const rec = {
    issue_date: data.thisFri,
    issue_label: data.issueLabel,
    status: autoPublish ? "published" : "pending",
    file_path: path,
    page_count: pages,
    check_ok: checkOk,
    check_issues: issues,
    published_at: autoPublish ? new Date().toISOString() : null,
  };
  const { data: saved, error } = await supabase.from("weekly_slides").upsert(rec, { onConflict: "issue_date" }).select("*").single();
  if (error) throw new Error(`記録の保存に失敗しました: ${error.message}`);
  return {
    ok: true,
    message: autoPublish ? "作成して自動公開しました" : "作成しました(管理者の確認待ちです)",
    row: saved, issues, pages, expectedPages: expected,
  };
}

// 管理者用: 状態を変える(公開・非公開・見送り)
export async function setSlideStatus(supabase: any, id: string, status: "published" | "pending" | "rejected") {
  const patch: Record<string, unknown> = { status };
  patch.published_at = status === "published" ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("weekly_slides").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as WeeklySlideRow;
}

// 公開中の最新号(週刊ブリーフのメールに載せるリンク用)
export async function latestPublishedSlide(supabase: any): Promise<WeeklySlideRow | null> {
  const { data } = await supabase.from("weekly_slides").select("*").eq("status", "published").order("issue_date", { ascending: false }).limit(1).maybeSingle();
  return (data as WeeklySlideRow) ?? null;
}

// 会員が下書き中の号を見られないよう、読み出しは必ず status='published' で絞る
export async function listPublishedSlides(supabase: any, limit = 12): Promise<Pick<WeeklySlideRow, "id" | "issue_date" | "issue_label" | "page_count" | "published_at">[]> {
  const { data } = await supabase.from("weekly_slides").select("id,issue_date,issue_label,page_count,published_at").eq("status", "published").order("issue_date", { ascending: false }).limit(limit);
  return data ?? [];
}
