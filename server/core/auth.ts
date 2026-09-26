import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Queryable } from "../db/index.ts";
const scrypt = promisify(scryptCallback);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function createSession(
  tx: Queryable,
  tenantId: string,
  userId: string,
) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  await tx.query(
    "INSERT INTO core_session(token_hash,tenant_id,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
    [digest(token), tenantId, userId, csrf],
  );
  return { token, csrf };
}
export async function audit(
  tx: Queryable,
  tenantId: string,
  userId: string,
  entityId: string,
  action: string,
) {
  await tx.query(
    "INSERT INTO core_audit(id,tenant_id,actor_id,entity_id,action) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), tenantId, userId, entityId, action],
  );
}
