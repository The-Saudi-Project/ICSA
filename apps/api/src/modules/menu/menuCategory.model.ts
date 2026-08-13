import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { tenantGuardPlugin } from '../../db/plugins/tenantGuard.js'

const localizedText = {
  en: { type: String, required: true, trim: true },
  ar: { type: String, trim: true },
}

const menuCategorySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: localizedText, required: true },
    description: {
      type: { en: { type: String, trim: true }, ar: { type: String, trim: true } },
      default: undefined,
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, trim: true },
  },
  { timestamps: true },
)

menuCategorySchema.plugin(tenantGuardPlugin)

menuCategorySchema.index({ restaurantId: 1, sortOrder: 1 })
// Two categories in one restaurant cannot share an English name; two
// restaurants can both have "Burgers".
menuCategorySchema.index({ restaurantId: 1, 'name.en': 1 }, { unique: true })

export type MenuCategory = InferSchemaType<typeof menuCategorySchema>
export type MenuCategoryDoc = HydratedDocument<MenuCategory>

export const MenuCategoryModel = model('MenuCategory', menuCategorySchema)
