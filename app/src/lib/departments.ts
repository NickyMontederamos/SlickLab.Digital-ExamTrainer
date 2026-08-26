import type { Role } from "@prisma/client";
import { assertCan } from "./rbac";
import { forTenant } from "./tenant-db";
import { AUDIT_ACTIONS, logAudit } from "./audit";

export class DepartmentNameTakenError extends Error {
  constructor(name: string) {
    super(`Department "${name}" already exists in this institution`);
    this.name = "DepartmentNameTakenError";
  }
}

export class DepartmentNotFoundError extends Error {
  constructor(departmentId: string) {
    super(`Department ${departmentId} not found in this institution`);
    this.name = "DepartmentNotFoundError";
  }
}

export class DepartmentHasCoursesError extends Error {
  constructor(departmentId: string) {
    super(`Department ${departmentId} still has courses assigned to it and cannot be deleted.`);
    this.name = "DepartmentHasCoursesError";
  }
}

export async function listDepartments(institutionId: string, actor: { role: Role }) {
  assertCan(actor.role, "department", "read");
  const db = forTenant(institutionId);
  return db.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { courses: true } } },
  });
}

export async function getDepartmentWithCourses(institutionId: string, actor: { role: Role }, departmentId: string) {
  assertCan(actor.role, "department", "read");
  const db = forTenant(institutionId);
  const department = await db.department.findFirst({
    where: { id: departmentId },
    include: { courses: { orderBy: { code: "asc" } } },
  });
  if (!department) {
    throw new DepartmentNotFoundError(departmentId);
  }
  return department;
}

export interface CreateDepartmentInput {
  name: string;
}

export async function createDepartment(institutionId: string, actor: { id: string; role: Role }, input: CreateDepartmentInput) {
  assertCan(actor.role, "department", "create");

  const db = forTenant(institutionId);
  const existing = await db.department.findFirst({ where: { name: input.name } });
  if (existing) {
    throw new DepartmentNameTakenError(input.name);
  }

  const department = await db.department.create({ data: { name: input.name } as never });

  await logAudit({
    institutionId,
    actorUserId: actor.id,
    action: AUDIT_ACTIONS.departmentCreate,
    resourceType: "department",
    resourceId: department.id,
    result: "SUCCESS",
    metadata: { name: input.name },
  });

  return department;
}

export interface UpdateDepartmentInput {
  name?: string;
}

export async function updateDepartment(
  institutionId: string,
  actor: { id: string; role: Role },
  departmentId: string,
  input: UpdateDepartmentInput
) {
  assertCan(actor.role, "department", "update");

  const db = forTenant(institutionId);
  const department = await db.department.findFirst({ where: { id: departmentId } });
  if (!department) {
    throw new DepartmentNotFoundError(departmentId);
  }

  const updated = await db.department.update({ where: { id: departmentId }, data: input });

  await logAudit({
    institutionId,
    actorUserId: actor.id,
    action: AUDIT_ACTIONS.departmentUpdate,
    resourceType: "department",
    resourceId: departmentId,
    result: "SUCCESS",
    metadata: { input },
  });

  return updated;
}

/**
 * Refuses to delete a department that still has courses filed under it —
 * same reasoning as deleteCourse's block-if-has-content in courses.ts.
 * Reassign or delete those courses first.
 */
export async function deleteDepartment(institutionId: string, actor: { id: string; role: Role }, departmentId: string) {
  assertCan(actor.role, "department", "delete");

  const db = forTenant(institutionId);
  const department = await db.department.findFirst({
    where: { id: departmentId },
    include: { _count: { select: { courses: true } } },
  });
  if (!department) {
    throw new DepartmentNotFoundError(departmentId);
  }
  if (department._count.courses > 0) {
    throw new DepartmentHasCoursesError(departmentId);
  }

  await db.department.delete({ where: { id: departmentId } });

  await logAudit({
    institutionId,
    actorUserId: actor.id,
    action: AUDIT_ACTIONS.departmentDelete,
    resourceType: "department",
    resourceId: departmentId,
    result: "SUCCESS",
    metadata: { name: department.name },
  });
}
