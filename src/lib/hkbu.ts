const HKBU_URL =
  "https://genai.hkbu.edu.hk/api/v0/rest/deployments/gpt-4.1/chat/completions?api-version=2024-12-01-preview";

export function hkbuKeyConfigured() {
  return Boolean(process.env.HKBU_GENAI_API_KEY?.trim());
}

export async function askHkbu(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const key = process.env.HKBU_GENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("missing_key");
  }
  const res = await fetch(HKBU_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "api-key": key,
    },
    body: JSON.stringify({
      messages,
      temperature: 0.3,
      max_tokens: 400,
    }),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `hkbu_${res.status}`);
  }
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty_reply");
  return text;
}
