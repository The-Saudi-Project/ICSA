import { Link } from 'react-router'
import { Button } from '../components/ui/Button.js'
import { useState } from 'react'
import { PhoneVerificationModal } from '../components/PhoneVerificationModal.js'

export default function Landing() {
  const [showCustomerLogin, setShowCustomerLogin] = useState(false)

  return (
    <div className="min-h-dvh bg-ground flex flex-col font-sans">
      <header className="fixed top-0 inset-x-0 bg-ground/80 backdrop-blur-xl border-b border-border z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center text-white shadow-lg">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <span className="text-2xl font-black tracking-tight text-ink">NFC POS</span>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => setShowCustomerLogin(true)}
              className="font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              Customer Login
            </button>
            <Link to="/staff/login">
              <Button variant="primary">Staff Login</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center mt-12 mb-20 animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-ink leading-tight">
            The Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-bright">Dining Operations</span>
          </h1>
          <p className="mt-6 text-xl md:text-2xl text-ink-soft max-w-2xl mx-auto leading-relaxed">
            Revolutionize your restaurant with our NFC-powered POS system. Lightning fast ordering, real-time kitchen displays, and seamless payments.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/staff/login">
              <Button variant="primary" className="w-full sm:w-auto text-lg px-8 py-4">Get Started Today</Button>
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 mt-12 stagger">
          <div className="bg-surface p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="w-14 h-14 bg-accent-wash text-accent rounded-2xl flex items-center justify-center mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
            </div>
            <h3 className="text-2xl font-bold text-ink mb-3">NFC Table Ordering</h3>
            <p className="text-ink-soft leading-relaxed">Customers tap their phones to instantly view the menu and place orders without waiting for a server.</p>
          </div>
          <div className="bg-surface p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="w-14 h-14 bg-accent-wash text-accent rounded-2xl flex items-center justify-center mb-6">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            </div>
            <h3 className="text-2xl font-bold text-ink mb-3">Real-time KDS</h3>
            <p className="text-ink-soft leading-relaxed">Instantly route orders to the kitchen display system, reducing wait times and minimizing mistakes.</p>
          </div>
          <div className="bg-surface p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="w-14 h-14 bg-accent-wash text-accent rounded-2xl flex items-center justify-center mb-6">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h3 className="text-2xl font-bold text-ink mb-3">Wait Staff Dashboard</h3>
            <p className="text-ink-soft leading-relaxed">Staff get real-time alerts when orders are ready or when a table needs assistance.</p>
          </div>
        </div>
      </main>

      <PhoneVerificationModal 
        isOpen={showCustomerLogin} 
        onClose={() => setShowCustomerLogin(false)}
        onVerified={() => {
          setShowCustomerLogin(false)
          window.location.href = '/my-orders'
        }}
      />
    </div>
  )
}
