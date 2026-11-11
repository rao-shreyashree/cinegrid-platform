// Small fetch wrapper for client components. Always resolves (never throws) so pages can show the message.
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export async function api<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<ApiResult<T>> {
  try {
    const hasBody = init?.body !== undefined;
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = "/login"; // session expired
    }
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: json as T };

    const issues: string = Array.isArray(json?.issues)
      ? json.issues.map((i: { message: string }) => i.message).join(", ")
      : "";
    const base: string = json?.error ?? "Request failed";
    return { ok: false, status: res.status, error: issues ? `${base}: ${issues}` : base };
  } catch {
    return { ok: false, status: 0, error: "Could not reach the server" };
  }
}

export const rupees = (n: number) => "₹" + n.toLocaleString("en-IN");
