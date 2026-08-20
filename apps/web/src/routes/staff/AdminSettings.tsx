import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { getSettings, updateSettings } from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { AdminSection, Field, inputClass } from './AdminShell.js'
import { rawBlob } from '../../lib/staffApi.js'
import { useToast } from '../../components/ToastContext.js'

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { showToast } = useToast()

  const [vatRatePercent, setVatRatePercent] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [serviceChargePercent, setServiceChargePercent] = useState('')
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false)
  const [kitchenStartsBeforePayment, setKitchenStartsBeforePayment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setVatRatePercent(String(settingsQuery.data.settings.vatRatePercent ?? 15))
      setVatNumber(settingsQuery.data.settings.vatNumber ?? '')
      setServiceChargePercent(String(settingsQuery.data.settings.serviceChargePercent ?? 0))
      setPricesIncludeVat(Boolean(settingsQuery.data.settings.pricesIncludeVat))
      setKitchenStartsBeforePayment(Boolean(settingsQuery.data.settings.kitchenStartsBeforePayment))
      setIsDirty(false)
    }
  }, [settingsQuery.data])

  useEffect(() => {
    if (!settingsQuery.data?.settings) return
    const s = settingsQuery.data.settings
    const dirty =
      vatRatePercent !== String(s.vatRatePercent ?? 15) ||
      vatNumber !== (s.vatNumber ?? '') ||
      serviceChargePercent !== String(s.serviceChargePercent ?? 0) ||
      pricesIncludeVat !== Boolean(s.pricesIncludeVat) ||
      kitchenStartsBeforePayment !== Boolean(s.kitchenStartsBeforePayment)
    setIsDirty(dirty)
  }, [vatRatePercent, vatNumber, serviceChargePercent, pricesIncludeVat, kitchenStartsBeforePayment, settingsQuery.data])

  const saveSettings = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        pricesIncludeVat,
        kitchenStartsBeforePayment
      }
      if (vatRatePercent) payload.vatRatePercent = Number(vatRatePercent)
      if (serviceChargePercent) payload.serviceChargePercent = Number(serviceChargePercent)
      if (vatNumber !== undefined) payload.vatNumber = vatNumber
      return updateSettings(payload)
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast('Settings saved successfully')
    },
    onError: (e: Error) => setError(e.message)
  })

  if (settingsQuery.isLoading) return <div className="p-8">Loading settings...</div>

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-8">
      <div>
        <h1 className="text-h1 font-bold text-ink">Restaurant Settings</h1>
        <p className="text-body text-ink-soft mt-1">Configure tax rates, fees, and operational behavior.</p>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20">
          {error}
        </div>
      ) : null}

      <AdminSection title="Financial & Tax Settings">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="VAT Rate (%)">
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={vatRatePercent}
                onChange={e => setVatRatePercent(e.target.value)}
              />
            </Field>
            
            <Field label="Service Charge (%)">
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={serviceChargePercent}
                onChange={e => setServiceChargePercent(e.target.value)}
              />
            </Field>

            <Field label="VAT Registration Number">
              <input
                type="text"
                className={inputClass}
                value={vatNumber}
                onChange={e => setVatNumber(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <input 
              type="checkbox" 
              id="pricesIncludeVat" 
              checked={pricesIncludeVat}
              onChange={e => setPricesIncludeVat(e.target.checked)}
              className="w-5 h-5 text-accent rounded border-border focus:ring-accent"
            />
            <label htmlFor="pricesIncludeVat" className="text-body font-medium text-ink cursor-pointer">
              Menu prices already include VAT
            </label>
          </div>
          <p className="text-caption text-ink-soft -mt-4 ml-8">If checked, VAT is extracted from the price. If unchecked, VAT is added on top of the price.</p>
        </Card>
      </AdminSection>

      <AdminSection title="Operational Behavior">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              id="kitchenStarts" 
              checked={kitchenStartsBeforePayment}
              onChange={e => setKitchenStartsBeforePayment(e.target.checked)}
              className="w-5 h-5 text-accent rounded border-border focus:ring-accent"
            />
            <label htmlFor="kitchenStarts" className="text-body font-medium text-ink cursor-pointer">
              Kitchen starts preparing before cash payment is confirmed
            </label>
          </div>
          <p className="text-caption text-ink-soft -mt-4 ml-8">If disabled, Cash/Card orders stay pending until a cashier confirms them. If enabled, they go straight to the kitchen.</p>
        </Card>
      </AdminSection>

      <AdminSection title="Data Management">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-body font-bold text-ink">Export Database Backup</h3>
              <p className="text-sm text-ink-soft mt-1">Download a `.zip` archive containing your restaurant's menus, orders, and staff data in JSON format.</p>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const blob = await rawBlob('/app/dashboard/backup')
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `backup-${new Date().toISOString().slice(0, 10)}.zip`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  showToast('Backup downloaded successfully', 'success')
                } catch {
                  showToast('Failed to download backup', 'error')
                }
              }}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Backup
            </Button>
          </div>
        </Card>
      </AdminSection>

      {/* Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-md border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-50 animate-slide-up flex justify-center md:pl-64">
          <div className="max-w-5xl w-full flex justify-between items-center px-4">
            <span className="text-body font-medium text-ink">You have unsaved changes</span>
            <Button 
              type="button" 
              onClick={() => saveSettings.mutate()} 
              isLoading={saveSettings.isPending}
              disabled={saveSettings.isPending}
            >
              Save Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
