/**
 * `/admin/menu` — categories, items, and the full item editor.
 *
 * The quick actions stay quick: price is still an inline edit and availability
 * is still one tap, because those are the two things that happen mid-service.
 * Everything else — bilingual names, choices, allergens, prep time — opens the
 * editor, which is the only place those fields can be authored.
 */

import { formatHalalas, sarToHalalas } from '@rw/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Price } from '../../components/Price.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  fetchCategories,
  fetchMenuItems,
  setItemAvailability,
  updateCategory,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
  type MenuItemInput,
} from '../../lib/staffApi.js'
import { AdminSection, Field, inputClass, quietButtonClass } from './AdminShell.js'
import { MenuItemEditor } from './MenuItemEditor.js'

/** Null means "creating"; an item means "editing that one"; false means closed. */
type EditorState = { open: false } | { open: true; item: AdminMenuItem | null }

export default function AdminMenu() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
  }

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: fetchCategories })
  const items = useQuery({ queryKey: ['admin', 'menu'], queryFn: fetchMenuItems })

  const [newCategoryEn, setNewCategoryEn] = useState('')
  const [newCategoryAr, setNewCategoryAr] = useState('')
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)

  const addCategory = useMutation({
    mutationFn: () =>
      createCategory({
        en: newCategoryEn.trim(),
        ...(newCategoryAr.trim() ? { ar: newCategoryAr.trim() } : {}),
      }),
    onSuccess: () => {
      setNewCategoryEn('')
      setNewCategoryAr('')
      setError(null)
      refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  const saveItem = useMutation({
    mutationFn: (input: MenuItemInput) =>
      editor.open && editor.item
        ? updateMenuItem(editor.item.id, input)
        : createMenuItem(input),
    onSuccess: () => {
      setEditor({ open: false })
      setEditorError(null)
      refresh()
    },
    onError: (e: Error) => setEditorError(e.message),
  })

  const toggle = useMutation({
    mutationFn: ({ item }: { item: AdminMenuItem }) =>
      setItemAvailability(item.id, !item.isAvailable),
    onSettled: refresh,
  })

  // `sarToHalalas` throws on anything unparseable, which is right for money.
  // Throwing inside `mutationFn` routes it to `onError`, so a typo becomes a
  // message rather than an unhandled rejection.
  const reprice = useMutation({
    mutationFn: ({ id, sar }: { id: string; sar: string }) =>
      updateMenuItem(id, { priceHalalas: sarToHalalas(sar) }),
    onSettled: refresh,
    onError: (e: Error) => setError(e.message),
  })

  const byCategory = new Map<string, AdminMenuItem[]>()
  for (const item of items.data?.items ?? []) {
    const bucket = byCategory.get(item.categoryId)
    if (bucket) bucket.push(item)
    else byCategory.set(item.categoryId, [item])
  }

  const categoryList = categories.data?.categories ?? []

  function openEditor(item: AdminMenuItem | null) {
    setEditorError(null)
    setEditor({ open: true, item })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 animate-fade-in space-y-4">
      <AdminSection title="Add a category">
        <Card variant="glass" className="p-6 border-border/40">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English)">
              <input
                className={inputClass}
                value={newCategoryEn}
                onChange={(e) => setNewCategoryEn(e.target.value)}
                placeholder="e.g. Biriyani & Rice"
              />
            </Field>
            <Field label="Name (Arabic)">
              <input
                className={inputClass}
                dir="rtl"
                lang="ar"
                value={newCategoryAr}
                onChange={(e) => setNewCategoryAr(e.target.value)}
                placeholder="برياني وأرز"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              disabled={!newCategoryEn.trim() || addCategory.isPending}
              onClick={() => addCategory.mutate()}
            >
              Add category
            </Button>
          </div>
        </Card>
      </AdminSection>

      <AdminSection
        title={editor.open ? (editor.item ? 'Edit item' : 'New item') : 'Items'}
        action={
          editor.open ? null : (
            <Button
              type="button"
              onClick={() => openEditor(null)}
              disabled={categoryList.length === 0}
            >
              New item
            </Button>
          )
        }
      >
        {editor.open ? (
          <MenuItemEditor
            // Remount on target change so the draft never carries over.
            key={editor.item?.id ?? 'new'}
            item={editor.item}
            categories={categoryList}
            defaultCategoryId={categoryList[0]?.id ?? ''}
            onSave={(input) => saveItem.mutate(input)}
            onCancel={() => {
              setEditor({ open: false })
              setEditorError(null)
            }}
            isSaving={saveItem.isPending}
            serverError={editorError}
          />
        ) : categoryList.length === 0 ? (
          <Card variant="glass" className="p-6 border-border/40">
            <p className="text-body text-ink-soft">
              Add a category first — every item belongs to one.
            </p>
          </Card>
        ) : null}
      </AdminSection>

      {error ? (
        <div
          role="alert"
          className="rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20"
        >
          {error}
        </div>
      ) : null}

      {categoryList.map((category) => (
        <AdminSection
          key={category.id}
          title={category.name.en}
          action={
            <div className="flex items-center gap-3">
              {!category.isActive ? (
                <span className="rounded-md bg-status-warning-wash px-2 py-0.5 text-caption font-bold text-status-warning ring-1 ring-status-warning/20">
                  Hidden
                </span>
              ) : null}
              <span className="rounded-full bg-surface-strong px-3 py-1 text-small font-bold text-ink-soft ring-1 ring-border shadow-sm">
                {byCategory.get(category.id)?.length ?? 0} items
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingCategory(category)}
                disabled={editingCategory?.id === category.id}
              >
                Edit
              </Button>
            </div>
          }
        >
          {editingCategory?.id === category.id ? (
            <CategoryEditor
              key={category.id}
              category={category}
              itemCount={byCategory.get(category.id)?.length ?? 0}
              onDone={() => {
                setEditingCategory(null)
                refresh()
              }}
              onCancel={() => setEditingCategory(null)}
            />
          ) : null}

          <Card variant="glass" className="overflow-hidden border-border/40 p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-surface-strong/30 text-small font-bold text-ink-soft uppercase tracking-wider">
                  <th className="py-4 px-6 text-start">Item</th>
                  <th className="py-4 px-6 text-end">Price</th>
                  <th className="py-4 px-6 text-end">Availability</th>
                  <th className="py-4 px-6 text-end">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {(byCategory.get(category.id) ?? []).map((item) => (
                  <tr key={item.id} className="group hover:bg-surface-hover/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-start gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-border"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-body font-bold text-ink group-hover:text-accent transition-colors">
                            {item.name.en}
                          </p>
                          {item.name.ar ? (
                            <p className="text-small text-ink-soft mt-0.5" dir="rtl" lang="ar">
                              {item.name.ar}
                            </p>
                          ) : null}
                          <ItemBadges item={item} />
                          {!item.isActive ? (
                            <p className="text-small font-semibold text-status-warning mt-1">
                              Retired
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-end">
                      <PriceCell
                        item={item}
                        onSave={(sar) => reprice.mutate({ id: item.id, sar })}
                      />
                    </td>
                    <td className="py-4 px-6 text-end">
                      <button
                        type="button"
                        onClick={() => toggle.mutate({ item })}
                        className={[
                          'pressable rounded-full px-4 py-1.5 text-small font-bold transition-all shadow-sm',
                          item.isAvailable
                            ? 'bg-status-success-wash text-status-success ring-1 ring-status-success/30 hover:bg-status-success/20'
                            : 'bg-status-danger text-white shadow-md hover:bg-red-600',
                        ].join(' ')}
                      >
                        {item.isAvailable ? 'Available' : 'Sold Out'}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-end">
                      <Button variant="ghost" size="sm" onClick={() => openEditor(item)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {(byCategory.get(category.id) ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center">
                      <p className="text-body font-medium text-ink-soft">
                        Nothing in this category yet.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </AdminSection>
      ))}
    </div>
  )
}

/** Small signals about what an item carries, so gaps are visible without opening it. */
function ItemBadges({ item }: { item: AdminMenuItem }) {
  const badges: string[] = []
  if (item.modifierGroups.length > 0) {
    badges.push(`${item.modifierGroups.length} choice${item.modifierGroups.length > 1 ? 's' : ''}`)
  }
  if (item.allergens?.length) badges.push(`${item.allergens.length} allergens`)
  if (item.prepTimeMinutes !== undefined) badges.push(`${item.prepTimeMinutes} min`)
  if (badges.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-md bg-surface-strong px-2 py-0.5 text-caption font-medium text-ink-soft ring-1 ring-border/50"
        >
          {badge}
        </span>
      ))}
    </div>
  )
}

/**
 * Category editing — rename, translate, reorder, hide, delete.
 *
 * Replaces an inline control that could only add an Arabic name. Renaming a
 * category is ordinary work ("Timber" was a typo, "Breakfast" should read
 * "Naadan Breakfast") and there was no way to do it without deleting and
 * recreating, which is impossible once the category holds items.
 *
 * Hiding and deleting are deliberately different. Hiding takes the whole
 * category off the customer menu and is reversible; deleting is refused by the
 * server while any item still belongs to it, so there is no way to orphan a dish.
 */
function CategoryEditor({
  category,
  itemCount,
  onDone,
  onCancel,
}: {
  category: AdminCategory
  itemCount: number
  onDone: () => void
  onCancel: () => void
}) {
  const [nameEn, setNameEn] = useState(category.name.en)
  const [nameAr, setNameAr] = useState(category.name.ar ?? '')
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const order = Number(sortOrder.trim())
      return updateCategory(category.id, {
        name: { en: nameEn.trim(), ...(nameAr.trim() ? { ar: nameAr.trim() } : {}) },
        ...(Number.isFinite(order) ? { sortOrder: Math.round(order) } : {}),
      })
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  })

  const toggleActive = useMutation({
    mutationFn: () => updateCategory(category.id, { isActive: !category.isActive }),
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: onDone,
    // The server explains why far better than we can — it names the item count.
    onError: (e: Error) => setError(e.message),
  })

  const busy = save.isPending || toggleActive.isPending || remove.isPending

  return (
    <Card variant="glass" className="mb-4 p-6 border-border/40 space-y-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <Field label="Name (English)">
          <input
            className={inputClass}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Naadan Breakfast"
          />
        </Field>
        <Field label="Name (Arabic)">
          <input
            className={inputClass}
            dir="rtl"
            lang="ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="فطور نادان"
          />
        </Field>
        <Field label="Sort order">
          <input
            className={inputClass}
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>

      <p className="text-caption text-ink-faint -mt-3">
        Lower sort order appears first on the customer menu. Leave gaps — 10, 20, 30 — so a new
        category can slot between two others without renumbering everything.
      </p>

      {error ? (
        <div
          role="alert"
          className="rounded-xl bg-status-danger-wash px-4 py-3 text-body font-medium text-status-danger ring-1 ring-status-danger/20"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => toggleActive.mutate()}
          >
            {category.isActive ? 'Hide from menu' : 'Show on menu'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-status-danger"
            disabled={busy || itemCount > 0}
            title={
              itemCount > 0
                ? `Move or delete the ${itemCount} item(s) in here first`
                : undefined
            }
            onClick={() => {
              if (window.confirm(`Delete the category "${category.name.en}"?`)) remove.mutate()
            }}
          >
            Delete
          </Button>

          {itemCount > 0 ? (
            <span className="text-caption text-ink-faint">
              Holds {itemCount} item{itemCount > 1 ? 's' : ''} — hide it instead of deleting.
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => save.mutate()}
            isLoading={save.isPending}
            disabled={!nameEn.trim() || busy}
          >
            Save
          </Button>
        </div>
      </div>
    </Card>
  )
}

function PriceCell({ item, onSave }: { item: AdminMenuItem; onSave: (sar: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(() => formatHalalas(item.priceHalalas))

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(formatHalalas(item.priceHalalas))
          setEditing(true)
        }}
        className="pressable rounded-lg px-2 py-1 hover:bg-surface transition-colors"
      >
        <Price halalas={item.priceHalalas} size="meta" />
      </button>
    )
  }

  return (
    <span className="flex items-center justify-end gap-2">
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(value)
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="input-glass !w-24 text-end"
      />
      <button
        type="button"
        onClick={() => {
          onSave(value)
          setEditing(false)
        }}
        className={quietButtonClass}
      >
        Save
      </button>
    </span>
  )
}
