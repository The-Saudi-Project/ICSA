/**
 * The product's name, defined once.
 *
 * **Simat — سِماط** is the spread of food laid out in front of a guest. That is
 * precisely what the product does in the second after a phone touches the
 * table: a spread appears, belonging to that table and no other.
 *
 * The name is a brand, not a translation. It has an Arabic script form because
 * half its market reads Arabic — but it is never swapped for a different word,
 * and no screen should hard-code either form. Ask `brandName(locale)`.
 */
export const BRAND = {
  name: 'Simat',
  nameAr: 'سِماط',
  tagline: 'Tap the table — the menu opens on your phone.',
  taglineAr: 'قرّب جوالك — القائمة تجيك على طاولتك.',
} as const

export function brandName(locale: string): string {
  return locale === 'ar' ? BRAND.nameAr : BRAND.name
}

export function brandTagline(locale: string): string {
  return locale === 'ar' ? BRAND.taglineAr : BRAND.tagline
}
