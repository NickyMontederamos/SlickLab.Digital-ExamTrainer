import type { Role } from "@prisma/client";
import { forTenant } from "./tenant-db";

/**
 * DeviceRegistration already existed in the schema (id, institutionId, userId,
 * deviceFingerprint, registeredAt, lastSeenAt) but had zero application code
 * touching it until this file — it's exactly the model the install/register
 * ceremony (InstallCeremony.tsx, /register-device) needs, so this reuses it
 * rather than adding a new one.
 *
 * No RBAC resource here deliberately: these operate only on the caller's own
 * rows (actor.id), same "ownership, not role permission" shape as
 * saveAnswers/submitAttempt in attempts.ts — every authenticated student may
 * register or clear their own device, nothing more.
 */

export async function hasRegisteredDevice(institutionId: string, actor: { id: string; role: Role }): Promise<boolean> {
  const db = forTenant(institutionId);
  const count = await db.deviceRegistration.count({ where: { userId: actor.id } });
  return count > 0;
}

export async function registerDevice(
  institutionId: string,
  actor: { id: string; role: Role },
  deviceFingerprint: string
) {
  const db = forTenant(institutionId);
  return db.deviceRegistration.upsert({
    where: { userId_deviceFingerprint: { userId: actor.id, deviceFingerprint } },
    update: {},
    create: { userId: actor.id, deviceFingerprint } as never,
  });
}

/** Mirrors Examplify's own "Clear the Registration on Your Device" — a deliberate reset a student triggers, not something that happens routinely. */
export async function clearDeviceRegistration(institutionId: string, actor: { id: string; role: Role }) {
  const db = forTenant(institutionId);
  await db.deviceRegistration.deleteMany({ where: { userId: actor.id } });
}
