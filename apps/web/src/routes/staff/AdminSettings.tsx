/**
 * `/admin/settings` — the restaurant's own record.
 *
 * Three of these fields decide what a customer is charged, and one decides
 * whether food is cooked before the money is in the till. The screen is built
 * around saying so plainly rather than presenting nine inputs of equal weight:
 * a mistyped service charge is a real cost to a real diner, and an owner
 * flipping the payment policy deserves to understand what they just turned on.
 *
 * The VAT fields are rendered read-only on purpose. They are shown — an owner
 * has to be able to reconcile their own totals — but the rate is set by ZATCA,
 * not by a restaurant, so it is ours to set and theirs to see. The server
 * enforces that independently; this screen only explains it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { MAX_SERVICE_CHARGE_PERCENT, MAX_TABLE_SESSION_TTL_MINUTES } from '@rw/shared/enums'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import {
  fetchOwnRestaurant,
  updateOwnRestaurant,
  type OwnRestaurant,
  type RestaurantSettingsInput,
} from '../../lib/staffApi.js'
import { AdminSection, Field, inputClass } from './AdminShell.js'
import { ImageUploadField } from './ImageUploadField.js'

/** The editable shape, as strings, because that is what inputs give back. */
interface Draft {
  nameEn: string
  nameAr: string
  addressLine: string
  city: string
  phone: string
  logoUrl: string
  vatNumber: string
  crNumber: string
  serviceChargePercent: string
  kitchenStartsBeforePayment: boolean
  tableSessionTtlMinutes: string
}

function toDraft(r: OwnRestaurant): Draft {
  return {
    nameEn: r.name.en ?? '',
    nameAr: r.name.ar ?? '',
    addressLine: r.addressLine ?? '',
    city: r.city ?? '',
    phone: r.phone ?? '',
    logoUrl: r.logoUrl ?? '',
    vatNumber: r.vatNumber ?? '',
    crNumber: r.crNumber ?? '',
    serviceChargePercent: String(r.settings.serviceChargePercent),
    kitchenStartsBeforePayment: r.settings.kitchenStartsBeforePayment,
    tableSessionTtlMinutes: String(r.settings.tableSessionTtlMinutes),
  }
}

/**
 * Only what actually changed.
 *
 * The server rejects an empty patch, and sending every field on every save would
 * write an audit event claiming eleven things changed when one did — which makes
 * the log useless for the question it exists to answer.
 */
