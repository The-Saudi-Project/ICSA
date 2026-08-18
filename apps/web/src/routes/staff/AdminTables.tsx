/**
 * `/admin/tables` — glass tables, QR display in glass card.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  createTable,
  deleteTable,
  fetchStaffImage,
  fetchTables,
  rotateTableToken,
  updateTable,
  type AdminTable,
} from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import { AdminSection, Field, inputClass, primaryButtonClass, quietButtonClass } from './AdminShell.js'

/**
 * Loads the QR PNG through the authenticated staff client.
 *
 * An `<img src="/api/v1/app/tables/:id/qr">` cannot work: the browser sends that
 * GET with no `Authorization` header, and the staff access token deliberately
 * lives in memory rather than in a cookie, so the request arrives anonymous and
 * the route answers 401. Putting the token in the query string would fix the
 * image and leak a live credential into history and proxy logs, so instead the
 * bytes are fetched like any other staff call and handed over as an object URL.
 */
function useTableQr(tableId: string | undefined) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!tableId) return

    let objectUrl: string | null = null
    let cancelled = false

    setSrc(null)
    setFailed(false)

    fetchStaffImage(`/app/tables/${tableId}/qr`)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      // Without this every QR view leaks a blob for the life of the tab.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [tableId])

  return { src, failed }
}

/* ── Inline edit row ──────────────────────────────────────────────────────── */

function EditTableRow({
  table,
  onDone,
  onError,
}: {
  table: AdminTable
  onDone: () => void
  onError: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(table.label)
  const [zone, setZone] = useState(table.zone ?? '')

  const save = useMutation({
    mutationFn: () => {
      const body: { label?: string; zone?: string } = {}
      if (label.trim() !== table.label) body.label = label.trim()
      if (zone.trim() !== (table.zone ?? '')) body.zone = zone.trim()
      if (Object.keys(body).length === 0) {
        onDone()
        return Promise.resolve({ table })
      }
      return updateTable(table.id, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] })
      onDone()
    },
    onError: (e: Error) => onError(e.message),
  })

  return (
    <tr className="bg-accent-wash/20">
      <td className="py-3 px-6">
        <input
          className={`${inputClass} !py-2 text-body`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') save.mutate()
            if (e.key === 'Escape') onDone()
          }}
        />
      </td>
      <td className="py-3 px-6">
        <input
          className={`${inputClass} !py-2 text-small`}
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="e.g. Terrace"
          onKeyDown={(e) => {
            if (e.key === 'Enter') save.mutate()
            if (e.key === 'Escape') onDone()
          }}
        />
      </td>
      <td className="py-3 px-6">
        <span className="tnum rounded-full bg-surface-strong px-3 py-1 text-xs font-bold text-ink-soft ring-1 ring-border shadow-sm">
          v{table.tokenVersion}
        </span>
      </td>
      <td className="py-3 px-6">
        <div className="flex justify-end gap-2 flex-nowrap">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!label.trim() || save.isPending}
            className={`${primaryButtonClass} !py-1.5 !px-4 !text-small shrink-0`}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className={`${quietButtonClass} !py-1.5 shrink-0`}
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */

