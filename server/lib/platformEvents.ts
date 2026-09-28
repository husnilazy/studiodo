import { db } from "../db/client.js";
import { platformEvents } from "../db/schema.js";

type Level = "info" | "warning" | "error";
type Category = "tenant" | "billing" | "kiosk" | "auth" | "system";

interface LogEventInput {
  tenantId?: string | null;
  level?: Level;
  category: Category;
  action: string;
  message: string;
  actorType?: "superadmin" | "tenant_admin" | "kiosk" | "system";
  actorLabel?: string | null;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget on purpose — a logging failure must never break the
// request that triggered it (e.g. a tenant getting created shouldn't 500
// just because the activity-log insert hiccuped).
export function logEvent(input: LogEventInput) {
  db.insert(platformEvents).values({
    tenantId: input.tenantId ?? null,
    level: input.level ?? "info",
    category: input.category,
    action: input.action,
    message: input.message,
    actorType: input.actorType,
    actorLabel: input.actorLabel,
    metadata: input.metadata,
  }).catch((error) => console.error("[platform-events] Gagal mencatat event", input.action, error));
}
