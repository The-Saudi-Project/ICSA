/**
 * Sales enquiries.
 *
 * The write side is public and therefore hostile territory: everything is
 * validated at the route, the body is never echoed back, and the response says
 * only that the message arrived. A form that reports "saved with id 6f2…" hands
 * a scraper a way to count our customers.
 */

import { hashIp } from '../../core/audit.js'
import { unscoped } from '../../core/tenant.js'
import { LeadModel, LeadStatus, type LeadDoc } from './lead.model.js'

export interface LeadInput {
  restaurantName: string
  contactName: string
  phone: string
  email?: string
  city?: string
  branches?: number
  message?: string
  locale?: 'en' | 'ar'
}

export interface LeadView {
  id: string
  restaurantName: string
  contactName: string
  phone: string
  email?: string
  city?: string
  branches?: number
  message?: string
  locale: string
  status: string
  createdAt: Date
}

function toView(lead: LeadDoc): LeadView {
  return {
    id: lead._id.toString(),
    restaurantName: lead.restaurantName,
    contactName: lead.contactName,
    phone: lead.phone,
    email: lead.email ?? undefined,
    city: lead.city ?? undefined,
    branches: lead.branches ?? undefined,
    message: lead.message ?? undefined,
    locale: lead.locale ?? 'en',
    status: lead.status ?? LeadStatus.NEW,
    createdAt: lead.createdAt,
  }
}

export async function submitLead(
  input: LeadInput,
  fingerprint: { ip?: string; userAgent?: string },
): Promise<void> {
  await LeadModel.create({
    ...input,
    ipHash: fingerprint.ip ? hashIp(fingerprint.ip) : undefined,
    userAgent: fingerprint.userAgent?.slice(0, 200),
  })
}

/**
 * `unscoped()` is correct here rather than a bypass to justify: a lead belongs
 * to no tenant, and this is platform-admin code — the two conditions that
 * function exists for.
 */
export async function listLeads(options: {
  status?: string
  limit: number
  skip: number
}): Promise<{ leads: LeadView[]; total: number }> {
  const filter = options.status ? { status: options.status } : {}

  const [leads, total] = await Promise.all([
    unscoped(LeadModel).find(filter, {
      sort: { createdAt: -1 },
      limit: options.limit,
      skip: options.skip,
    }),
    unscoped(LeadModel).countDocuments(filter),
  ])

  return { leads: leads.map(toView), total }
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<LeadView | null> {
  const updated = await unscoped(LeadModel).findOneAndUpdate({ _id: id }, { $set: { status } })
  return updated ? toView(updated) : null
}
