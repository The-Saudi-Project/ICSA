/**
 * `/admin/staff` — glass tables, colour-coded role badges.
 */

import { Role } from '@rw/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  createStaffMember,
  fetchStaff,
  getStaffUser,
  resetStaffPassword,
  updateStaffMember,
  type AdminStaffMember,
} from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import {
  AdminSection,
  Field,
  OneTimeSecret,
  inputClass,
  primaryButtonClass,
  quietButtonClass,
} from './AdminShell.js'

const ROLES = [Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN, Role.WAITER]

const ROLE_HELP: Record<string, string> = {
  OWNER: 'Everything, including staff and settings',
  MANAGER: 'Menu, tables, orders and junior staff',
  CASHIER: 'Takes payment, hands orders over',
  KITCHEN: 'The kitchen screen only',
  WAITER: 'Sees orders, hands them over',
}

const ROLE_COLOR: Record<string, string> = {
  OWNER: 'bg-gold-wash text-gold ring-gold/20',
  MANAGER: 'bg-accent-wash text-accent ring-accent/20',
  CASHIER: 'bg-status-info/10 text-status-info ring-status-info/20',
  KITCHEN: 'bg-status-warning-wash text-status-warning ring-status-warning/20',
  WAITER: 'bg-surface text-ink-soft ring-border',
}

export default function AdminStaff() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] })
  const me = getStaffUser()

  const { data, isPending } = useQuery({ queryKey: ['admin', 'staff'], queryFn: fetchStaff })

  const [draft, setDraft] = useState({ name: '', email: '', role: Role.CASHIER as string })
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () =>
      createStaffMember({ name: draft.name.trim(), email: draft.email.trim(), role: draft.role }),
    onSuccess: (result) => {
      setSecret({
        label: `One-time password for ${result.user.name}`,
        value: result.temporaryPassword,
      })
      setDraft({ name: '', email: '', role: Role.CASHIER })
      setError(null)
      refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  const reset = useMutation({
    mutationFn: (person: AdminStaffMember) => resetStaffPassword(person.id),
    onSuccess: (result) =>
      setSecret({
        label: `New one-time password for ${result.user.name}`,
        value: result.temporaryPassword,
      }),
    onError: (e: Error) => setError(e.message),
  })

  const setStatus = useMutation({
    mutationFn: ({ person, status }: { person: AdminStaffMember; status: string }) =>
      updateStaffMember(person.id, { status }),
    onSettled: refresh,
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-4">
      <AdminSection title="Add someone">
        <Card variant="glass" className="p-6 border-border/40 hover:border-border-strong transition-colors">
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Sara Al-Otaibi"
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="sara@restaurant.test"
              />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="mt-4 text-small text-ink-soft bg-surface-strong px-4 py-3 rounded-lg border border-border/50 flex items-start gap-3">
            <svg className="w-5 h-5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>{ROLE_HELP[draft.role]}</span>
          </p>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!draft.name.trim() || !draft.email.trim() || add.isPending}
              onClick={() => add.mutate()}
              className={primaryButtonClass}
            >
              Create account
            </button>
          </div>

          {error ? (
            <div role="alert" className="mt-6 rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {error}
            </div>
          ) : null}

          {secret ? (
            <div className="mt-6 border-t border-border/50 pt-6">
              <OneTimeSecret
                label={secret.label}
                value={secret.value}
                onDone={() => setSecret(null)}
              />
            </div>
          ) : null}
        </Card>
      </AdminSection>

      <AdminSection title="Team">
        {isPending ? <p className="py-6 text-body text-ink-soft">Loading…</p> : null}

        <Card variant="glass" className="overflow-hidden border-border/40 p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-surface-strong/30 text-small font-bold text-ink-soft uppercase tracking-wider">
                <th className="py-4 px-6 text-start">Name</th>
                <th className="py-4 px-6 text-start">Role</th>
                <th className="py-4 px-6 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data?.staff.map((person) => {
                const isMe = person.id === me?.id
                const disabled = person.status === 'DISABLED'

                return (
                  <tr key={person.id} className={`group hover:bg-surface-hover/50 transition-colors ${disabled ? 'opacity-60' : ''}`}>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-surface-strong to-border flex items-center justify-center shrink-0 border border-border/50 text-ink font-bold shadow-sm">
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={`text-body font-bold text-ink ${disabled ? 'line-through' : ''}`}>
                            {person.name}
                            {isMe ? <span className="ml-2 rounded-full bg-accent-wash px-2 py-0.5 text-[10px] font-bold text-accent uppercase tracking-widest shadow-sm">You</span> : null}
                          </p>
                          <p className="text-small text-ink-soft">{person.email}</p>
                          {person.mustChangePassword && !disabled ? (
                            <p className="text-small font-semibold text-status-warning mt-1 flex items-center gap-1">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                              Needs password reset
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ring-1 shadow-sm ${ROLE_COLOR[person.role] ?? 'bg-surface text-ink-soft ring-border'}`}>
                        {person.role.charAt(0) + person.role.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => reset.mutate(person)}
                          disabled={reset.isPending || disabled}
                          className={`${quietButtonClass} !py-1.5`}
                        >
                          Reset Password
                        </button>
                        <button
                          type="button"
                          disabled={isMe || setStatus.isPending}
                          onClick={() =>
                            setStatus.mutate({
                              person,
                              status: disabled ? 'ACTIVE' : 'DISABLED',
                            })
                          }
                          className={`${quietButtonClass} !py-1.5 ${disabled ? 'text-status-success' : 'text-status-danger'}`}
                          title={isMe ? 'You cannot disable your own account' : undefined}
                        >
                          {disabled ? 'Re-enable' : 'Disable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </AdminSection>
    </div>
  )
}
