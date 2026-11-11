import type { FeatureExtractionPipeline } from "@xenova/transformers";

// all-MiniLM-L6-v2, 384 dimensions, mean pooling + L2 normalised (cosine distance in pgvector).
// scripts/embed.mjs uses the same model and options, so stored and query vectors match.
const g = globalThis as unknown as { embedderPromise?: Promise<FeatureExtractionPipeline> };

export function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!g.embedderPromise) {
    const p = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")) as FeatureExtractionPipeline;
    })();
    p.catch(() => { g.embedderPromise = undefined; }); // allow a retry after a failed download
    g.embedderPromise = p;
  }
  return g.embedderPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

/** pgvector text literal: "[0.1,0.2,...]" (pass with a $n::vector cast). */
export const toVector = (v: number[]) => "[" + v.join(",") + "]";
