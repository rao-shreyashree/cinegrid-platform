// Runs once when the server starts: load the embedding model in the background
// so the first search during the demo is not slow.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEmbedder } = await import("./lib/embed");
    getEmbedder().catch((e) => console.error("Embedding model warm-up failed:", e?.message));
  }
}
