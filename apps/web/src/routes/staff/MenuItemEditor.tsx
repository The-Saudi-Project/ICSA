/**
 * The full menu-item editor — create and edit share it.
 *
 * The `/admin/menu` form used to capture four fields (category, English name,
 * price, English description), which meant an owner could not author a modifier
 * group, an allergen or an Arabic name at all. Everything below was already
 * accepted by `createMenuItemSchema` and stored by the model; only the interface
 * was missing.
 *
 * Two rules govern this file:
 *
 *  1. **Money never becomes a float.** What a person types in SAR goes through
 *     `sarToHalalas`, which throws rather than guessing — so every call is
 *     guarded, and a blank field is omitted rather than sent as zero.
 *  2. **An empty optional is omitted, not sent empty.** `description` requires
 *     an English string when present, so an Arabic-only description cannot be
 *     sent at all; the form drops it rather than failing validation at the server.
 */

import { formatHalalas, sarToHalalas } from '@rw/shared'
import { useState } from 'react'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import type {
  AdminCategory,
  AdminMenuItem,
  AdminModifierGroup,
  AdminModifierOption,
  MenuItemInput,
} from '../../lib/staffApi.js'
import { Field, inputClass } from './AdminShell.js'
import { ImageUploadField } from './ImageUploadField.js'

/* ── keys ─────────────────────────────────────────────────────────────────── */

/**
 * Turns a display name into a key the server will accept
 * (`^[a-z0-9][a-z0-9_-]*$`).
 *
 * Generated once, when a group or option is added, and never regenerated on
 * rename: the key is what a customer's cart and an order's snapshot refer to,
 * so rewriting it would orphan choices already in flight. Arabic-only names
 * slugify to nothing, hence the positional fallback.
 */
function toKey(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return /^[a-z0-9]/.test(slug) ? slug : fallback
}

/* ── validation, mirroring the server ─────────────────────────────────────── */

/**
 * The same cross-field rules `modifierGroupSchema` enforces. Duplicated here on
 * purpose: the server is the authority, but a person building a five-option
 * group should be told what is wrong while they are looking at it, not by a 422
 * after they press Save.
 */
export function modifierGroupProblem(group: AdminModifierGroup): string | null {
  if (!group.name.en.trim()) return 'This choice needs an English name.'
  if (group.options.length === 0) return 'Add at least one option.'
  if (group.options.some((o) => !o.name.en.trim())) return 'Every option needs an English name.'

  const keys = group.options.map((o) => o.key)
  if (new Set(keys).size !== keys.length) return 'Two options share the same key. Rename one.'

  if (group.maxSelect < group.minSelect) return 'Max choices cannot be lower than min choices.'
  if (group.maxSelect > group.options.length) {
    return `Max choices cannot exceed the ${group.options.length} options you have added.`
  }
  if (group.required && group.minSelect < 1) {
    return 'A required choice must ask for at least one option.'
  }
  return null
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

const listToText = (values?: string[]) => (values ?? []).join(', ')

const textToList = (text: string) =>
  text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

/** Blank means "not set". Returns undefined so the field is omitted entirely. */
function optionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined
}

interface Draft {
  categoryId: string
  nameEn: string
  nameAr: string
  descriptionEn: string
  descriptionAr: string
  price: string
  prepTimeMinutes: string
  calories: string
  sortOrder: string
  vatRatePercent: string
  allergens: string
  ingredients: string
  imageUrl: string
  stockRemaining: string
  modifierGroups: AdminModifierGroup[]
}

function draftFrom(item: AdminMenuItem | null, defaultCategoryId: string): Draft {
  if (!item) {
    return {
      categoryId: defaultCategoryId,
      nameEn: '',
      nameAr: '',
      descriptionEn: '',
      descriptionAr: '',
      price: '',
      prepTimeMinutes: '',
      calories: '',
      sortOrder: '',
      vatRatePercent: '',
      allergens: '',
      ingredients: '',
      imageUrl: '',
      stockRemaining: '',
      modifierGroups: [],
    }
  }

  return {
    categoryId: item.categoryId,
    nameEn: item.name.en,
    nameAr: item.name.ar ?? '',
    descriptionEn: item.description?.en ?? '',
    descriptionAr: item.description?.ar ?? '',
    price: formatHalalas(item.priceHalalas),
    prepTimeMinutes: item.prepTimeMinutes?.toString() ?? '',
    calories: item.calories?.toString() ?? '',
    sortOrder: item.sortOrder.toString(),
    vatRatePercent: item.vatRatePercent?.toString() ?? '',
    allergens: listToText(item.allergens),
    ingredients: listToText(item.ingredients),
    imageUrl: item.imageUrl ?? '',
    stockRemaining: item.stockRemaining == null ? '' : String(item.stockRemaining),
    // Structured clone so editing a group cannot mutate the cached query data.
    modifierGroups: item.modifierGroups.map((g) => ({
      ...g,
      name: { ...g.name },
      options: g.options.map((o) => ({ ...o, name: { ...o.name } })),
    })),
  }
}

