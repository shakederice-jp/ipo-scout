import { fetchIpoCompaniesForCalendar } from "@/lib/supabase/server";
import { CalendarClient } from "@/components/CalendarClient";

export const metadata = {
  title: "IPOカレンダー",
};

export default async function CalendarPage() {
  const { data: companies, error } = await fetchIpoCompaniesForCalendar();

  return (
    <CalendarClient
      companies={companies ?? []}
      error={error}
    />
  );
}