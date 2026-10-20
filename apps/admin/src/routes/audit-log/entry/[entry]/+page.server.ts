import { readAuditLog } from "#lib/models/audit-log.ts"
import { error } from "@sveltejs/kit"

export async function load ({ params }) {
  const filename = params.entry
  const entry = await readAuditLog({ filename })
  if (!entry) error(404, 'Audit log entry not found')
  return entry
}
