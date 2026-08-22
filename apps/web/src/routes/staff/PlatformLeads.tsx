/**
 * The inbox for the homepage contact form.
 *
 * Everything on this screen is somebody's name and phone number, so it is
 * platform-admin only on the server and treated as personal data here: nothing
 * is copied into a query string, and the list is never cached.
 *
 * Triage is three states and nothing more. A CRM is not what this is; it is a
 * list of people waiting to hear back, and the only question that matters about
 * each one is whether somebody has called them yet.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/ui/Card.js'
import { fetchLeads, setLeadStatus, type Lead, type LeadStatus } from '../../lib/staffApi.js'
import { useToast } from '../../components/ToastContext.js'

const FILTERS: { value: LeadStatus | 'ALL'; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'ALL', label: 'All' },
]

export default function PlatformLeads() {
  const [filter, setFilter] = useState<LeadStatus | 'ALL'>('NEW')
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const { data, isPending, isError } = useQuery({
    queryKey: ['leads', filter],
    queryFn: () => fetchLeads(filter === 'ALL' ? undefined : filter),
  })

  const triage = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => setLeadStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) =>
      showToast(error instanceof Error ? error.message : 'Could not update', 'error'),
  })

  const leads = data?.leads ?? []

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight text-ink">Enquiries</h1>
          <p className="mt-1 text-small text-ink-soft">
            Messages from the homepage contact form.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-lg px-3 py-1.5 text-small font-bold transition-colors duration-150 ${
                filter === item.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <p className="text-body text-ink-soft">Loading…</p>
      ) : isError ? (
        <p className="text-body text-status-danger">The enquiry list could not be loaded.</p>
      ) : leads.length === 0 ? (
        <Card variant="glass" className="rounded-3xl p-10 text-center">
          <p className="text-lead font-bold text-ink">Nothing here</p>
          <p className="mt-2 text-small text-ink-soft">
            {filter === 'NEW'
              ? 'No new enquiries. They arrive here the moment somebody sends the form.'
              : 'No enquiries with this status.'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadCard
                lead={lead}
                busy={triage.isPending}
                onStatus={(status) => triage.mutate({ id: lead.id, status })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LeadCard({
  lead,
  busy,
  onStatus,
}: {
  lead: Lead
  busy: boolean
  onStatus: (status: LeadStatus) => void
}) {
  const when = new Date(lead.createdAt)

  return (
    <Card variant="glass" className="rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lead font-black text-ink">{lead.restaurantName}</h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-caption font-bold ${
                lead.status === 'NEW'
                  ? 'border-accent/40 bg-accent-wash text-accent'
                  : lead.status === 'CONTACTED'
                    ? 'border-status-success/40 bg-status-success-wash text-status-success'
                    : 'border-border bg-surface-strong text-ink-faint'
              }`}
            >
              {lead.status}
            </span>
            {lead.locale === 'ar' ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-caption font-bold text-ink-soft">
                يفضّل العربية
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-small text-ink-soft">
            {lead.contactName}
            {lead.city ? ` · ${lead.city}` : ''}
            {lead.branches ? ` · ${lead.branches} branches` : ''}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-small">
            <a href={`tel:${lead.phone}`} className="font-bold text-accent hover:underline">
              {lead.phone}
            </a>
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="font-bold text-accent hover:underline">
                {lead.email}
              </a>
            ) : null}
          </div>

          {lead.message ? (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap rounded-xl bg-ground-sunken p-4 text-small leading-relaxed text-ink-soft">
              {lead.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-3">
          <time className="text-caption text-ink-faint" dateTime={when.toISOString()}>
            {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>

          <div className="flex gap-2">
            {lead.status !== 'CONTACTED' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus('CONTACTED')}
                className="pressable rounded-lg border border-border bg-surface px-3 py-1.5 text-small font-bold text-ink disabled:opacity-50"
              >
                Mark contacted
              </button>
            ) : null}
            {lead.status !== 'ARCHIVED' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus('ARCHIVED')}
                className="pressable rounded-lg border border-border px-3 py-1.5 text-small font-bold text-ink-soft disabled:opacity-50"
              >
                Archive
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
