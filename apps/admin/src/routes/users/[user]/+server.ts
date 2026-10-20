import { writeAuditLog } from '#lib/models/audit-log.ts'
import { deleteUser, getUser, setUser, userHasPower } from '#lib/models/user.ts'
import { redirect } from '@sveltejs/kit'
import { loginRedirect } from '#lib/passkey/site-auth.ts'

export async function PUT ({ locals, request, params }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-users')) throw new Error('You don’t have the right to edit users')
  const user = await getUser(params.user)
  const body = await request.json()
  const updated = { ...user, ...body }
  await writeAuditLog(locals.username, 'edit-user', `Edited account for user "${params.user}"`, {
    subjectUser: params.user,
    object: body
  })
  await setUser(params.user, updated)
  return Response.json(updated)
}

export async function DELETE ({ locals, params }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-users')) throw new Error('You don’t have the right to edit users')
  await writeAuditLog(locals.username, 'delete-user', `Deleted account for user "${params.user}"`, { subjectUser: params.user })
  await deleteUser(params.user)
  redirect(307, '/users')
}
