import { NavLink, Outlet, useNavigate, useLocation } from 'react-router'
import { getStaffUser, logout } from '../../lib/staffApi.js'
import { mayVisit } from '../../lib/roles.js'
import { Button } from '../../components/ui/Button.js'
import { useState } from 'react'
import { useTheme } from '../../lib/theme.js'

interface NavItem {
  to: string
  label: string
  icon: string
  /** Match this path exactly rather than by prefix, so a parent link does not stay lit on child routes. */
  end?: boolean
}

const RESTAURANT_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { to: '/admin/menu', label: 'Menu Editor', icon: 'M4 6h16M4 12h16M4 18h7' },
  { to: '/admin/tables', label: 'Tables & QR', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { to: '/admin/staff', label: 'Staff Directory', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
]

const OPS_NAV: NavItem[] = [
  { to: '/cashier', label: 'Cashier / Till', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { to: '/kitchen', label: 'Kitchen Display', icon: 'M2 12h20M12 2v20' },
]

const PLATFORM_NAV: NavItem[] = [
  { to: '/platform', label: 'Overview', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', end: true },
  { to: '/platform/tenants', label: 'Tenant Directory', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  { to: '/platform/security', label: 'Security & Audit', icon: 'M3 11h18M7 11V7a5 5 0 0 1 10 0v4' },
]

export default function StaffLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getStaffUser()
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN'

  async function signOut() {
    await logout()
    void navigate('/staff/login', { replace: true })
  }

  // Filtered through the same table the route guard uses, so the sidebar can
  // never offer a link that `RequireStaff` would bounce. A cashier was being
  // shown Kitchen Display, which is not theirs.
  const visible = (items: NavItem[]) => items.filter((item) => mayVisit(user?.role, item.to))

  const navSection1 = isPlatformAdmin ? visible(PLATFORM_NAV) : visible(RESTAURANT_NAV)
  const navSection2 = isPlatformAdmin ? [] : visible(OPS_NAV)
  const section1Title = isPlatformAdmin ? 'Platform' : 'Management'
  const section2Title = 'Operations'

  return (
    <div className="flex h-dvh bg-transparent overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 glass border-y-0 border-l-0 border-r border-border flex-col hidden md:flex rounded-none z-20 transition-colors duration-300">
        <div className="p-6 border-b border-border">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center text-white shadow-lg">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
             </div>
             <h1 className="text-h3 font-black text-ink tracking-tight">OS <span className="font-medium text-ink-soft">Admin</span></h1>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto py-8 px-4">
           {navSection1.length > 0 ? (
             <div className="mb-10">
               <h2 className="px-3 text-caption font-bold text-ink-faint uppercase tracking-widest mb-4">{section1Title}</h2>
               <nav className="space-y-1.5">
                 {navSection1.map(item => {
                   const isActive = item.end
                     ? location.pathname === item.to
                     : location.pathname.startsWith(item.to)
                     
                   return (
                     <NavLink
                       key={item.to}
                       to={item.to}
                       className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold text-small ${
                         isActive
                           ? 'bg-accent-wash text-accent shadow-sm border border-accent/20'
                           : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
                       }`}
                     >
                       <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={item.icon} />
                       </svg>
                       {item.label}
                     </NavLink>
                   )
                 })}
               </nav>
             </div>
           ) : null}

           {navSection2.length > 0 ? (
             <div>
               <h2 className="px-3 text-caption font-bold text-ink-faint uppercase tracking-widest mb-4">{section2Title}</h2>
               <nav className="space-y-1.5">
                 {navSection2.map(item => {
                   const isActive = location.pathname === item.to
                   return (
                     <NavLink
                       key={item.to}
                       to={item.to}
                       className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold text-small ${
                         isActive
                           ? 'bg-accent-wash text-accent shadow-sm border border-accent/20'
                           : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
                       }`}
                     >
                       <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={item.icon} />
                       </svg>
                       {item.label}
                     </NavLink>
                   )
                 })}
               </nav>
             </div>
           ) : null}
        </div>

        {/* Theme & Profile Footer */}
        <div className="p-4 border-t border-border flex flex-col gap-2 relative">
          
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surface-hover transition-colors text-left outline-none text-ink-soft hover:text-ink"
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-surface-strong border border-border flex items-center justify-center text-ink shadow-sm">
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </div>
            <span className="text-small font-bold truncate">Toggle Theme</span>
          </button>

          <button 
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surface-hover transition-colors text-left outline-none"
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-surface-strong border border-border flex items-center justify-center font-bold text-body text-ink shadow-sm">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-small font-bold text-ink truncate">{user?.name}</p>
              <p className="text-caption text-ink-faint truncate font-medium">{user?.role}</p>
            </div>
            <svg className="w-4 h-4 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>

          {/* Popover */}
          {profileOpen && (
            <div className="absolute bottom-[4.5rem] left-4 right-4 mb-2 card-glass p-2 animate-fade-in shadow-lg">
              <button onClick={() => { navigate('/staff/password'); setProfileOpen(false) }} className="w-full text-left px-4 py-2.5 rounded-lg text-small font-medium text-ink hover:bg-surface-hover transition-colors">
                 Change Password
              </button>
              <div className="h-px bg-border my-1"></div>
              <button onClick={signOut} className="w-full text-left px-4 py-2.5 rounded-lg text-small font-medium text-status-danger hover:bg-status-danger-wash transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setMobileMenuOpen(false)} />
          <aside className="w-[280px] glass border-r border-border flex flex-col h-full bg-ground relative shadow-2xl animate-slide-right">
             <div className="p-4 border-b border-border flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center text-white shadow-lg">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                 </div>
                 <h1 className="text-h3 font-black text-ink tracking-tight">OS <span className="font-medium text-ink-soft">Admin</span></h1>
               </div>
               <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:bg-surface-hover" aria-label="Close menu">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto py-8 px-4">
                {navSection1.length > 0 ? (
                  <div className="mb-10">
                    <h2 className="px-3 text-caption font-bold text-ink-faint uppercase tracking-widest mb-4">{section1Title}</h2>
                    <nav className="space-y-1.5">
                      {navSection1.map(item => {
                        const isActive = item.end
                          ? location.pathname === item.to
                          : location.pathname.startsWith(item.to)
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold text-small ${
                              isActive
                                ? 'bg-accent-wash text-accent shadow-sm border border-accent/20'
                                : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
                            }`}
                          >
                            <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                               <path d={item.icon} />
                            </svg>
                            {item.label}
                          </NavLink>
                        )
                      })}
                    </nav>
                  </div>
                ) : null}

                {navSection2.length > 0 ? (
                  <div>
                    <h2 className="px-3 text-caption font-bold text-ink-faint uppercase tracking-widest mb-4">{section2Title}</h2>
                    <nav className="space-y-1.5">
                      {navSection2.map(item => {
                        const isActive = location.pathname === item.to
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold text-small ${
                              isActive
                                ? 'bg-accent-wash text-accent shadow-sm border border-accent/20'
                                : 'text-ink-soft hover:bg-surface-hover hover:text-ink'
                            }`}
                          >
                            <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                               <path d={item.icon} />
                            </svg>
                            {item.label}
                          </NavLink>
                        )
                      })}
                    </nav>
                  </div>
                ) : null}
             </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-dvh overflow-hidden bg-transparent">
        {/* Mobile Header */}
        <header className="md:hidden border-b border-border glass rounded-none flex items-center justify-between px-4 py-3 z-20 transition-colors duration-300">
           <div className="flex items-center gap-3">
             <button onClick={() => setMobileMenuOpen(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink hover:bg-surface-hover -ml-2" aria-label="Open navigation menu">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
             </button>
             <div className="w-6 h-6 rounded bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center text-white shrink-0">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
             </div>
             <h1 className="text-body font-bold text-ink truncate">OS Admin</h1>
           </div>
           <div className="flex items-center gap-2">
             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-ink-soft">
                {theme === 'dark' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
             </button>
             <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
           </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
