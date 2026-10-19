const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.8-flash";

interface AiTicketInput {
  id?: unknown;
  job_name?: unknown;
  job_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  names?: unknown;
  tasks?: unknown;
  materials?: unknown;
}

interface AiRequestBody {
  instruction?: unknown;
  defaultRate?: unknown;
  tickets?: unknown;
  priceHistory?: unknown;
}

interface PriceHistoryInput {
  kind?: unknown;
  description?: unknown;
  unit_price?: unknown;
  times_billed?: unknown;
}

/**
 * Read the Google AI API key from the database vault through a service-role
 * SECURITY DEFINER function. Returns null when the key hasn't been added.
 */
async function getAiApiKey(): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_ai_api_key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return null;
  const key = await res.json();
  return typeof key === "string" && key.length > 0 ? key : null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function clampNum(v: unknown, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

function clampList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => clampStr(x, maxLen))
    .filter((x) => x.length > 0)
    .slice(0, maxItems);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const apiKey = await getAiApiKey();
    if (!apiKey) {
      return json({ error: "AI assistant is not configured yet." }, 501);
    }

    const body = (await req.json()) as AiRequestBody;
    const rawTickets = Array.isArray(body.tickets) ? (body.tickets as AiTicketInput[]) : [];
    const tickets = rawTickets.slice(0, 50).map((t) => ({
      date: clampStr(t.job_date, 10),
      time: `${clampStr(t.start_time, 5)}-${clampStr(t.end_time, 5)}`,
      crew: clampList(t.names, 10, 60),
      tasks: clampList(t.tasks, 30, 200),
      materials: clampList(t.materials, 30, 200),
    }));
    if (tickets.length === 0) {
      return json({ error: "No tickets were provided." }, 400);
    }

    const rawHistory = Array.isArray(body.priceHistory) ? (body.priceHistory as PriceHistoryInput[]) : [];
    const priceHistory = rawHistory
      .slice(0, 60)
      .map((m) => ({
        kind: m?.kind === "material" ? "material" : "labor",
        description: clampStr(m?.description, 300),
        unit_price: clampNum(m?.unit_price, 1000000),
        times_billed: Math.min(clampNum(m?.times_billed, 100000), 100000),
      }))
      .filter((m) => m.description.length > 0 && (m.kind === "material" || m.unit_price > 0));
    const historyBlock = priceHistory.length > 0
      ? `\n\nPRICE HISTORY (this company's own past prices):\n${priceHistory
          .map((m) => `- [${m.kind}] "${m.description}" = ${m.unit_price} (billed ${m.times_billed}x)`)
          .join("\n")}`
      : "";

    const system = [
      "You draft invoice line items for a trades company (contracting, remodeling, service work).",
      'Return ONLY JSON of the shape {"lines":[{"kind":"labor"|"material","description":string,"ticket_ref":string,"quantity":number,"unit_price":number}]}.',
      'Rules: kind "labor" for work/time (unit_price is the hourly rate, quantity in hours), "material" for supplies (unit_price per unit).',
      "description is clear, client-facing text (no internal jargon).",
      'ticket_ref is a short source note like "05/12/26 · 8:00a-12:00p · Dan, Mike".',
      "Labor pricing uses the provided default hourly rate unless the instruction says otherwise; combine adjacent crew work sensibly.",
      "Materials get a reasonable market price only if the instruction asks for pricing, otherwise 0.",
      "PRICE HISTORY IS THE COMPANY'S OWN PAST BILLING: the price_history list maps descriptions this company has billed before to the exact unit prices it charged (times_billed = how often). When a ticket's work matches one of those descriptions (same trade/item, wording may differ slightly), USE that remembered unit_price instead of guessing, and phrase the description like the remembered one. If several match, use the most-billed one. Only fall back to the default rate or a market estimate when nothing in price_history matches.",
      "Never invent work that is not in the provided tickets. Maximum 40 lines. No commentary.",
    ].join(" ");

    const user = JSON.stringify({
      default_hourly_rate: clampNum(body.defaultRate, 100000),
      instruction: clampStr(body.instruction, 1000) || "Draft line items for the completed work in these tickets.",
      tickets,
      price_history: priceHistory,
    });
    // The JSON.stringify above keeps history machine-readable; this trailing
    // block spells it out in a form the model matches against ticket text.
    const userWithHistory = `${user}${historyBlock}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userWithHistory }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) {
      return json({ error: `The AI service returned an error (${res.status}).` }, 502);
    }
    const data = await res.json();
    const content: unknown = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
    if (typeof content !== "string") {
      return json({ error: "The AI service returned an unexpected response." }, 502);
    }
    const parsed = JSON.parse(content) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) {
      return json({ error: "The AI response was missing line items." }, 502);
    }
    const lines = parsed.lines.slice(0, 40).map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      const kind = l.kind === "material" ? "material" : "labor";
      return {
        kind,
        description: clampStr(l.description, 300) || (kind === "labor" ? "Labor" : "Material"),
        ticket_ref: clampStr(l.ticket_ref, 200),
        quantity: clampNum(l.quantity, 100000) || 1,
        unit_price: clampNum(l.unit_price, 1000000),
      };
    });
    return json({ lines });
  } catch (_err) {
    return json({ error: "Could not process the AI request." }, 500);
  }
});
