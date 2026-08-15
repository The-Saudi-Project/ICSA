import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchRestaurantStats, getStaffUser } from '../../lib/staffApi.js'
import { formatHalalas } from '@rw/shared/money'
import { Card } from '../../components/ui/Card.js'
import { Skeleton } from '../../components/ui/Skeleton.js'

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: fetchRestaurantStats })
  const user = getStaffUser()
  const firstName = user?.name.split(' ')[0] || 'Admin'

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="max-w-6xl mx-auto relative animate-fade-in pb-12 pt-16">
      {/* Decorative Background Orbs for Glassmorphism */}
      <div className="absolute top-[0%] left-[10%] w-96 h-96 bg-accent/15 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute top-[20%] right-[-5%] w-80 h-80 bg-gold/10 blur-[100px] rounded-full pointer-events-none mix-blend-screen" />

      {/* Header Section */}
      <div className="mb-10 relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-ink tracking-tight">
            {getGreeting()}, <span className="text-accent">{firstName}</span>.
          </h1>
          <p className="text-body text-ink-soft mt-2 max-w-2xl">
            Here's what's happening at your restaurant today. Monitor your key metrics and manage operations in real-time.
          </p>
        </div>
        <div className="text-right">
          <p className="text-small font-bold text-ink-faint uppercase tracking-wider">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <section className="relative z-10 mb-12">
        {stats.isPending ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger">
             {[1, 2, 3, 4].map(i => (
               <Card key={i} variant="glass" className="p-6 h-36 flex flex-col justify-between">
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-10 w-32 rounded mt-4" />
               </Card>
             ))}
          </div>
        ) : stats.error ? (
          <Card variant="glass" className="p-8 border-status-danger bg-status-danger-wash text-status-danger flex items-center justify-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-status-danger/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <div className="text-left">
              <h3 className="font-bold text-body">Unable to load metrics</h3>
              <p className="text-small opacity-80 mt-1">Please try refreshing the page or check your connection.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger">
            {/* Revenue */}
            <Card variant="glass" className="p-6 flex flex-col justify-between bg-gradient-to-br from-surface to-surface-strong shadow-lg border-border/40 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <span className="text-small font-bold text-ink-soft uppercase tracking-wider">Revenue</span>
                <div className="w-8 h-8 rounded-full bg-gold-wash text-gold flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                </div>
              </div>
              <div>
                <span className="text-3xl text-ink font-extrabold tracking-tight">{formatHalalas(stats.data.todayRevenueHalalas)}</span>
              </div>
            </Card>

            {/* Orders */}
            <Card variant="glass" className="p-6 flex flex-col justify-between bg-gradient-to-br from-surface to-surface-strong shadow-lg border-border/40 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <span className="text-small font-bold text-ink-soft uppercase tracking-wider">Orders</span>
                <div className="w-8 h-8 rounded-full bg-accent-wash text-accent flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                </div>
              </div>
              <div>
                <span className="text-3xl text-ink font-extrabold tracking-tight">{stats.data.todayOrdersCount}</span>
              </div>
            </Card>

            {/* Active Tickets (Highlighted) */}
            <Card variant="glass" className="relative p-6 flex flex-col justify-between shadow-lg border-accent/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/20 transition-all duration-300 overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent/5"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full blur-[40px] -mr-10 -mt-10 group-hover:bg-accent/30 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between mb-4">
                <span className="text-small font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {stats.data.activeOrders > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>}
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
                  </span>
                  Active Tickets
                </span>
                <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
              </div>
              <div className="relative z-10">
                <span className="text-4xl text-accent font-extrabold tracking-tight drop-shadow-sm">{stats.data.activeOrders}</span>
              </div>
            </Card>

            {/* Staff Online */}
            <Card variant="glass" className="p-6 flex flex-col justify-between bg-gradient-to-br from-surface to-surface-strong shadow-lg border-border/40 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                {/*
                  "Staff Online" was never true — nothing tracks presence, and
                  the figure is a head count of active accounts. A dashboard
                  number that claims more than it measures is worse than no
                  number, because someone will make a staffing decision on it.
                */}
                <span className="text-small font-bold text-ink-soft uppercase tracking-wider">Active Staff</span>
                <div className="w-8 h-8 rounded-full bg-status-info-wash text-status-info flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </div>
              </div>
              <div>
                <span className="text-3xl text-ink font-extrabold tracking-tight">{stats.data.staffCount}</span>
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="relative z-10 mt-16">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-h3 font-bold text-ink tracking-tight">
            Quick Actions
          </h2>
          <div className="h-px bg-border flex-1 opacity-50"></div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 stagger">
          <Link to="/cashier" className="block outline-none group">
            <Card variant="glass" className="relative p-8 h-full border-border/50 hover:border-gold/50 hover:bg-surface-hover/80 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1">
               <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
               <div className="relative z-10 flex items-start gap-5">
                 <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-wash to-gold/20 text-gold flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 group-hover:shadow-gold/20 transition-all duration-500 ease-bouncy">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M12 12h.01"></path><path d="M17 12h.01"></path><path d="M7 12h.01"></path></svg>
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-ink mb-1 group-hover:text-gold transition-colors duration-300">Cashier / Till</h3>
                   <p className="text-sm text-ink-soft leading-relaxed">Process walk-in orders, take payments, and clear ready orders for customers.</p>
                 </div>
               </div>
            </Card>
          </Link>
          
          <Link to="/kitchen" className="block outline-none group">
            <Card variant="glass" className="relative p-8 h-full border-border/50 hover:border-status-info/50 hover:bg-surface-hover/80 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1">
               <div className="absolute inset-0 bg-gradient-to-br from-status-info/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
               <div className="relative z-10 flex items-start gap-5">
                 <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-status-info-wash to-status-info/20 text-status-info flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 group-hover:shadow-status-info/20 transition-all duration-500 ease-bouncy">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M2 12h20"></path></svg>
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-ink mb-1 group-hover:text-status-info transition-colors duration-300">Kitchen Display</h3>
                   <p className="text-sm text-ink-soft leading-relaxed">View incoming tickets, manage prep times, and mark orders as ready for service.</p>
                 </div>
               </div>
            </Card>
          </Link>
          
          <Link to="/admin/menu" className="block outline-none group">
            <Card variant="glass" className="relative p-8 h-full border-border/50 hover:border-accent/50 hover:bg-surface-hover/80 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1">
               <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
               <div className="relative z-10 flex items-start gap-5">
                 <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-wash to-accent/20 text-accent flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 group-hover:shadow-accent/20 transition-all duration-500 ease-bouncy">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-ink mb-1 group-hover:text-accent transition-colors duration-300">Menu Editor</h3>
                   <p className="text-sm text-ink-soft leading-relaxed">Manage your catalog. Update items, adjust prices, and toggle availability on the fly.</p>
                 </div>
               </div>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  )
}
