import { createClient } from "@supabase/supabase-js";

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("id, listing_date")
    .order("listing_date", { ascending: false });

  const baseUrl = "https://ipo-jp.vercel.app";

  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1.0 },
    { url: `${baseUrl}/guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${baseUrl}/tokushoho`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  const companyPages = (companies ?? []).map(c => ({
    url: `${baseUrl}/analysis/${c.id}`,
    lastModified: new Date(c.listing_date ?? new Date()),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [...staticPages, ...companyPages];
}