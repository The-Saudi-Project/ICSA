import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchTables, fetchMenuItems, fetchCategories, staffCreateOrder } from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import { money } from '../../lib/format.js'
import { PaymentMethod } from '@rw/shared'

export default function WaiterPOS() {
  const navigate = useNavigate()
  
  const { data: tablesData } = useQuery({ queryKey: ['tables'], queryFn: fetchTables })
  const { data: menuData } = useQuery({ queryKey: ['menuItems'], queryFn: fetchMenuItems })
  const { data: categoriesData } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const tables = tablesData?.tables ?? []
  const items = menuData?.items ?? []
  const categories = categoriesData?.categories ?? []

  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [cart, setCart] = useState<Record<string, number>>({})

  const activeCategories = useMemo(() => categories.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [categories])
  const activeItems = useMemo(() => items.filter(i => i.isActive && i.isAvailable), [items])

  const subtotal = useMemo(() => {
    let sum = 0
    for (const [id, qty] of Object.entries(cart)) {
      const item = activeItems.find(i => i.id === id)
      if (item) sum += item.priceHalalas * qty
    }
    return sum
  }, [cart, activeItems])

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!selectedTableId) throw new Error('Please select a table')
      if (Object.keys(cart).length === 0) throw new Error('Cart is empty')
      
      const orderItems = Object.entries(cart).map(([id, quantity]) => {
        return { menuItemId: id, quantity, modifiers: [] }
      })

      const idempotencyKey = crypto.randomUUID()
      await staffCreateOrder({
        tableId: selectedTableId,
        paymentMethod: PaymentMethod.CASH,
        items: orderItems,
      }, idempotencyKey)
    },
    onSuccess: () => {
      navigate('/waiter')
    }
  })

  return (
    <div className="min-h-dvh bg-ground flex flex-col md:flex-row h-dvh overflow-hidden">
      {/* Left side: Menu */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 relative">
        <div className="flex justify-between items-center mb-8">
           <h1 className="text-4xl font-black text-ink tracking-tight">New Order</h1>
           <Link to="/waiter" className="text-accent font-bold hover:underline">Back to Dashboard</Link>
        </div>

        {activeCategories.map(cat => {
          const catItems = activeItems.filter(i => i.categoryId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder)
          if (catItems.length === 0) return null

          return (
            <div key={cat.id} className="mb-10">
              <h2 className="text-2xl font-bold text-ink mb-4">{cat.name.en}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {catItems.map(item => (
                  <Card 
                    key={item.id} 
                    variant="glass" 
                    className="p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all flex flex-col"
                    onClick={() => setCart(c => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))}
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-ink line-clamp-2">{item.name.en}</h3>
                      <span className="font-black text-ink">{money(item.priceHalalas)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Right side: Cart & Checkout */}
      <div className="w-full md:w-[400px] border-l border-border bg-surface-strong p-6 flex flex-col h-full z-10 shadow-2xl">
         <h2 className="text-2xl font-black text-ink mb-6 tracking-tight">Order Details</h2>

         <div className="mb-6">
           <label className="block text-sm font-bold text-ink-faint uppercase tracking-widest mb-2">Select Table</label>
           <select 
             className="w-full bg-ground border-2 border-border rounded-xl p-3 text-ink font-bold focus:border-accent focus:ring-0"
             value={selectedTableId}
             onChange={e => setSelectedTableId(e.target.value)}
           >
             <option value="">-- Choose a Table --</option>
             {tables.map(t => (
               <option key={t.id} value={t.id}>Table {t.label}</option>
             ))}
           </select>
         </div>

         <div className="flex-1 overflow-y-auto mb-6">
           <label className="block text-sm font-bold text-ink-faint uppercase tracking-widest mb-4">Items</label>
           {Object.keys(cart).length === 0 ? (
             <p className="text-ink-soft italic">No items added.</p>
           ) : (
             <ul className="space-y-4">
               {Object.entries(cart).map(([id, qty]) => {
                 const item = activeItems.find(i => i.id === id)
                 if (!item) return null
                 return (
                   <li key={id} className="flex justify-between items-center gap-2">
                     <div className="flex items-center gap-3 flex-1 min-w-0">
                       <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center font-bold text-ink shrink-0">{qty}</div>
                       <span className="font-medium text-ink truncate">{item.name.en}</span>
                     </div>
                     <button 
                       onClick={() => setCart(c => { const n = {...c}; if ((n[id] || 0) > 1) n[id] = (n[id] || 0) - 1; else delete n[id]; return n; })}
                       className="w-8 h-8 rounded-full border border-border text-status-danger flex items-center justify-center hover:bg-status-danger-wash transition-colors"
                     >
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                     </button>
                   </li>
                 )
               })}
             </ul>
           )}
         </div>

         <div className="pt-6 border-t border-border">
            <div className="flex justify-between items-center mb-6">
              <span className="text-lg font-medium text-ink-soft">Subtotal</span>
              <span className="text-2xl font-black text-ink">{money(subtotal)}</span>
            </div>
            
            {placeOrder.isError && (
              <p className="text-status-danger font-bold mb-4">{placeOrder.error?.message}</p>
            )}

            <button
              onClick={() => placeOrder.mutate()}
              disabled={placeOrder.isPending || !selectedTableId || Object.keys(cart).length === 0}
              className="w-full bg-accent hover:bg-accent-bright text-white disabled:opacity-50 py-4 rounded-2xl font-black text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
            >
              {placeOrder.isPending ? 'Sending...' : 'Send to Kitchen'}
            </button>
         </div>
      </div>
    </div>
  )
}