/* ── component ────────────────────────────────────────────────────────────── */

export function MenuItemEditor({
  item,
  categories,
  defaultCategoryId,
  onSave,
  onCancel,
  isSaving,
  serverError,
}: {
  /** Null to create. */
  item: AdminMenuItem | null
  categories: AdminCategory[]
  defaultCategoryId: string
  onSave: (input: MenuItemInput) => void
  onCancel: () => void
  isSaving: boolean
  serverError: string | null
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item, defaultCategoryId))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  /* ── modifier group editing ─────────────────────────────────────────────── */

  const patchGroup = (index: number, patch: Partial<AdminModifierGroup>) =>
    setDraft((d) => ({
      ...d,
      modifierGroups: d.modifierGroups.map((g, i) => (i === index ? { ...g, ...patch } : g)),
    }))

  const patchOption = (
    groupIndex: number,
    optionIndex: number,
    patch: Partial<AdminModifierOption>,
  ) =>
    setDraft((d) => ({
      ...d,
      modifierGroups: d.modifierGroups.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.map((o, j) => (j === optionIndex ? { ...o, ...patch } : o)) }
          : g,
      ),
    }))

  const addGroup = () =>
    setDraft((d) => ({
      ...d,
      modifierGroups: [
        ...d.modifierGroups,
        {
          key: `grp_${d.modifierGroups.length + 1}`,
          name: { en: '', ar: '' },
          minSelect: 0,
          maxSelect: 1,
          required: false,
          options: [],
        },
      ],
    }))

  const addOption = (groupIndex: number) =>
    setDraft((d) => ({
      ...d,
      modifierGroups: d.modifierGroups.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              options: [
                ...g.options,
                {
                  key: `opt_${g.options.length + 1}`,
                  name: { en: '', ar: '' },
                  priceDeltaHalalas: 0,
                  isAvailable: true,
                },
              ],
            }
          : g,
      ),
    }))

  const removeGroup = (index: number) =>
    setDraft((d) => ({ ...d, modifierGroups: d.modifierGroups.filter((_, i) => i !== index) }))

  const removeOption = (groupIndex: number, optionIndex: number) =>
    setDraft((d) => ({
      ...d,
      modifierGroups: d.modifierGroups.map((g, i) =>
        i === groupIndex ? { ...g, options: g.options.filter((_, j) => j !== optionIndex) } : g,
      ),
    }))

  /* ── submit ─────────────────────────────────────────────────────────────── */

  function submit() {
    if (!draft.categoryId) return setProblem('Choose a category.')
    if (!draft.nameEn.trim()) return setProblem('The English name is required.')

    let priceHalalas: number
    try {
      priceHalalas = sarToHalalas(draft.price)
    } catch {
      return setProblem('Enter a price, for example 28.00.')
    }

    for (const group of draft.modifierGroups) {
      const groupProblem = modifierGroupProblem(group)
      if (groupProblem) {
        return setProblem(`"${group.name.en.trim() || 'Untitled choice'}": ${groupProblem}`)
      }
    }

    const descriptionEn = draft.descriptionEn.trim()
    const nameAr = draft.nameAr.trim()
    const allergens = textToList(draft.allergens)
    const ingredients = textToList(draft.ingredients)

    const input: MenuItemInput = {
      categoryId: draft.categoryId,
      name: { en: draft.nameEn.trim(), ...(nameAr ? { ar: nameAr } : {}) },
      priceHalalas,
      modifierGroups: draft.modifierGroups,
    }

    // `description` requires an English string, so an Arabic-only description
    // cannot be represented. Dropping it here beats a 422 the person cannot act on.
    if (descriptionEn) {
      const descriptionAr = draft.descriptionAr.trim()
      input.description = {
        en: descriptionEn,
        ...(descriptionAr ? { ar: descriptionAr } : {}),
      }
    }

    const prepTimeMinutes = optionalInt(draft.prepTimeMinutes)
    const calories = optionalInt(draft.calories)
    const sortOrder = optionalInt(draft.sortOrder)
    const vatRatePercent = optionalInt(draft.vatRatePercent)

    if (prepTimeMinutes !== undefined) input.prepTimeMinutes = prepTimeMinutes
    if (calories !== undefined) input.calories = calories
    if (sortOrder !== undefined) input.sortOrder = sortOrder
    if (vatRatePercent !== undefined) input.vatRatePercent = vatRatePercent
    if (allergens.length) input.allergens = allergens
    if (ingredients.length) input.ingredients = ingredients

    // Sent when there is a photo, and also when one has just been removed —
    // an empty string is how the server is told to clear it. Omitted entirely
    // when the item never had one, so a create carries no empty field.
    if (draft.imageUrl || item?.imageUrl) input.imageUrl = draft.imageUrl

    // Blank is not "zero" and not "unchanged" — it is "stop counting this dish",
    // which the API expects as an explicit null. Zero means sold out, and the
    // two must never be confused.
    const stock = draft.stockRemaining.trim()
    input.stockRemaining = stock === '' ? null : (optionalInt(stock) ?? null)

    setProblem(null)
    onSave(input)
  }

  const message = problem ?? serverError

  return (
    <Card variant="glass" className="p-6 border-border/40 space-y-8">
      {/* ── the essentials ─────────────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Category">
          <select
            className={inputClass}
            value={draft.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">Choose one</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.en}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Price in SAR">
          <input
            className={inputClass}
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="28.00"
          />
        </Field>

        <Field label="Name (English)">
          <input
            className={inputClass}
            value={draft.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
            placeholder="Malabar Chicken Biriyani"
          />
        </Field>

        <Field label="Name (Arabic)">
          <input
            className={inputClass}
            dir="rtl"
            lang="ar"
            value={draft.nameAr}
            onChange={(e) => set('nameAr', e.target.value)}
            placeholder="برياني الدجاج المالباري"
          />
        </Field>

        <Field label="Description (English)">
          <input
            className={inputClass}
            value={draft.descriptionEn}
            onChange={(e) => set('descriptionEn', e.target.value)}
            placeholder="Fragrant rice layered with spiced chicken."
          />
        </Field>

        <Field label="Description (Arabic)">
          <input
            className={inputClass}
            dir="rtl"
            lang="ar"
            value={draft.descriptionAr}
            onChange={(e) => set('descriptionAr', e.target.value)}
            placeholder="أرز معطر مع الدجاج المتبل"
          />
        </Field>
      </div>

      <p className="text-caption text-ink-faint -mt-4">
        Arabic is stored now and shown to customers when the Arabic interface ships. Entering it
        with the item is far less work than revisiting every dish later.
      </p>

      <ImageUploadField value={draft.imageUrl} onChange={(url) => set('imageUrl', url)} />

      {/* ── kitchen and customer information ───────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Prep time (minutes)">
          <input
            className={inputClass}
            inputMode="numeric"
            value={draft.prepTimeMinutes}
            onChange={(e) => set('prepTimeMinutes', e.target.value)}
            placeholder="15"
          />
        </Field>
        <Field label="Calories">
          <input
            className={inputClass}
            inputMode="numeric"
            value={draft.calories}
            onChange={(e) => set('calories', e.target.value)}
            placeholder="720"
          />
        </Field>
        <Field label="Portions left today">
          <input
            className={inputClass}
            inputMode="numeric"
            value={draft.stockRemaining}
            onChange={(e) => set('stockRemaining', e.target.value)}
            placeholder="Not counted"
          />
        </Field>

        <Field label="Sort order">
          <input
            className={inputClass}
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Allergens (comma separated)">
          <input
            className={inputClass}
            value={draft.allergens}
            onChange={(e) => set('allergens', e.target.value)}
            placeholder="Nuts, Dairy, Fish"
          />
        </Field>
        <Field label="Ingredients (comma separated)">
          <input
            className={inputClass}
            value={draft.ingredients}
            onChange={(e) => set('ingredients', e.target.value)}
            placeholder="Basmati rice, Chicken, Ghee"
          />
        </Field>
      </div>

      <p className="text-caption text-ink-faint -mt-4">
        Allergens and calories are shown to customers as the restaurant&apos;s own statement. Only
        enter what the kitchen can stand behind.
      </p>

      {/* ── modifier groups ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-h3 font-bold text-ink">Choices</h3>
            <p className="text-caption text-ink-faint mt-1">
              What the customer picks before adding this to the cart — portion, spice level, a side.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addGroup}
            disabled={draft.modifierGroups.length >= 10}
          >
            Add a choice
          </Button>
        </div>

        {draft.modifierGroups.length === 0 ? (
          <p className="rounded-xl bg-surface-strong/40 px-4 py-6 text-center text-small text-ink-soft ring-1 ring-border/40">
            No choices. The customer adds this item exactly as it is.
          </p>
        ) : null}

        {draft.modifierGroups.map((group, groupIndex) => {
          const groupProblem = modifierGroupProblem(group)

          return (
            <div
              key={group.key}
              className="rounded-2xl bg-surface-strong/30 p-5 ring-1 ring-border/40 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Choice name (English)">
                  <input
                    className={inputClass}
                    value={group.name.en}
                    onChange={(e) => {
                      const en = e.target.value
                      patchGroup(groupIndex, {
                        name: { ...group.name, en },
                        // Only fill the key while it is still the generated
                        // placeholder — never rewrite one a customer may hold.
                        ...(group.key.startsWith('grp_')
                          ? { key: toKey(en, group.key) }
                          : {}),
                      })
                    }}
                    placeholder="Portion"
                  />
                </Field>
                <Field label="Choice name (Arabic)">
                  <input
                    className={inputClass}
                    dir="rtl"
                    lang="ar"
                    value={group.name.ar ?? ''}
                    onChange={(e) =>
                      patchGroup(groupIndex, { name: { ...group.name, ar: e.target.value } })
                    }
                    placeholder="الحجم"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-small font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) =>
                      patchGroup(groupIndex, {
                        required: e.target.checked,
                        // A required group must ask for at least one, so keep
                        // the two fields consistent instead of rejecting later.
                        minSelect: e.target.checked ? Math.max(1, group.minSelect) : group.minSelect,
                      })
                    }
                  />
                  Required
                </label>

                <div className="w-28">
                  <Field label="Min">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={group.minSelect}
                      onChange={(e) =>
                        patchGroup(groupIndex, { minSelect: optionalInt(e.target.value) ?? 0 })
                      }
                    />
                  </Field>
                </div>
                <div className="w-28">
                  <Field label="Max">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={group.maxSelect}
                      onChange={(e) =>
                        patchGroup(groupIndex, { maxSelect: optionalInt(e.target.value) ?? 1 })
                      }
                    />
                  </Field>
                </div>

                <div className="ms-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-status-danger"
                    onClick={() => removeGroup(groupIndex)}
                  >
                    Remove choice
                  </Button>
                </div>
              </div>

              {/* options */}
              <div className="space-y-3">
                {group.options.map((option, optionIndex) => (
                  <div key={option.key} className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
                    <Field label="Option (English)">
                      <input
                        className={inputClass}
                        value={option.name.en}
                        onChange={(e) => {
                          const en = e.target.value
                          patchOption(groupIndex, optionIndex, {
                            name: { ...option.name, en },
                            ...(option.key.startsWith('opt_')
                              ? { key: toKey(en, option.key) }
                              : {}),
                          })
                        }}
                        placeholder="Large"
                      />
                    </Field>
                    <Field label="Option (Arabic)">
                      <input
                        className={inputClass}
                        dir="rtl"
                        lang="ar"
                        value={option.name.ar ?? ''}
                        onChange={(e) =>
                          patchOption(groupIndex, optionIndex, {
                            name: { ...option.name, ar: e.target.value },
                          })
                        }
                        placeholder="كبير"
                      />
                    </Field>
                    <Field label="Extra cost (SAR)">
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={formatHalalas(option.priceDeltaHalalas)}
                        onChange={(e) => {
                          let halalas = 0
                          try {
                            halalas = sarToHalalas(e.target.value || '0')
                          } catch {
                            return
                          }
                          patchOption(groupIndex, optionIndex, { priceDeltaHalalas: halalas })
                        }}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-status-danger mb-1"
                      onClick={() => removeOption(groupIndex, optionIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addOption(groupIndex)}
                  disabled={group.options.length >= 30}
                >
                  Add an option
                </Button>
              </div>

              <p className="text-caption text-ink-faint">
                Extra cost is zero or more. A cheaper size is a separate item, not a negative price.
              </p>

              {groupProblem ? (
                <p role="alert" className="text-small font-medium text-status-warning">
                  {groupProblem}
                </p>
              ) : null}
            </div>
          )
        })}
      </section>

      {/* ── advanced ───────────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-small font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced
        </button>

        {showAdvanced ? (
          <div className="mt-4 max-w-xs">
            <Field label="VAT rate override (%)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.vatRatePercent}
                onChange={(e) => set('vatRatePercent', e.target.value)}
                placeholder="Leave blank to inherit"
              />
            </Field>
            <p className="mt-2 text-caption text-ink-faint">
              Almost always blank. The item inherits the restaurant&apos;s rate unless this dish is
              genuinely taxed differently.
            </p>
          </div>
        ) : null}
      </div>

      {message ? (
        <div
          role="alert"
          className="rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20"
        >
          {message}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} isLoading={isSaving}>
          {item ? 'Save changes' : 'Add item'}
        </Button>
      </div>
    </Card>
  )
}
