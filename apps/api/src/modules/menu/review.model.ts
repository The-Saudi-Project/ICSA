import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { tenantGuardPlugin } from '../../db/plugins/tenantGuard.js'

const reviewSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
    
    customerName: { type: String, required: true, trim: true },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
)

reviewSchema.plugin(tenantGuardPlugin)

// One review per order per item
reviewSchema.index({ orderId: 1, menuItemId: 1 }, { unique: true })

export type Review = InferSchemaType<typeof reviewSchema>
export type ReviewDoc = HydratedDocument<Review>

export const ReviewModel = model('Review', reviewSchema)
