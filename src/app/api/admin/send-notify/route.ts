import { SELF_URL } from "@/lib/base-path";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const baseUrl = SELF_URL;
    const res = await fetch(`${baseUrl}/api/cron/notify`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}