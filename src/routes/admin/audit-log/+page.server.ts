import { listAuditLogs, readAuditLog } from "#lib/models/audit-log.ts"
import type { PageServerLoad } from "./$types"

const EntriesPerPage = 50

export const load: PageServerLoad = async ({ url }) => {
  const auditLogs = (await listAuditLogs()) || []
  const totalLogs = auditLogs.length
  const totalPages = Math.ceil(totalLogs / EntriesPerPage)
  const currentPage = parseInt(url.searchParams.get('page') || '0')
  const pageEntries = await Promise.all(auditLogs
    .reverse()
    .slice(currentPage * EntriesPerPage, (currentPage + 1) * EntriesPerPage)
    .map(readAuditLog)
    .reverse()
  )

  return {
    pageEntries,
    currentPage,
    totalPages
  }
}
