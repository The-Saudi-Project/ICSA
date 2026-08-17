import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
  getPlatformRestaurant,
  updatePlatformRestaurant,
  fetchPlatformRestaurantStaff,
  createPlatformRestaurantStaff,
  updatePlatformRestaurantStaff,
  disablePlatformRestaurantStaff,
  updatePlatformSubscription,
  updatePlatformFeatures,
  type AdminStaffMember,
} from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

export default function PlatformTenantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'settings' | 'staff' | 'billing' | 'features'>('settings')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform', 'restaurant', id] })

  const resQuery = useQuery({ queryKey: ['platform', 'restaurant', id, 'details'], queryFn: () => getPlatformRestaurant(id!) })
  const staffQuery = useQuery({ queryKey: ['platform', 'restaurant', id, 'staff'], queryFn: () => fetchPlatformRestaurantStaff(id!) })

  const restaurant = resQuery.data?.restaurant

  const [settingsDraft, setSettingsDraft] = useState({ nameEn: '', nameAr: '', slug: '', city: '' })
  
  // Sync draft when data loads
  if (restaurant && !settingsDraft.nameEn && !settingsDraft.slug) {
     setSettingsDraft({
        nameEn: restaurant.name.en,
        nameAr: restaurant.name.ar || '',
        slug: restaurant.slug,
        city: restaurant.city || ''
     })
  }

  const updateRes = useMutation({
    mutationFn: () => updatePlatformRestaurant(id!, {
       name: { en: settingsDraft.nameEn.trim(), ar: settingsDraft.nameAr.trim() || undefined },
       slug: settingsDraft.slug.trim(),
       city: settingsDraft.city.trim() || undefined,
    }),
    onSuccess: refresh,
  })

  // Staff Modal State
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffDraft, setStaffDraft] = useState({ name: '', email: '', role: 'OWNER' })
  const [staffSecret, setStaffSecret] = useState<string | null>(null)
  const [staffError, setStaffError] = useState<string | null>(null)

  const openAddStaff = () => {
     setEditingStaffId(null)
     setStaffDraft({ name: '', email: '', role: 'MANAGER' })
     setStaffSecret(null)
     setStaffError(null)
     setShowStaffModal(true)
  }

  const openEditStaff = (staff: AdminStaffMember) => {
     setEditingStaffId(staff.id)
     setStaffDraft({ name: staff.name, email: staff.email, role: staff.role })
     setStaffSecret(null)
     setStaffError(null)
     setShowStaffModal(true)
  }

  const createStaff = useMutation({
    mutationFn: () => createPlatformRestaurantStaff(id!, staffDraft),
    onSuccess: (res) => {
       setStaffSecret(res.temporaryPassword)
       refresh()
    },
    onError: (e: Error) => setStaffError(e.message)
  })

  const updateStaff = useMutation({
    mutationFn: () => updatePlatformRestaurantStaff(id!, editingStaffId!, { name: staffDraft.name, role: staffDraft.role }),
    onSuccess: () => {
       setShowStaffModal(false)
       refresh()
    },
    onError: (e: Error) => setStaffError(e.message)
  })

  const disableStaff = useMutation({
     mutationFn: (staffId: string) => disablePlatformRestaurantStaff(id!, staffId),
     onSuccess: refresh,
  })

  const enableStaff = useMutation({
     mutationFn: (staffId: string) => updatePlatformRestaurantStaff(id!, staffId, { status: 'ACTIVE' }),
     onSuccess: refresh,
  })

  if (resQuery.isPending) return <div className="p-8">Loading tenant details...</div>

  return (
    <div className="min-h-full transition-colors pb-20 relative">
      <main className="mx-auto max-w-6xl px-4 md:px-8 py-10 animate-fade-in">
        
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <button onClick={() => navigate('/platform/tenants')} className="text-small font-bold text-accent hover:text-accent-bright flex items-center gap-1 mb-2">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
               Back to Directory
            </button>
            <h1 className="text-display font-black text-ink tracking-tight drop-shadow-sm flex items-center gap-3">
              {restaurant?.name.en}
              <span className={`px-2.5 py-1 text-small font-black border uppercase tracking-wider rounded-md align-middle ${restaurant?.status === 'ACTIVE' ? 'bg-status-success-wash text-status-success border-status-success/20' : 'bg-status-danger-wash text-status-danger border-status-danger/20'}`}>
                 {restaurant?.status}
              </span>
            </h1>
            <p className="text-lead text-ink-soft mt-1">/{restaurant?.slug}</p>
          </div>
        </div>

        {/* Local Tabs */}
        <div className="flex bg-surface-strong p-1 rounded-2xl border border-border shadow-sm backdrop-blur-3xl w-fit mb-8 overflow-x-auto max-w-full">
            {(['settings', 'staff', 'billing', 'features'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-xl text-small font-bold capitalize transition-all duration-300 outline-none whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-accent text-white shadow-md scale-100' 
                    : 'text-ink-soft hover:text-ink hover:bg-surface-hover scale-95'
                }`}
              >
                {tab === 'staff' ? 'Staff & Permissions' : tab === 'billing' ? 'Billing & Plan' : tab}
              </button>
            ))}
        </div>

        {/* Tab Content */}
        <div className="relative">
          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <section className="animate-slide-up">
              <Card variant="glass" className="max-w-2xl p-6 sm:p-8">
                 <h2 className="text-h3 font-bold text-ink mb-6">Tenant Settings</h2>
                 <div className="space-y-4">
                    <Input 
                       label="Name (English)" 
                       value={settingsDraft.nameEn} 
                       onChange={(e) => setSettingsDraft(s => ({ ...s, nameEn: e.target.value }))} 
                    />
                    <Input 
                       label="Name (Arabic - Optional)" 
                       value={settingsDraft.nameAr} 
                       onChange={(e) => setSettingsDraft(s => ({ ...s, nameAr: e.target.value }))} 
                    />
                    <Input 
                       label="URL Slug" 
                       value={settingsDraft.slug} 
                       onChange={(e) => setSettingsDraft(s => ({ ...s, slug: e.target.value }))} 
                    />
                    <Input 
                       label="City" 
                       value={settingsDraft.city} 
                       onChange={(e) => setSettingsDraft(s => ({ ...s, city: e.target.value }))} 
                    />
                 </div>
                 <div className="mt-6 flex justify-end">
                    <Button 
                       variant="primary" 
                       onClick={() => updateRes.mutate()} 
                       disabled={updateRes.isPending || !settingsDraft.nameEn.trim() || !settingsDraft.slug.trim()}
                    >
                       {updateRes.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                 </div>
              </Card>
            </section>
          )}

          {/* STAFF TAB */}
          {activeTab === 'staff' && (
            <section className="animate-slide-up">
              <Card variant="glass" className="overflow-hidden">
                 <div className="p-6 border-b border-border flex justify-between items-center">
                    <h2 className="text-h3 font-bold text-ink">Staff Directory</h2>
                    <Button variant="primary" size="sm" onClick={openAddStaff}>+ Add User</Button>
                 </div>
                 
                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-hover/80 border-b border-border text-small text-ink-soft font-bold uppercase tracking-widest">
                          <th className="py-4 px-6 whitespace-nowrap">User</th>
                          <th className="py-4 px-6 whitespace-nowrap">Role</th>
                          <th className="py-4 px-6 whitespace-nowrap">Status</th>
                          <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-body text-ink">
                         {staffQuery.isPending && <tr><td colSpan={4} className="p-6 text-ink-soft">Loading staff...</td></tr>}
                         {staffQuery.data?.staff.map(u => (
                            <tr key={u.id} className="border-b border-border/40 last:border-b-0 hover:bg-surface transition-colors">
                               <td className="py-4 px-6">
                                  <p className="font-bold">{u.name}</p>
                                  <p className="text-small text-ink-soft">{u.email}</p>
                               </td>
                               <td className="py-4 px-6">
                                  <span className="bg-surface-strong px-2.5 py-1 rounded-md text-small font-bold border shadow-sm">{u.role}</span>
                               </td>
                               <td className="py-4 px-6">
                                  <span className={`text-small font-bold ${u.status === 'ACTIVE' ? 'text-status-success' : 'text-status-danger'}`}>{u.status}</span>
                               </td>
                               <td className="py-4 px-6 text-right space-x-2">
                                  <Button variant="ghost" size="sm" onClick={() => openEditStaff(u)}>Edit</Button>
                                  {u.status === 'ACTIVE' ? (
                                    <Button variant="ghost" size="sm" className="text-status-danger" onClick={() => {
                                       if (window.confirm(`Disable ${u.name}? They are signed out immediately and cannot sign in again. Their history is kept, and you can re-enable them here.`)) {
                                         disableStaff.mutate(u.id)
                                       }
                                    }}>Disable</Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" onClick={() => enableStaff.mutate(u.id)}>Enable</Button>
                                  )}
                               </td>
                            </tr>
                         ))}
                      </tbody>
                    </table>
                 </div>
              </Card>
            </section>
          )}

          {/* BILLING TAB */}
          {activeTab === 'billing' && (
            <section className="animate-slide-up">
              <Card variant="glass" className="max-w-2xl p-6 sm:p-8">
                 <h2 className="text-h3 font-bold text-ink mb-6">Subscription & Billing</h2>
                 <div className="space-y-4">
                    <div>
                      <label className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">Plan</label>
                      <select 
                        className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash" 
                        value={restaurant?.subscription?.plan ?? 'FREE'}
                        onChange={(e) => {
                          if (window.confirm(`Change plan to ${e.target.value}?`)) {
                            updatePlatformSubscription(id!, { plan: e.target.value, status: restaurant?.subscription?.status ?? 'ACTIVE' }).then(refresh)
                          }
                        }}
                      >
                        <option value="FREE">Free</option>
                        <option value="PRO">Pro</option>
                        <option value="ENTERPRISE">Enterprise</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">Status</label>
                      <select 
                        className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash" 
                        value={restaurant?.subscription?.status ?? 'ACTIVE'}
                        onChange={(e) => {
                          if (window.confirm(`Change subscription status to ${e.target.value}?`)) {
                            updatePlatformSubscription(id!, { plan: restaurant?.subscription?.plan ?? 'FREE', status: e.target.value }).then(refresh)
                          }
                        }}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="PAST_DUE">Past Due</option>
                        <option value="CANCELED">Canceled</option>
                      </select>
                    </div>
                 </div>
              </Card>
            </section>
          )}

          {/* FEATURES TAB */}
          {activeTab === 'features' && (
            <section className="animate-slide-up">
              <Card variant="glass" className="max-w-2xl p-6 sm:p-8">
                 <h2 className="text-h3 font-bold text-ink mb-6">Feature Flags</h2>
                 <div className="space-y-4">
                    {[
                      { id: 'table_qr', label: 'Table QR Ordering' },
                      { id: 'pos_access', label: 'POS Terminal Access' },
                      { id: 'advanced_reports', label: 'Advanced Reporting' },
                      { id: 'kitchen_display', label: 'Kitchen Display System' }
                    ].map(feature => {
                      const enabled = restaurant?.features?.includes(feature.id) ?? false
                      return (
                        <div key={feature.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-surface-hover/30">
                          <span className="text-body font-semibold text-ink">{feature.label}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className={enabled ? 'text-status-success bg-status-success-wash' : 'text-ink-soft bg-surface-hover'}
                            onClick={() => {
                              const current = restaurant?.features ?? []
                              const updated = enabled 
                                ? current.filter(f => f !== feature.id)
                                : [...current, feature.id]
                              updatePlatformFeatures(id!, updated).then(refresh)
                            }}
                          >
                            {enabled ? 'Enabled' : 'Disabled'}
                          </Button>
                        </div>
                      )
                    })}
                 </div>
              </Card>
            </section>
          )}
        </div>
      </main>

      {/* STAFF MODAL */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-ground/80 backdrop-blur-sm animate-fade-in" onClick={() => !staffSecret && setShowStaffModal(false)}></div>
           
           <Card variant="glass" className="relative z-10 w-full max-w-md p-8 shadow-2xl animate-slide-up border-border-strong">
              <h2 className="text-h2 font-black tracking-tight text-ink mb-6">{editingStaffId ? 'Edit Permissions' : 'Add Staff'}</h2>
              
              {!staffSecret ? (
                 <div className="space-y-4">
                    <Input 
                       label="Name" 
                       value={staffDraft.name} 
                       onChange={e => setStaffDraft(s => ({ ...s, name: e.target.value }))} 
                    />
                    {!editingStaffId && (
                       <Input 
                          label="Email" 
                          type="email"
                          value={staffDraft.email} 
                          onChange={e => setStaffDraft(s => ({ ...s, email: e.target.value }))} 
                       />
                    )}
                    <div>
                       <label className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">Role</label>
                       <select className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash" value={staffDraft.role} onChange={e => setStaffDraft(s => ({ ...s, role: e.target.value }))}>
                          <option value="OWNER">Owner</option>
                          <option value="MANAGER">Manager</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="KITCHEN">Kitchen</option>
                       </select>
                    </div>

                    {staffError && <p className="text-status-danger text-small mt-2">{staffError}</p>}

                    <div className="mt-8 flex gap-3">
                       <Button variant="ghost" onClick={() => setShowStaffModal(false)} className="flex-1">Cancel</Button>
                       <Button 
                          variant="primary" 
                          className="flex-1"
                          onClick={() => editingStaffId ? updateStaff.mutate() : createStaff.mutate()}
                          disabled={createStaff.isPending || updateStaff.isPending || !staffDraft.name.trim() || (!editingStaffId && !staffDraft.email.trim())}
                       >
                          Save
                       </Button>
                    </div>
                 </div>
              ) : (
                 <div className="animate-slide-up">
                    <p className="text-small font-black text-status-success uppercase tracking-wider mb-3">Staff Created!</p>
                    <p className="text-body text-ink mb-2">Temporary Password for <strong>{staffDraft.email}</strong>:</p>
                    <div className="bg-surface-strong p-4 rounded-xl font-mono text-body text-ink break-all select-all border border-border">
                       {staffSecret}
                    </div>
                    <Button variant="primary" className="w-full mt-6" onClick={() => setShowStaffModal(false)}>Done</Button>
                 </div>
              )}
           </Card>
        </div>
      )}
    </div>
  )
}
