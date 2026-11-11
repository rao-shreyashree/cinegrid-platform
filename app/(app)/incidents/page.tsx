import { getSession } from "@/lib/auth/session";
import IncidentsClient from "./IncidentsClient";

// Server wrapper: only job is to tell the client part whether this user may move incidents along.
export default async function IncidentsPage() {
  const session = await getSession();
  const canManage = session?.role === "ADMIN" || session?.role === "PRODUCTION_MANAGER";
  return <IncidentsClient canManage={canManage} />;
}
