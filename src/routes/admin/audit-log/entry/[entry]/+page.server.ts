import { readAuditLog } from "#lib/models/audit-log.ts"

export async function load ({ params }) {
  const filename = params.entry
  const entry = await readAuditLog({ filename })
  return entry
}
