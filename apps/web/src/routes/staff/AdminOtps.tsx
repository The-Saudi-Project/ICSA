import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card.js'
import { staffApi } from '../../lib/staffApi.js'
import { deleteMockOtp, deleteAllMockOtps } from '../../lib/staffApi.js'

export default function AdminOtps() {
  const queryClient = useQueryClient()
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mock-otps'],
    queryFn: () => staffApi<{ otps: { _id: string; phone: string; code: string; createdAt: string; usedAt?: string }[] }>('/customers/mock-otps')
  })

  const deleteOne = useMutation({
    mutationFn: (id: string) => deleteMockOtp(id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => {
      setDeletingId(null)
      queryClient.invalidateQueries({ queryKey: ['mock-otps'] })
    }
  })

  const clearAll = useMutation({
    mutationFn: deleteAllMockOtps,
    onSettled: () => {
      setConfirmClearAll(false)
      queryClient.invalidateQueries({ queryKey: ['mock-otps'] })
    }
  })

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-ink">Mock OTPs</h1>
          <p className="text-body text-ink-soft mt-1">Recent OTPs generated for customer phone verification.</p>
        </div>
        {(data?.otps ?? []).length > 0 && (
          <button
            onClick={() => setConfirmClearAll(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-status-danger border border-status-danger/40 bg-status-danger-wash hover:bg-status-danger/20 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Clear All
          </button>
        )}
      </div>

      {/* Confirm Clear All dialog */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-status-danger-wash text-status-danger">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <h2 className="text-lg font-bold text-ink">Delete all OTPs?</h2>
            </div>
            <p className="text-ink-soft text-sm">This will permanently remove all OTP records from the database. This action cannot be undone.</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-ink bg-surface border border-border hover:bg-surface/60 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-status-danger hover:brightness-110 disabled:opacity-60 transition-all text-sm"
              >
                {clearAll.isPending ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card variant="glass" className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-ink-soft">Loading OTPs...</div>
        ) : isError ? (
          <div className="p-8 text-center text-status-danger">Failed to load OTPs.</div>
        ) : data?.otps.length === 0 ? (
          <div className="p-8 text-center text-ink-soft">No OTPs generated yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface border-b border-border text-ink-soft">
                  <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Phone</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">OTP Code</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Requested At</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Status</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data?.otps.map((otp) => (
                  <tr key={otp._id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-ink">{otp.phone}</td>
                    <td className="px-6 py-4 font-black tracking-widest text-ink">{otp.code}</td>
                    <td className="px-6 py-4 text-ink-soft">{new Date(otp.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {otp.usedAt ? (
                        <span className="text-status-success font-bold text-sm bg-status-success-wash px-2 py-1 rounded-md">Used</span>
                      ) : (
                        <span className="text-status-warning font-bold text-sm bg-status-warning-wash px-2 py-1 rounded-md">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => deleteOne.mutate(otp._id)}
                        disabled={deletingId === otp._id}
                        title="Delete OTP"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-soft hover:text-status-danger hover:bg-status-danger-wash disabled:opacity-40 transition-all"
                      >
                        {deletingId === otp._id ? (
                          <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
