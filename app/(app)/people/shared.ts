export type Person = {
  id: number;
  name: string;
  contact_info: string | null;
  scenes: number;
  productions: number;
  crew_role?: string | null;
  has_login?: boolean;
};

export type SceneSlot = {
  scene_id: number;
  production: string;
  scene_number: number;
  shoot_day: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
};

export type SceneOption = SceneSlot & { description: string | null };

export function slotText(s: SceneSlot): string {
  return s.shoot_day ? `${s.shoot_day}, ${s.starts_at} to ${s.ends_at}, ${s.location}` : "Not scheduled yet";
}