export default function AdminTables() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] })

  const { data, isPending } = useQuery({ queryKey: ['admin', 'tables'], queryFn: fetchTables })

  const [label, setLabel] = useState('')
  const [zone, setZone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState<AdminTable | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminTable | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showQr, setShowQr] = useState<AdminTable | null>(null)
  const [selectedTable, setSelectedTable] = useState<AdminTable | null>(null)
  const qr = useTableQr(showQr?.id)

  const add = useMutation({
    mutationFn: () => createTable(label.trim(), zone.trim() || undefined),
    onSuccess: () => {
      setLabel('')
      setZone('')
      setError(null)
      refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  const rotate = useMutation({
    mutationFn: (table: AdminTable) => rotateTableToken(table.id),
    onSuccess: () => {
      setConfirmRotate(null)
      refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (table: AdminTable) => deleteTable(table.id),
    onSuccess: () => {
      setConfirmDelete(null)
      // If the QR view was showing this table, close it
      if (showQr && showQr.id === confirmDelete?.id) setShowQr(null)
      refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-4">
      <AdminSection title="Add a table">
        <Card variant="glass" className="p-6 border-border/40 hover:border-border-strong transition-colors">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="w-full sm:w-40 shrink-0">
              <Field label="Label">
                <input
                  className={inputClass}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. 12"
                />
              </Field>
            </div>
            <div className="w-full sm:flex-1 max-w-sm">
              <Field label="Zone (optional)">
                <input
                  className={inputClass}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="e.g. Terrace"
                />
              </Field>
            </div>
            <button
              type="button"
              disabled={!label.trim() || add.isPending}
              onClick={() => add.mutate()}
              className={`${primaryButtonClass} w-full sm:w-auto h-[46px] shrink-0`}
            >
              Add table
            </button>
          </div>

          {error ? (
            <div role="alert" className="mt-6 rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {error}
            </div>
          ) : null}
        </Card>
      </AdminSection>

      <AdminSection
        title="Tables"
        action={
          <a
            href={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1/app/tables/export` : '/api/v1/app/tables/export'}
            className="pressable text-small font-bold text-accent hover:text-accent-dim hover:underline flex items-center gap-2 bg-accent-wash px-4 py-2 rounded-xl transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export CSV
          </a>
        }
      >
        {isPending ? <p className="py-6 text-body text-ink-soft">Loading…</p> : null}

        <Card variant="glass" className="hidden md:block overflow-hidden border-border/40 p-0">
          <div className="overflow-x-auto w-full">
            <table className="w-full whitespace-nowrap">
              <thead>
              <tr className="border-b border-border/50 bg-surface-strong/30 text-small font-bold text-ink-soft uppercase tracking-wider">
                <th className="py-4 px-6 text-start">Table</th>
                <th className="py-4 px-6 text-start">Zone</th>
                <th className="py-4 px-6 text-start">Tag version</th>
                <th className="py-4 px-6 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data?.tables.map((table) =>
                editingId === table.id ? (
                  <EditTableRow
                    key={table.id}
                    table={table}
                    onDone={() => setEditingId(null)}
                    onError={(msg) => {
                      setEditingId(null)
                      setError(msg)
                    }}
                  />
                ) : (
                  <tr key={table.id} className="group hover:bg-surface-hover/50 transition-colors">
                    <td className="py-4 px-6 text-body font-bold text-ink group-hover:text-accent transition-colors">{table.label}</td>
                    <td className="py-4 px-6 text-small text-ink-soft">{table.zone ?? '—'}</td>
                    <td className="py-4 px-6">
                      <span className="tnum rounded-full bg-surface-strong px-3 py-1 text-xs font-bold text-ink-soft ring-1 ring-border shadow-sm">
                        v{table.tokenVersion}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        {/* Open Link */}
                        {table.url ? (
                          <a
                            href={table.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${quietButtonClass} !py-1.5 inline-flex items-center gap-1.5`}
                            title="Open table link in new tab"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Open
                          </a>
                        ) : null}
                        {/* QR Code */}
                        <button
                          type="button"
                          onClick={() => setShowQr(table)}
                          disabled={!table.url}
                          className={`${quietButtonClass} !py-1.5`}
                        >
                          {table.url ? 'QR Code' : 'Unavailable'}
                        </button>
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => setEditingId(table.id)}
                          className={`${quietButtonClass} !py-1.5 inline-flex items-center gap-1.5`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(table)}
                          className={`${quietButtonClass} !py-1.5 inline-flex items-center gap-1.5 text-status-danger hover:bg-status-danger-wash hover:ring-status-danger/30`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          Delete
                        </button>
                        {/* Rotate Tag */}
                        <button
                          type="button"
                          onClick={() => setConfirmRotate(table)}
                          className={`${quietButtonClass} !py-1.5`}
                        >
                          Rotate Tag
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {data?.tables.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-strong text-ink-faint mb-3 ring-1 ring-border">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                    </div>
                    <p className="text-body font-medium text-ink-soft">No tables yet. Add one above.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile List View */}
        <div className="md:hidden flex flex-col gap-3">
          {data?.tables.map((table) => (
            <Card key={table.id} variant="glass" className="p-4 flex items-center justify-between border-border/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-surface-strong to-border flex flex-col items-center justify-center shrink-0 border border-border/50 text-ink font-bold shadow-sm">
                  <span className="text-xs text-ink-faint uppercase font-medium leading-none mb-0.5">Table</span>
                  <span className="leading-none">{table.label}</span>
                </div>
                <div>
                  <p className="text-body font-bold text-ink">
                    {table.zone ? table.zone : 'No Zone'}
                  </p>
                  <p className="text-small text-ink-soft mt-0.5">
                    Tag v{table.tokenVersion}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTable(table)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-strong text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors shrink-0"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
            </Card>
          ))}
          {data?.tables.length === 0 ? (
            <div className="py-10 text-center glass rounded-xl border border-border/40">
              <p className="text-body font-medium text-ink-soft">No tables yet.</p>
            </div>
          ) : null}
        </div>
      </AdminSection>

      {/* QR Code display */}
      {showQr ? (
        <AdminSection
          title={`Table ${showQr.label}`}
          action={
            <button type="button" onClick={() => setShowQr(null)} className={quietButtonClass}>
              Close
            </button>
          }
        >
          <Card variant="glass" className="mt-4 p-8 border-border/40 shadow-lg flex flex-col md:flex-row items-center md:items-start gap-8">
            <div className="relative shrink-0 p-4 bg-white rounded-2xl shadow-sm ring-1 ring-border/50">
              {qr.src ? (
                <img
                  src={qr.src}
                  alt={`QR code for table ${showQr.label}`}
                  width={200}
                  height={200}
                  className="rounded-lg mix-blend-multiply"
                />
              ) : (
                <div
                  className="grid size-[200px] place-items-center rounded-lg px-4 text-center text-caption font-medium text-slate-500"
                  role={qr.failed ? 'alert' : 'status'}
                >
                  {qr.failed
                    ? 'Could not load the QR code. The tag URL beside this still works.'
                    : 'Loading…'}
                </div>
              )}
              <div className="absolute inset-0 border-2 border-accent/20 rounded-2xl pointer-events-none"></div>
            </div>
            
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <p className="text-small font-bold uppercase tracking-wider text-ink-soft mb-2">
                  Tag URL
                </p>
                <div className="relative group">
                  <p className="rounded-xl bg-surface-strong px-5 py-4 font-mono text-small break-all select-all ring-1 ring-border text-accent shadow-inner">
                    {showQr.url}
                  </p>
                </div>
              </div>

              {/* Action buttons for the QR view */}
              <div className="flex flex-wrap gap-3">
                {showQr.url ? (
                  <a
                    href={showQr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${primaryButtonClass} inline-flex items-center gap-2`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open Link
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (showQr.url) {
                      void navigator.clipboard.writeText(showQr.url)
                    }
                  }}
                  disabled={!showQr.url}
                  className={`${quietButtonClass} inline-flex items-center gap-2`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowQr(null)
                    setEditingId(showQr.id)
                  }}
                  className={`${quietButtonClass} inline-flex items-center gap-2`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Table
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowQr(null)
                    setConfirmDelete(showQr)
                  }}
                  className={`${quietButtonClass} inline-flex items-center gap-2 text-status-danger hover:bg-status-danger-wash hover:ring-status-danger/30`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  Delete Table
                </button>
              </div>

              <p className="text-small leading-relaxed text-ink-soft">
                Write this to an <strong className="text-ink font-semibold">NTAG215</strong> chip as a single URL record, and print the QR code beside
                it for phones without NFC. Anyone who has this URL can order at this table, so
                treat a printed copy the way you would treat a key.
              </p>
            </div>
          </Card>
        </AdminSection>
      ) : null}

      {/* Delete confirmation */}
      {confirmDelete ? (
        <AdminSection title="Delete this table">
          <Card variant="glass" className="mt-4 p-8 border-status-danger/30 bg-status-danger-wash/50 shadow-lg max-w-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-status-danger/20 rounded-full blur-[40px] -mr-10 -mt-10"></div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-status-danger/20 text-status-danger flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Permanently Delete Table</h3>
                  <p className="text-body mt-2 leading-relaxed">
                    Table <strong className="font-bold">{confirmDelete.label}</strong> will be permanently removed.
                    Any active sessions on this table will be closed immediately.
                  </p>
                  <p className="text-small text-ink-soft mt-3 leading-relaxed">
                    This action cannot be undone. You will need to create a new table, write a new NFC tag,
                    and print a new QR code to replace it.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-status-danger/20">
                <button
                  type="button"
                  onClick={() => remove.mutate(confirmDelete)}
                  disabled={remove.isPending}
                  className="pressable rounded-xl bg-status-danger hover:bg-red-700 px-6 py-2.5 text-body font-bold text-white shadow-md transition-colors"
                >
                  {remove.isPending ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className={quietButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </AdminSection>
      ) : null}

      {/* Rotate confirmation */}
      {confirmRotate ? (
        <AdminSection title="Rotate this tag">
          <Card variant="glass" className="mt-4 p-8 border-status-warning/30 bg-status-warning-wash/50 shadow-lg max-w-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-status-warning/20 rounded-full blur-[40px] -mr-10 -mt-10"></div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-status-warning/20 text-status-warning flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Warning: Immediate Disconnection</h3>
                  <p className="text-body mt-2 leading-relaxed">
                    Table <strong className="font-bold">{confirmRotate.label}</strong> will get a new code and the old one stops working
                    straight away. Anyone currently ordering at this table will be signed out.
                  </p>
                  <p className="text-small text-ink-soft mt-3 leading-relaxed">
                    You will need to rewrite the NFC tag and reprint the QR code before the table can be
                    used again. Do this if a card is lost or stolen.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-status-warning/20">
                <button
                  type="button"
                  onClick={() => rotate.mutate(confirmRotate)}
                  disabled={rotate.isPending}
                  className="pressable rounded-xl bg-status-warning hover:bg-orange-600 px-6 py-2.5 text-body font-bold text-white shadow-md transition-colors"
                >
                  {rotate.isPending ? 'Rotating…' : 'Rotate the tag'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRotate(null)}
                  className={quietButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </AdminSection>
      ) : null}

      {/* Mobile Action Modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center md:hidden">
          <div className="absolute inset-0 bg-ground/80 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedTable(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-surface rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-slide-up border border-border">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-surface-strong to-border flex flex-col items-center justify-center shrink-0 border border-border/50 text-ink font-bold shadow-sm">
                  <span className="text-[10px] text-ink-faint uppercase font-medium leading-none mb-0.5">Table</span>
                  <span className="leading-none text-small">{selectedTable.label}</span>
                </div>
                <div>
                  <h3 className="text-h4 font-bold text-ink">Table {selectedTable.label}</h3>
                  <p className="text-small text-ink-soft">{selectedTable.zone || 'No Zone'} • Tag v{selectedTable.tokenVersion}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTable(null)} className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-soft hover:text-ink">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="space-y-3">
              {selectedTable.url ? (
                <a
                  href={selectedTable.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl font-bold bg-accent-wash text-accent hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open Ordering Link
                </a>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setShowQr(selectedTable)
                  setSelectedTable(null)
                }}
                disabled={!selectedTable.url}
                className="w-full py-3 px-4 rounded-xl font-bold bg-surface-strong text-ink hover:bg-surface-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                {selectedTable.url ? 'Show QR Code' : 'QR Unavailable'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingId(selectedTable.id)
                  setSelectedTable(null)
                  // Smooth scroll to top where edit row appears
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="w-full py-3 px-4 rounded-xl font-bold bg-surface-strong text-ink hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit Table
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmRotate(selectedTable)
                  setSelectedTable(null)
                }}
                className="w-full py-3 px-4 rounded-xl font-bold bg-status-warning-wash/50 text-status-warning hover:bg-status-warning-wash transition-colors flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                Rotate NFC Tag
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(selectedTable)
                  setSelectedTable(null)
                }}
                className="w-full py-3 px-4 rounded-xl font-bold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
