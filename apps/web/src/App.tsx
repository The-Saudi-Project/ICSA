import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'

import { useStaffUser } from './lib/staffApi.js'
import { homeForRole, mayVisit } from './lib/roles.js'
import NoTable from './routes/NoTable.js'

const TableEntry = lazy(() => import('./routes/TableEntry.js'))
const Menu = lazy(() => import('./routes/Menu.js'))
const ItemDetail = lazy(() => import('./routes/ItemDetail.js'))
const Cart = lazy(() => import('./routes/Cart.js'))
const OrderStatus = lazy(() => import('./routes/OrderStatus.js'))

const Login = lazy(() => import('./routes/staff/Login.js'))
const ChangePassword = lazy(() => import('./routes/staff/ChangePassword.js'))
const Dashboard = lazy(() => import('./routes/staff/Dashboard.js'))
const Kitchen = lazy(() => import('./routes/staff/Kitchen.js'))
const Cashier = lazy(() => import('./routes/staff/Cashier.js'))
const AdminMenu = lazy(() => import('./routes/staff/AdminMenu.js'))
const AdminTables = lazy(() => import('./routes/staff/AdminTables.js'))
const AdminStaff = lazy(() => import('./routes/staff/AdminStaff.js'))
const Platform = lazy(() => import('./routes/staff/Platform.js'))
const PlatformTenantDetail = lazy(() => import('./routes/staff/PlatformTenantDetail.js'))
const StaffLayout = lazy(() => import('./routes/staff/StaffLayout.js'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

import { ThemeProvider } from './lib/theme.js'

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<NoTable />} />
            <Route path="/t/:token" element={<Suspense fallback={<Fallback />}><TableEntry /></Suspense>} />
            <Route path="/menu" element={<Suspense fallback={<Fallback />}><Menu /></Suspense>} />
            <Route path="/item/:id" element={<Suspense fallback={<Fallback />}><ItemDetail /></Suspense>} />
            <Route path="/cart" element={<Suspense fallback={<Fallback />}><Cart /></Suspense>} />
            <Route path="/order/:publicId" element={<Suspense fallback={<Fallback />}><OrderStatus /></Suspense>} />

            <Route path="/staff/login" element={<Suspense fallback={<Fallback />}><Login /></Suspense>} />
            <Route path="/staff/password" element={<RequireStaff><Suspense fallback={<Fallback />}><ChangePassword /></Suspense></RequireStaff>} />
          
            <Route element={<RequireStaff><Suspense fallback={<Fallback />}><StaffLayout /></Suspense></RequireStaff>}>
              <Route path="/dashboard" element={<Suspense fallback={<Fallback />}><Dashboard /></Suspense>} />
              <Route path="/kitchen" element={<Suspense fallback={<Fallback />}><Kitchen /></Suspense>} />
              <Route path="/cashier" element={<Suspense fallback={<Fallback />}><Cashier /></Suspense>} />

              <Route path="/admin">
                <Route index element={<Navigate to="menu" replace />} />
                <Route path="menu" element={<Suspense fallback={<Fallback />}><AdminMenu /></Suspense>} />
                <Route path="tables" element={<Suspense fallback={<Fallback />}><AdminTables /></Suspense>} />
                <Route path="staff" element={<Suspense fallback={<Fallback />}><AdminStaff /></Suspense>} />
              </Route>
              <Route path="/platform">
                <Route index element={<Suspense fallback={<Fallback />}><Platform /></Suspense>} />
                <Route path="tenants" element={<Suspense fallback={<Fallback />}><Platform /></Suspense>} />
                <Route path="tenants/:id" element={<Suspense fallback={<Fallback />}><PlatformTenantDetail /></Suspense>} />
                <Route path="security" element={<Suspense fallback={<Fallback />}><Platform /></Suspense>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

function Fallback() {
  return <div className="min-h-dvh bg-ground" />
}

/**
 * Auth plus the surface boundary.
 *
 * This used to check only platform-versus-restaurant, on the reasoning that the
 * server enforces the rest. The server does — every admin route is
 * `requireRestaurantAdmin`, and a cashier's requests all return 403. But that
 * left a cashier able to type `/admin/menu` and be shown the whole admin
 * interface, empty and erroring: it looks broken, and it reveals the shape of
 * screens that are not theirs.
 *
 * `mayVisit` in `lib/roles.ts` is now the single table both this guard and the
 * sidebar consult, so a link can never appear for a surface this would refuse.
 *
 * The user is *subscribed to*, not merely read once. When a refresh token
 * finally expires mid-shift, `staffApi` clears the signed-in user; without a
 * subscription nothing re-rendered, so the cashier kept looking at a till screen
 * that answered 401 to everything and never offered a way back to sign in.
 */
function RequireStaff({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const user = useStaffUser()

  if (!user) return <Navigate to="/staff/login" replace />

  if (user.mustChangePassword && pathname !== '/staff/password') {
    return <Navigate to="/staff/password" replace />
  }

  if (!mayVisit(user.role, pathname)) {
    const home = homeForRole(user.role)
    // Loop guard. Bouncing someone to a home they also cannot enter — or to the
    // page they are already on — would redirect forever. Step 7b hit exactly
    // that; the terminal state is deliberate.
    if (pathname === home || !mayVisit(user.role, home)) return <NoSurface role={user.role} />
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}

/** Shown instead of looping when an account has no screen it may open. */
function NoSurface({ role }: { role: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ground px-6 text-center">
      <div>
        <h1 className="text-h2 text-ink">No screen for this account</h1>
        <p className="mt-2 max-w-sm text-body text-ink-soft">
          The {role.toLowerCase()} role has no surface assigned. Ask an owner or manager to check
          your account.
        </p>
      </div>
    </div>
  )
}
