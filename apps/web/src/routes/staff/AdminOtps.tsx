import { useQuery } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card.js'
import { staffApi } from '../../lib/staffApi.js'

export default function AdminOtps() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mock-otps'],
    queryFn: () => staffApi<{ otps: { phone: string; code: string; createdAt: string; usedAt?: string }[] }>('/customers/mock-otps')
  })

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-8">
      <div>
        <h1 className="text-h1 font-bold text-ink">Mock OTPs</h1>
        <p className="text-body text-ink-soft mt-1">Recent OTPs generated for customer phone verification.</p>
      </div>

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
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data?.otps.map((otp, i) => (
                  <tr key={i} className="hover:bg-surface/50 transition-colors">
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
