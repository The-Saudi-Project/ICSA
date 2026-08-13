import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  createRestaurant,
  fetchAudit,
  fetchRestaurants,
  setRestaurantStatus,
  type PlatformRestaurant,
  fetchPlatformStats,
  resetRestaurantOwnerPassword,
} from '../../lib/staffApi.js'
import { relativeTime } from '../../lib/format.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

export default function Platform() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform'] })

  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: fetchPlatformStats })
  const restaurants = useQuery({ queryKey: ['platform', 'restaurants'], queryFn: fetchRestaurants })
  const audit = useQuery({ queryKey: ['platform', 'audit'], queryFn: fetchAudit })

  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = location.pathname.endsWith('/tenants') ? 'tenants' 
                  : location.pathname.endsWith('/security') ? 'security' 
                  : 'overview'
  
  const [showProvisionModal, setShowProvisionModal] = useState(false)

  const [draft, setDraft] = useState({ name: '', slug: '', type: 'SINGLE', parentId: '', ownerEmail: '', ownerName: '' })
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chainMains = restaurants.data?.restaurants.filter((r) => r.type === 'CHAIN_MAIN') ?? []
  
  const create = useMutation({
    mutationFn: () =>
      createRestaurant({
        name: { en: draft.name.trim() },
        slug: draft.slug.trim(),
        type: draft.type,
        ...(draft.type === 'BRANCH' && draft.parentId ? { parentId: draft.parentId } : {}),
        owner: { email: draft.ownerEmail.trim(), name: draft.ownerName.trim() },
      }),
    onSuccess: (result) => {
      setSecret({
        label: `Password for ${result.owner.email}`,
        value: result.temporaryPassword,
      })
      setDraft({ name: '', slug: '', type: 'SINGLE', parentId: '', ownerEmail: '', ownerName: '' })
      setError(null)
      refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  const suspend = useMutation({
    mutationFn: (r: PlatformRestaurant) =>
      setRestaurantStatus(r.id, r.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'),
    onSettled: refresh,
    onError: (e: Error) => setError(e.message),
  })

  const resetPassword = useMutation({
    mutationFn: (id: string) => resetRestaurantOwnerPassword(id),
    onSuccess: (result) => {
      setSecret({
        label: `New password for ${result.ownerEmail}`,
        value: result.temporaryPassword,
      })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const statusColor = (s: string) =>
    s === 'ACTIVE' ? 'bg-status-success-wash text-status-success border-status-success/20'
      : s === 'SUSPENDED' ? 'bg-status-danger-wash text-status-danger border-status-danger/20'
      : 'bg-surface text-ink-soft border-border'

  return (
    <div className="min-h-full transition-colors pb-20 relative">
      <main className="mx-auto max-w-6xl px-4 md:px-8 py-10 animate-fade-in">
        
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <h1 className="text-display font-black text-ink tracking-tight drop-shadow-sm">
              {activeTab === 'tenants' ? 'Tenant Directory' : activeTab === 'security' ? 'Security & Audit' : 'Platform Console'}
            </h1>
            <p className="text-lead text-ink-soft mt-1">Manage tenants, view platform metrics, and monitor activity.</p>
          </div>
          
          {activeTab === 'tenants' && (
            <div className="flex items-center gap-3 md:mt-2">
               <span className="text-small bg-surface-strong border border-border px-4 py-2 rounded-full text-ink-soft font-bold shadow-sm backdrop-blur-md">
                 {restaurants.data?.restaurants.length || 0} Total
               </span>
               <Button variant="primary" onClick={() => setShowProvisionModal(true)} className="flex items-center gap-2 px-4 py-2 text-small h-auto rounded-xl">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                 Provision
               </Button>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="relative">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <section className="animate-slide-up">
              <h2 className="text-small font-bold uppercase tracking-wider text-ink-faint mb-4 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                Platform Health
              </h2>
              
              {stats.isPending ? (
                <p className="text-ink-soft">Loading stats...</p>
              ) : stats.error ? (
                <Card variant="glass" className="p-4 border-status-danger bg-status-danger-wash text-status-danger">
                  Failed to load platform stats.
                </Card>
              ) : (
                <div className="grid gap-6 sm:grid-cols-3 stagger">
                  <Card variant="glass" className="p-6">
                    <span className="text-small font-bold text-ink-soft uppercase tracking-wider flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                      Active Tenants
                    </span>
                    <span className="text-display text-accent font-black mt-2 block">{stats.data.totalRestaurants}</span>
                  </Card>
                  <Card variant="glass" className="p-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-gold-wash to-transparent pointer-events-none"></div>
                    <span className="text-small font-bold text-ink-soft uppercase tracking-wider flex items-center gap-2 relative z-10">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      Today's Orders
                    </span>
                    <span className="text-display text-gold font-black mt-2 block relative z-10">{stats.data.todayPlatformOrders}</span>
                  </Card>
                  <Card variant="glass" className="p-6">
                    <span className="text-small font-bold text-ink-soft uppercase tracking-wider flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                      Total Users
                    </span>
                    <span className="text-display text-ink font-black mt-2 block">{stats.data.totalUsers}</span>
                  </Card>
                </div>
              )}
            </section>
          )}

          {/* TENANTS TAB */}
          {activeTab === 'tenants' && (
            <section className="animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-small font-bold uppercase tracking-wider text-ink-faint flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                  Tenant Directory
                </h2>
              </div>

              {restaurants.isPending ? <p className="py-6 text-body text-ink-soft">Loading directory…</p> : null}

              <div className="grid gap-4 md:grid-cols-2 stagger">
                {restaurants.data?.restaurants.map((r) => {
                  let typeLabel = 'Single Location'
                  if (r.type === 'CHAIN_MAIN') typeLabel = 'Brand HQ'
                  if (r.type === 'BRANCH') {
                    const parent = restaurants.data.restaurants.find(p => p.id === r.parentId)
                    typeLabel = parent ? `Branch of ${parent.name.en}` : 'Branch'
                  }
                  return (
                  <Card key={r.id} variant="glass" className="p-0 overflow-hidden flex flex-col relative group">
                    <div className="absolute inset-0 bg-gradient-to-b from-surface-hover to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    <div 
                       className="p-6 flex-1 relative z-10 border-b border-border/50 cursor-pointer hover:bg-surface-hover/30 transition-colors"
                       onClick={() => navigate(`/platform/tenants/${r.id}`)}
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                         <div>
                           <h3 className="text-h2 font-bold text-ink group-hover:text-accent transition-colors">{r.name.en}</h3>
                           <p className="text-small font-mono text-ink-soft mt-1 flex items-center gap-1">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                             /{r.slug}
                           </p>
                         </div>
                         <span className={`px-2.5 py-1 rounded-md text-caption font-black border uppercase tracking-wider ${statusColor(r.status)}`}>
                           {r.status}
                         </span>
                      </div>
                      <div className="flex items-center gap-3 mt-6">
                         <span className="text-caption bg-surface-strong border border-border px-2.5 py-1 rounded-md text-ink font-semibold">{typeLabel}</span>
                         <span className="text-caption text-ink-soft flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                            {r.staffCount} Staff
                         </span>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-surface-hover/50 flex items-center justify-end gap-3 relative z-10">
                      <Button
                        variant="ghost"
                        onClick={() => suspend.mutate(r)}
                        disabled={suspend.isPending}
                        className={r.status === 'SUSPENDED' ? 'text-status-success' : 'text-status-warning'}
                      >
                        {r.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`Reset the owner password for ${r.name.en}?`)) {
                            resetPassword.mutate(r.id)
                          }
                        }}
                        disabled={resetPassword.isPending}
                        className="text-status-danger hover:bg-status-danger-wash"
                      >
                        Reset Password
                      </Button>
                    </div>
                  </Card>
                )})}
              </div>
            </section>
          )}

          {/* SECURITY & AUDIT TAB */}
          {activeTab === 'security' && (
            <section className="animate-slide-up">
              <h2 className="text-small font-bold uppercase tracking-wider text-ink-faint mb-4 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Security & Audit Trail
              </h2>
              
              <Card variant="glass" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-hover/80 border-b border-border text-small text-ink-soft font-bold uppercase tracking-widest">
                        <th className="py-4 px-6 whitespace-nowrap">Timestamp</th>
                        <th className="py-4 px-6 whitespace-nowrap">Action</th>
                        <th className="py-4 px-6 whitespace-nowrap">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="text-body text-ink">
                      {audit.data?.events.map((e) => (
                        <tr key={e.id} className="border-b border-border/40 last:border-b-0 hover:bg-surface transition-colors">
                          <td className="py-4 px-6 whitespace-nowrap text-small text-ink-soft font-mono">{relativeTime(e.at)}</td>
                          <td className="py-4 px-6 font-semibold">
                             <span className="bg-surface-strong px-2.5 py-1 rounded-md text-small tracking-wide border border-border/50 shadow-sm">{e.action}</span>
                          </td>
                          <td className="py-4 px-6 text-small text-ink-soft">
                             <span className="flex items-center gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                {e.actorType}{e.actorRole ? ` · ${e.actorRole}` : ''}
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}
        </div>
      </main>

      {/* PROVISION TENANT MODAL */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           {/* Backdrop */}
           <div className="absolute inset-0 bg-ground/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowProvisionModal(false)}></div>
           
           {/* Modal Dialog */}
           <Card variant="glass" className="relative z-10 w-full max-w-lg p-8 shadow-2xl animate-slide-up border-border-strong">
              <div className="flex items-center justify-between mb-6">
                 <h2 className="text-h2 font-black tracking-tight text-ink">Provision Tenant</h2>
                 <button onClick={() => setShowProvisionModal(false)} className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-soft hover:text-ink transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <Input 
                   label="Restaurant Name" 
                   value={draft.name} 
                   onChange={(e) => setDraft({ ...draft, name: e.target.value })} 
                   placeholder="e.g. Malabar Spice" 
                />
                <Input 
                   label="URL Slug" 
                   value={draft.slug} 
                   onChange={(e) => setDraft({ ...draft, slug: e.target.value })} 
                   placeholder="e.g. malabar-spice" 
                />
                
                <div>
                  <label className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">Type</label>
                  <select className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash transition-all shadow-sm" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                    <option value="SINGLE">Single Location</option>
                    <option value="CHAIN_MAIN">Brand HQ</option>
                    <option value="BRANCH">Chain Branch</option>
                  </select>
                </div>

                {draft.type === 'BRANCH' ? (
                  <div className="animate-fade-in">
                    <label className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">Parent Brand</label>
                    <select className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash transition-all shadow-sm" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                      <option value="">Select HQ...</option>
                      {chainMains.map(hq => (
                        <option key={hq.id} value={hq.id}>{hq.name.en}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="pt-6 mt-6 border-t border-border/50">
                   <h3 className="text-small font-bold uppercase tracking-wider text-ink-faint mb-4">Owner Details</h3>
                   <div className="space-y-4">
                      <Input 
                         label="Owner Email" 
                         type="email" 
                         value={draft.ownerEmail} 
                         onChange={(e) => setDraft({ ...draft, ownerEmail: e.target.value })} 
                         placeholder="owner@example.com" 
                      />
                      <Input 
                         label="Owner Name" 
                         value={draft.ownerName} 
                         onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} 
                         placeholder="e.g. Jane Doe" 
                      />
                   </div>
                </div>
              </div>

              {error ? (
                <div role="alert" className="mt-6 rounded-xl bg-status-danger-wash p-4 border border-status-danger/20 flex items-start gap-3">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <p className="text-small text-status-danger font-medium">{error}</p>
                </div>
              ) : null}

              {secret ? (
                <div className="mt-6 rounded-2xl bg-gold-wash border border-gold/30 p-5 animate-slide-up shadow-lg">
                  <p className="text-small font-black text-gold uppercase tracking-wider flex items-center gap-2">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                     {secret.label}
                  </p>
                  <div className="mt-3 bg-surface-strong p-4 rounded-xl font-mono text-body text-gold-bright break-all select-all border border-gold/20 shadow-inner">
                    {secret.value}
                  </div>
                  <p className="mt-3 text-caption text-gold-dim/90 font-medium">Copy this password immediately. It will not be shown again.</p>
                  <Button variant="secondary" onClick={() => { setSecret(null); setShowProvisionModal(false) }} className="w-full mt-4 bg-surface text-gold border-gold/30 hover:bg-gold/10 hover:border-gold/50">
                    I have saved it
                  </Button>
                </div>
              ) : (
                <div className="mt-8 flex gap-3">
                   <Button variant="ghost" onClick={() => setShowProvisionModal(false)} className="flex-1">Cancel</Button>
                   <Button
                     variant="primary"
                     disabled={!draft.name.trim() || !draft.slug.trim() || !draft.ownerEmail.trim() || !draft.ownerName.trim() || (draft.type === 'BRANCH' && !draft.parentId) || create.isPending}
                     onClick={() => create.mutate()}
                     className="flex-1"
                   >
                     {create.isPending ? 'Provisioning...' : 'Provision Tenant'}
                   </Button>
                </div>
              )}
           </Card>
        </div>
      )}

    </div>
  )
}
