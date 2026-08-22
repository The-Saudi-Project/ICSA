/**
 * The homepage contact form's client.
 *
 * A third client module, alongside `api.ts` (customer, carries a table session)
 * and `staffApi.ts` (staff, carries an access token). The separation is the same
 * idea as those two: this one holds **no credential at all** and can therefore
 * never send one from a public marketing page. Keeping it apart is what makes
 * that guarantee structural rather than a matter of remembering.
 */

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : '/api/v1'

export type LeadError = 'invalid' | 'rate-limited' | 'offline'

export interface LeadInput {
  restaurantName: string
  contactName: string
  phone: string
  email?: string
  city?: string
  branches?: number
  message?: string
  locale: 'en' | 'ar'
  /** Honeypot. Always empty for a human; bots fill it in and get ignored. */
  website?: string
}

export class LeadSubmitError extends Error {
  constructor(readonly kind: LeadError) {
    super(kind)
    this.name = 'LeadSubmitError'
  }
}

export async function submitLead(input: LeadInput): Promise<void> {
  let res: Response

  try {
    res = await fetch(`${BASE}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new LeadSubmitError('offline')
  }

  if (res.ok) return
  if (res.status === 429) throw new LeadSubmitError('rate-limited')
  throw new LeadSubmitError('invalid')
}