function diff(draft: Draft, original: OwnRestaurant): RestaurantSettingsInput {
  const base = toDraft(original)
  const body: RestaurantSettingsInput = {}

  if (draft.nameEn !== base.nameEn || draft.nameAr !== base.nameAr) {
    body.name = {
      en: draft.nameEn.trim(),
      ...(draft.nameAr.trim() ? { ar: draft.nameAr.trim() } : {}),
    }
  }
  if (draft.addressLine !== base.addressLine) body.addressLine = draft.addressLine.trim()
  if (draft.city !== base.city) body.city = draft.city.trim()
  if (draft.phone !== base.phone) body.phone = draft.phone.trim()
  if (draft.logoUrl !== base.logoUrl) body.logoUrl = draft.logoUrl.trim()
  if (draft.vatNumber !== base.vatNumber) body.vatNumber = draft.vatNumber.trim()
  if (draft.crNumber !== base.crNumber) body.crNumber = draft.crNumber.trim()

  if (draft.serviceChargePercent !== base.serviceChargePercent) {
    body.serviceChargePercent = Number(draft.serviceChargePercent)
  }
  if (draft.kitchenStartsBeforePayment !== base.kitchenStartsBeforePayment) {
    body.kitchenStartsBeforePayment = draft.kitchenStartsBeforePayment
  }
  if (draft.tableSessionTtlMinutes !== base.tableSessionTtlMinutes) {
    body.tableSessionTtlMinutes = Number(draft.tableSessionTtlMinutes)
  }

  return body
}

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'restaurant'],
    queryFn: fetchOwnRestaurant,
  })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState(false)
  const serviceChargeId = useId()
  const sessionTtlId = useId()

  // Seeded once the record arrives, and re-seeded if it is refetched, so the
  // form never shows a stale value after somebody else edits the restaurant.
  useEffect(() => {
    if (data) setDraft(toDraft(data.restaurant))
  }, [data])

  const save = useMutation({
    mutationFn: () => updateOwnRestaurant(diff(draft!, data!.restaurant)),
    onSuccess: (result) => {
      queryClient.setQueryData(['admin', 'restaurant'], result)
      setDraft(toDraft(result.restaurant))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 4000)
    },
  })

  if (isPending || !draft || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 md:px-8 py-8">
        <p className="text-body text-ink-soft">Loading settings…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 md:px-8 py-8">
        <Card variant="glass" className="p-6 border-status-danger/40 bg-status-danger-wash">
          <p role="alert" className="text-body font-medium text-status-danger">
            Could not load your restaurant’s settings. Check the connection and try again.
          </p>
        </Card>
      </div>
    )
  }

  const restaurant = data.restaurant
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const pending = Object.keys(diff(draft, restaurant)).length
  const serviceChargeValue = Number(draft.serviceChargePercent)
  const serviceChargeInvalid =
    draft.serviceChargePercent !== '' &&
    (!Number.isInteger(serviceChargeValue) ||
      serviceChargeValue < 0 ||
      serviceChargeValue > MAX_SERVICE_CHARGE_PERCENT)

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 animate-fade-in space-y-4 pb-32">
      <AdminSection title="Your restaurant">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name (English)">
              <input
                className={inputClass}
                value={draft.nameEn}
                onChange={(e) => set('nameEn', e.target.value)}
              />
            </Field>
            <Field label="Name (Arabic)">
              <input
                className={inputClass}
                dir="rtl"
                lang="ar"
                value={draft.nameAr}
                onChange={(e) => set('nameAr', e.target.value)}
              />
            </Field>
          </div>

          <ImageUploadField
            kind="restaurant-logo"
            label="Logo"
            value={draft.logoUrl}
            onChange={(url) => set('logoUrl', url)}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Address">
              <input
                className={inputClass}
                value={draft.addressLine}
                onChange={(e) => set('addressLine', e.target.value)}
                placeholder="e.g. King Fahd Road"
              />
            </Field>
            <Field label="City">
              <input
                className={inputClass}
                value={draft.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="e.g. Riyadh"
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={draft.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+9665XXXXXXXX"
              />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="VAT number">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.vatNumber}
                onChange={(e) => set('vatNumber', e.target.value)}
                placeholder="15 digits"
              />
            </Field>
            <Field label="Commercial registration">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.crNumber}
                onChange={(e) => set('crNumber', e.target.value)}
                placeholder="10 digits"
              />
            </Field>
          </div>
          <p className="text-caption text-ink-faint">
            These appear on customer receipts from Phase 2 onward. Leave them blank until you have
            them to hand — an incorrect number is worse than none.
          </p>
        </Card>
      </AdminSection>

      <AdminSection title="Charges">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          {/*
            Read-only, and it says why. An owner who cannot see the VAT rate
            cannot check their own totals; an owner who can edit it can quietly
            under-collect tax on every order.
          */}
          <div className="rounded-xl bg-surface-strong border border-border/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-small font-bold uppercase tracking-wider text-ink-soft">
                  VAT
                </p>
                <p className="mt-2 text-h2 font-bold text-ink tnum">
                  {restaurant.settings.vatRatePercent}%
                </p>
                <p className="mt-1 text-small text-ink-soft">
                  Menu prices {restaurant.settings.pricesIncludeVat ? 'include' : 'exclude'} VAT
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-caption font-bold text-ink-soft ring-1 ring-border">
                Set by the platform
              </span>
            </div>
            <p className="mt-4 text-caption text-ink-faint leading-relaxed">
              The standard rate is set by ZATCA, so it is not editable here — a wrong rate would
              under-collect tax on every order and put your invoices out. If your business is
              zero-rated, or a specific dish is, contact us and we will set it. Individual dishes
              can already carry their own rate in the menu editor.
            </p>
          </div>

          <div>
            <label
              htmlFor={serviceChargeId}
              className="block text-small font-bold uppercase tracking-wider text-ink-soft mb-2"
            >
              Service charge
            </label>
            <div className="flex items-center gap-3">
              <input
                id={serviceChargeId}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_SERVICE_CHARGE_PERCENT}
                step={1}
                aria-invalid={serviceChargeInvalid || undefined}
                aria-describedby={`${serviceChargeId}-help`}
                className={`${inputClass} w-28`}
                value={draft.serviceChargePercent}
                onChange={(e) => set('serviceChargePercent', e.target.value)}
              />
              <span className="text-body font-semibold text-ink-soft">%</span>
            </div>
            <p id={`${serviceChargeId}-help`} className="mt-2 text-caption text-ink-faint">
              Added to the whole bill and shown to the customer before they order. Maximum{' '}
              {MAX_SERVICE_CHARGE_PERCENT}%. Set 0 for none.
            </p>
            {serviceChargeInvalid ? (
              <p role="alert" className="mt-2 text-small font-medium text-status-danger">
                Enter a whole number between 0 and {MAX_SERVICE_CHARGE_PERCENT}.
              </p>
            ) : null}
          </div>
        </Card>
      </AdminSection>

      <AdminSection title="Service">
        <Card variant="glass" className="p-6 border-border/40 space-y-6">
          {/*
            A toggle whose consequence is "you may cook food nobody has paid
            for" should read as a decision, not a preference. Both states are
            described, so the owner is choosing between two named outcomes
            rather than flipping a switch labelled with a setting name.
          */}
          <fieldset>
            <legend className="text-small font-bold uppercase tracking-wider text-ink-soft mb-3">
              When does the kitchen start?
            </legend>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover transition-colors">
                <input
                  type="radio"
                  name="kitchen-start"
                  className="mt-1 shrink-0"
                  checked={!draft.kitchenStartsBeforePayment}
                  onChange={() => set('kitchenStartsBeforePayment', false)}
                />
                <span>
                  <span className="block text-body font-semibold text-ink">
                    After a cashier confirms the cash
                  </span>
                  <span className="mt-1 block text-small text-ink-soft">
                    Recommended. Nothing is cooked until the money is in the till.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning-wash/40 p-4 hover:bg-status-warning-wash transition-colors">
                <input
                  type="radio"
                  name="kitchen-start"
                  className="mt-1 shrink-0"
                  checked={draft.kitchenStartsBeforePayment}
                  onChange={() => set('kitchenStartsBeforePayment', true)}
                />
                <span>
                  <span className="block text-body font-semibold text-ink">
                    Straight away, before payment
                  </span>
                  <span className="mt-1 block text-small text-ink-soft">
                    Faster service, and you accept the risk: an order that is never paid for is
                    food you have already made.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div>
            <label
              htmlFor={sessionTtlId}
              className="block text-small font-bold uppercase tracking-wider text-ink-soft mb-2"
            >
              How long a table stays open
            </label>
            <div className="flex items-center gap-3">
              <input
                id={sessionTtlId}
                type="number"
                inputMode="numeric"
                min={5}
                max={MAX_TABLE_SESSION_TTL_MINUTES}
                step={5}
                aria-describedby={`${sessionTtlId}-help`}
                className={`${inputClass} w-28`}
                value={draft.tableSessionTtlMinutes}
                onChange={(e) => set('tableSessionTtlMinutes', e.target.value)}
              />
              <span className="text-body font-semibold text-ink-soft">minutes</span>
            </div>
            <p id={`${sessionTtlId}-help`} className="mt-2 text-caption text-ink-faint leading-relaxed">
              After this, a customer taps the tag again to carry on ordering. This is also how long
              a <em>photographed</em> QR code keeps working, so longer is not safer. Maximum{' '}
              {MAX_TABLE_SESSION_TTL_MINUTES} minutes.
            </p>
          </div>
        </Card>
      </AdminSection>

      {/* Save bar */}
      <div className="sticky bottom-0 z-20 -mx-4 md:-mx-8 border-t border-border bg-ground/95 px-4 md:px-8 py-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p aria-live="polite" className="text-small text-ink-soft">
            {save.isError ? (
              <span role="alert" className="font-medium text-status-danger">
                {save.error.message}
              </span>
            ) : saved ? (
              <span className="font-medium text-status-success">Settings saved.</span>
            ) : pending > 0 ? (
              `${pending} unsaved change${pending === 1 ? '' : 's'}`
            ) : (
              'No changes'
            )}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(toDraft(restaurant))
                save.reset()
              }}
              disabled={pending === 0 || save.isPending}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              isLoading={save.isPending}
              disabled={pending === 0 || serviceChargeInvalid}
            >
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
