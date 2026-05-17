import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import CalendarClient from "@/components/CalendarClient";

export default async function CalendarPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("*")
    .order("ipo_date", { ascending: true });

  return <CalendarClient companies={companies ?? []} />;
}