import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isTemplateAxes, normalizeScoreResult, gradeFromScore } from "@/lib/score-template";

// 2026/10/20新設: AI評価のスコアの作り直し(管理画面にログイン中だけ使える。/api/admin/ 配下は src/proxy.ts が守る)。
// 背景: 分析プロンプトの出力例の数字が、そのままスコアになっていた不具合(src/lib/score-template.ts 参照)。
// 使い方: ブラウザで /api/admin/rescore を開き、「作り直しを始める」を押す。
//   画面の中で、対象の銘柄ごとに ①採点のAI呼び出し(/api/analyze の part=score) ②保存(この API の POST) を順に行う。
// ・Xの下書き・画像・トレンド記事などは作らない(スコア関連の項目だけを書き換える)。
// ・書き換えるもの: analysis_summary(総合点・グレード・9軸・グレードの理由)、analysis_detail の同じ項目、
//   9軸の詳細(analysis_axes_short/mid/long)の各軸の点数とグレード。
// ・書き換えないもの: 要約や9軸の解説文(文章)。文章は、点数を直したあとに分析のSTEP5を実行すると、新しい点数に合わせて作り直せる。
export const maxDuration = 30;

const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function listTargets(supabase: any) {
  const { data } = await supabase.from("ipo_companies").select("id,name,ticker,listing_date,analysis_summary").not("analysis_summary", "is", null).order("listing_date", { ascending: false });
  return ((data ?? []) as any[])
    .filter((c) => isTemplateAxes(c.analysis_summary?.axes_scores))
    .map((c) => ({ id: c.id, name: c.name, ticker: c.ticker, listing_date: c.listing_date }));
}

export async function GET(req: NextRequest) {
  const supabase = sb();
  if (new URL(req.url).searchParams.get("list") === "1") {
    return NextResponse.json({ targets: await listTargets(supabase) });
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>スコアの作り直し</title>
<body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#082b2e;line-height:1.8">
<h2 style="color:#0d4f52">AI評価スコアの作り直し</h2>
<p>プロンプトの例の数字（65点・B・9軸が同じ並び）のコピーになっていた銘柄を探して、点数だけを採点し直します。Xの下書きなどは作りません。1社あたり30秒〜1分かかります。<b>この画面を開いたまま</b>お待ちください。</p>
<p id="count">対象を調べています…</p>
<button id="start" disabled style="padding:10px 22px;font-size:15px;font-weight:700;background:#0d4f52;color:white;border:0;border-radius:8px;cursor:pointer">作り直しを始める</button>
<ol id="log" style="font-size:13px;margin-top:20px;padding-left:20px"></ol>
<script>
let targets=[];
const $=id=>document.getElementById(id);
const log=(t,c)=>{const li=document.createElement('li');li.textContent=t;if(c)li.style.color=c;$('log').appendChild(li);return li};
fetch('/api/admin/rescore?list=1').then(r=>r.json()).then(d=>{targets=d.targets||[];$('count').textContent='対象：'+targets.length+'社';$('start').disabled=targets.length===0;});
$('start').onclick=async()=>{
  $('start').disabled=true;
  let ok=0,ng=0;
  for(const t of targets){
    const li=log(t.name+'（'+(t.ticker||'')+'）… 採点中');
    let saved=false,reason='';
    for(let a=1;a<=3&&!saved;a++){
      try{
        const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id,part:'score'})});
        const d=await r.json();
        if(d.error){reason=d.error;continue;}
        const s=await fetch('/api/admin/rescore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id,result:d})});
        const sd=await s.json();
        if(sd.ok){saved=true;li.textContent=t.name+'：完了（'+sd.total_score+'点・'+sd.grade+'）';li.style.color='#15803d';}
        else{reason=sd.reason||sd.error||'保存できませんでした';}
      }catch(e){reason='通信エラー';}
    }
    if(saved)ok++;else{ng++;li.textContent=t.name+'：失敗（'+reason+'）。あとで、もう一度この画面から実行してください';li.style.color='#dc2626';}
  }
  log('終了：成功 '+ok+'社 / 失敗 '+ng+'社','#0d4f52');
};
</script></body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.result) return NextResponse.json({ ok: false, error: "id と result が必要です" }, { status: 400 });
  const norm = normalizeScoreResult(body.result);
  if (!norm.ok) return NextResponse.json({ ok: false, reason: norm.reason });
  const v = norm.value;

  const supabase = sb();
  const { data: co } = await supabase.from("ipo_companies").select("id,analysis_summary,analysis_detail,analysis_axes_short,analysis_axes_mid,analysis_axes_long").eq("id", body.id).single();
  if (!co?.analysis_summary) return NextResponse.json({ ok: false, error: "分析が見つかりません" }, { status: 404 });

  const patchSummary = {
    total_score: v.total_score, grade: v.grade,
    ultra_short_grade: v.ultra_short_grade, short_grade: v.short_grade, long_grade: v.long_grade,
    axes_scores: v.axes_scores,
    ...(v.grade_reason ? { grade_reason: v.grade_reason } : {}),
    rescored_at: new Date().toISOString(),
  };
  const summary = { ...co.analysis_summary, ...patchSummary };
  const detail = co.analysis_detail ? { ...co.analysis_detail, ...patchSummary } : null;

  // 9軸の詳細(各軸の点数とグレード)を、新しい点数に合わせる(解説文はそのまま)
  const update: Record<string, unknown> = { analysis_summary: summary };
  const detailAxes: Record<string, any[]> = { ultra_short: [], short: [], long: [] };
  const cols: [string, string][] = [["analysis_axes_short", "ultra_short"], ["analysis_axes_mid", "short"], ["analysis_axes_long", "long"]];
  for (const [col, key] of cols) {
    const cur = (co as any)[col];
    if (cur && typeof cur === "object") {
      const next: Record<string, any> = {};
      for (const [axisId, item] of Object.entries(cur as Record<string, any>)) {
        const sc = v.axes_scores[axisId];
        next[axisId] = typeof sc === "number" && item && typeof item === "object" ? { ...item, score: sc, grade: gradeFromScore(sc) } : item;
      }
      update[col] = next;
      detailAxes[key] = Object.values(next);
    }
  }
  if (detail) {
    const oldAxes = (co.analysis_detail as any)?.axes;
    update.analysis_detail = { ...detail, axes: oldAxes ? { ...oldAxes, ...Object.fromEntries(Object.entries(detailAxes).filter(([, a]) => a.length > 0)) } : detail.axes };
  }

  const { error } = await supabase.from("ipo_companies").update(update).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, total_score: v.total_score, grade: v.grade });
}
