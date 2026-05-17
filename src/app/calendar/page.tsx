import { createClient } from "@supabase/supabase-js";
import CalendarClient from "@/components/CalendarClient";

export default async function CalendarPage() {
  // サーバーサイドのみ：サービスロールキーでRLSをバイパス
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: companies, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .order("ipo_date", { ascending: true });

  if (error) {
    console.error("Supabase error:", error);
  }

  return <CalendarClient companies={companies ?? []} />;
}