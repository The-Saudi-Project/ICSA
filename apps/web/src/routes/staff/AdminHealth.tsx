import { useQuery } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card.js'
import { fetchHealth, fetchReady } from '../../lib/staffApi.js'

export default function AdminHealth() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000, // Poll every 5s
  })

  const ready = useQuery({
    queryKey: ['ready'],
    queryFn: fetchReady,
    refetchInterval: 5000,
  })

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${d}d ${h}h ${m}m ${s}s`
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in">
      <h1 className="text-4xl font-extrabold text-ink mb-2">System Health</h1>
      <p className="text-body text-ink-soft mb-8">Real-time monitoring of backend services and database connections.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Liveness */}
        <Card variant="glass" className="p-6 relative overflow-hidden group">
          <div className={`absolute inset-y-0 left-0 w-2 ${health.data?.status === 'ok' ? 'bg-status-success' : 'bg-status-danger'}`}></div>
          <div className="flex justify-between items-start mb-4 pl-4">
            <div>
              <h2 className="text-xl font-bold text-ink">API Server</h2>
              <p className="text-sm font-medium text-ink-faint">Liveness (/health)</p>
            </div>
            {health.isPending ? (
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
            ) : (
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${health.data?.status === 'ok' ? 'bg-status-success-wash text-status-success' : 'bg-status-danger-wash text-status-danger'}`}>
                {health.data?.status || 'Offline'}
              </span>
            )}
          </div>
          
          <div className="pl-4">
            <p className="text-sm text-ink-soft mb-1 uppercase tracking-widest font-bold">Uptime</p>
            <p className="text-3xl font-black text-ink font-mono">
              {health.data ? formatUptime(health.data.uptimeSeconds) : '0d 0h 0m 0s'}
            </p>
          </div>
        </Card>

        {/* Readiness */}
        <Card variant="glass" className="p-6 relative overflow-hidden group">
          <div className={`absolute inset-y-0 left-0 w-2 ${ready.data?.status === 'ready' ? 'bg-status-success' : 'bg-status-danger'}`}></div>
          <div className="flex justify-between items-start mb-4 pl-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Database</h2>
              <p className="text-sm font-medium text-ink-faint">Readiness (/readyz)</p>
            </div>
            {ready.isPending ? (
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
            ) : (
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${ready.data?.status === 'ready' ? 'bg-status-success-wash text-status-success' : 'bg-status-danger-wash text-status-danger'}`}>
                {ready.data?.checks?.database === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
          
          <div className="pl-4">
             <p className="text-sm text-ink-soft mb-1 uppercase tracking-widest font-bold">Connection State</p>
             <p className="text-2xl font-black text-ink capitalize">
               {ready.data?.checks?.database || 'Unknown'}
             </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
