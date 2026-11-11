export type Kind = "actors" | "crew";

export function parseKind(v: string): Kind | null {
  return v === "actors" || v === "crew" ? v : null;
}

/** Table and column names come from this closed map, never from user input. */
export const LINK = {
  actors: { table: "scene_cast", col: "actor_id", person: "actor" },
  crew: { table: "scene_crew", col: "crew_id", person: "crew_member" },
} as const;
