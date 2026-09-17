import { askSystemPrompt, sanitiseReply, withRetry } from "@/lib/ask-llm";
import { askHkbu, hkbuKeyConfigured } from "@/lib/hkbu";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: hkbuKeyConfigured() });
}

export async function POST(req: Request) {
  if (!hkbuKeyConfigured()) {
    return Response.json({ error: "missing_key" }, { status: 503 });
  }

  let body: {
    input?: string;
    locale?: string;
    history?: { role?: string; content?: string }[];
    packet?: string;
    unknownDose?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const input = body.input?.trim();
  if (!input) return Response.json({ error: "empty" }, { status: 400 });

  const locale = body.locale === "en" ? "en" : "zh-HK";
  const history = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-8)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));

  const packet = body.packet ?? "";

  try {
    const reply = await withRetry(() =>
      askHkbu([
        { role: "system", content: askSystemPrompt(locale) },
        ...(packet ? [{ role: "system" as const, content: packet }] : []),
        ...history,
        { role: "user", content: input },
      ]),
    );
    const { text, adjusted } = sanitiseReply(reply, { packet, locale, unknownDose: body.unknownDose === true });
    return Response.json({ text, adjusted });
  } catch {
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
