const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(prompt: string, maxOutputTokens: number, timeoutMs: number): Promise<{ text: string; truncated: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens,
      },
    }),
    // 以前はタイムアウトの指定が一切なく、Gemini側の応答が遅れた場合に
    // いつまでも待ち続けてしまい、呼び出し元(generate-x-drafts)全体が
    // Vercelの実行時間上限に達して強制終了される原因になっていた。
    // 25秒に設定していたが、テーマによっては(自社DBの一覧が長くなる場合など)
    // 25秒では足りずTimeoutErrorで失敗するケースが実際に確認されたため、
    // 呼び出し元ごとに余裕を持った秒数を指定できるようにした。
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini APIエラー: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.[0]?.text;
  // finishReasonが"MAX_TOKENS"の場合、出力が上限で強制的に打ち切られている
  // (axes-beginner/route.tsのstop_reasonチェックと同じ考え方)
  const truncated = candidate?.finishReason === "MAX_TOKENS";

  if (!text) {
    if (truncated) return { text: "", truncated: true };
    throw new Error("Geminiからテキストが返りませんでした");
  }

  return { text: text.trim(), truncated };
}

export async function generateWithGemini(prompt: string): Promise<string> {
  // 文体ルールで「1000〜1500文字程度」を要求しているため、まず3000トークンで生成。
  // 途中で切れていた場合(finishReason: MAX_TOKENS)は、上限を引き上げて自動的に
  // もう一度生成し直す。以前はこの再試行がなく、切れた本文がそのまま
  // 保存・表示されてしまっていた。
  // タイムアウトは1回目45秒・再試行時30秒とし、万一両方とも上限に達しても
  // 合計75秒に収まるようにして、呼び出し元(90秒)の制限内に収める。
  let result = await callGemini(prompt, 3000, 45000);
  if (result.truncated) {
    console.warn("generateWithGemini: MAX_TOKENSで打ち切り検知、上限を引き上げて再試行します");
    result = await callGemini(prompt, 6000, 30000);
    if (result.truncated) {
      console.warn("generateWithGemini: 再試行後もMAX_TOKENSで打ち切り(そのまま返します)");
    }
  }

  return result.text;
}

// 2026/10/24追加: 原文(有価証券届出書)との照合(校正)用。JSONで返させる・温度は低め・出力枠は広め。
// 米国版(ipo-scout-us)の校正の仕組みを、日本版にも入れるために追加した。
export async function generateJsonWithGemini(prompt: string, maxOutputTokens = 8192): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
    // 呼び出し元(api/admin/proofread)の上限は120秒。Geminiの待ちは90秒までにして、残りでJSON解析・返却に使う
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini APIエラー: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
  if (!text) throw new Error("Geminiからテキストが返りませんでした");
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i !== -1 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch {} }
  throw new Error("Geminiの返答をJSONとして読めませんでした");
}
