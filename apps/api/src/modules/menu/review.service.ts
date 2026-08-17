import { notFound, conflict, badRequest } from '../../core/errors.js'
import { requireTenantId, tenantRepo } from '../../core/tenant.js'
import { OrderModel } from '../orders/order.model.js'
import { OrderStatus } from '@rw/shared'
import { ReviewModel } from './review.model.js'
import { MenuItemModel } from './menuItem.model.js'
import mongoose from 'mongoose'

export async function createReview(input: {
  menuItemId: string
  orderPublicId: string
  rating: number
  comment?: string
  customerName: string
}) {
  requireTenantId()

  const order = await tenantRepo(OrderModel).findOne({ publicId: input.orderPublicId })
  if (!order) throw notFound('Order not found')

  if (order.status !== OrderStatus.COMPLETED) {
    throw badRequest('You can only review items from completed orders.')
  }

  const hasItem = order.items.some(item => item.menuItemId.toString() === input.menuItemId)
  if (!hasItem) {
    throw badRequest('This item was not part of your order.')
  }

  const existing = await tenantRepo(ReviewModel).findOne({
    orderId: order._id,
    menuItemId: input.menuItemId
  })

  if (existing) {
    throw conflict('You have already reviewed this item for this order.')
  }

  const review = await tenantRepo(ReviewModel).create({
    menuItemId: input.menuItemId,
    orderId: order._id,
    rating: input.rating,
    comment: input.comment,
    customerName: input.customerName,
  })

  // Update item averages
  const stats = await tenantRepo(ReviewModel).aggregate<{ avgRating: number; count: number }>([
    { $match: { menuItemId: new mongoose.Types.ObjectId(input.menuItemId), isPublished: true } },
    { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ])

  if (stats.length > 0 && stats[0]) {
    await tenantRepo(MenuItemModel).findOneAndUpdate(
      { _id: input.menuItemId },
      { $set: { averageRating: Math.round(stats[0].avgRating * 10) / 10, reviewCount: stats[0].count } }
    )
  }

  return review
}

export async function getReviews(menuItemId: string, limit = 10, skip = 0) {
  const reviews = await tenantRepo(ReviewModel).find(
    { menuItemId, isPublished: true },
    { sort: { createdAt: -1 }, limit, skip, select: 'rating comment customerName createdAt' }
  )
  return reviews
}
