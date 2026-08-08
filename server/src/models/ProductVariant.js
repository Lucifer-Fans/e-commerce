const mongoose = require('mongoose');

/**
 * A single sellable combination of a product's attributes — Black + M, Graphite + 256 GB,
 * and so on. Every variant owns its own SKU, price, stock, imagery and logistics data, so
 * inventory, orders, returns and analytics can all reference the exact unit that moved
 * rather than the parent product.
 *
 * Variants live in their own collection (not a sub-document array) because a product with
 * five colours × six sizes × three storage tiers is 90 rows: they need their own indexes,
 * their own atomic `$inc` on stock, and they must stay cheap to page through in the admin.
 */

/** Denormalised copy of the attribute pair, so a variant renders without loading the parent. */
const variantAttributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 }, // "Color"
    slug: { type: String, required: true, trim: true, lowercase: true }, // "color"
    value: { type: String, required: true, trim: true, maxlength: 60 }, // "Graphite Black"
    valueSlug: { type: String, required: true, trim: true, lowercase: true }, // "graphite-black"
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const variantImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const productVariantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'A variant must belong to a product'],
      index: true,
    },

    sku: {
      type: String,
      required: [true, 'Every variant needs its own SKU'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 64,
    },

    attributes: {
      type: [variantAttributeSchema],
      validate: {
        validator: (v) => v.length > 0 && v.length <= 6,
        message: 'A variant must define between 1 and 6 attributes',
      },
    },

    /**
     * Canonical `color:black|size:m` fingerprint, sorted by attribute slug. Reordering the
     * attributes in the admin must never be able to mint a duplicate combination, so the
     * uniqueness index is built on this rather than on the array itself.
     */
    attributeKey: { type: String, required: true, index: true },

    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    discountPercent: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [95, 'Discount cannot exceed 95%'],
    },
    finalPrice: { type: Number, min: 0, index: true },

    stock: { type: Number, required: true, min: [0, 'Stock cannot be negative'], default: 0 },
    lowStockThreshold: { type: Number, default: 5 },

    /** Falls back to the parent product's gallery when this variant has no imagery of its own. */
    images: {
      type: [variantImageSchema],
      validate: { validator: (v) => v.length <= 5, message: 'A variant can have at most 5 images' },
      default: [],
    },

    weight: {
      value: { type: Number, min: 0 },
      unit: { type: String, enum: ['g', 'kg'], default: 'g' },
    },
    dimensions: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
      unit: { type: String, enum: ['cm', 'in'], default: 'cm' },
    },

    barcode: { type: String, trim: true, maxlength: 40 },
    hsnCode: { type: String, trim: true, maxlength: 20 },

    /** An inactive variant stays visible in the selector but can never be added to a cart. */
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false },

    soldCount: { type: Number, default: 0 },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* ---------------- Indexes ---------------- */
// One row per combination per product — the database, not the controller, is the guard.
productVariantSchema.index({ product: 1, attributeKey: 1 }, { unique: true });
productVariantSchema.index({ product: 1, isActive: 1, displayOrder: 1 });
productVariantSchema.index({ product: 1, stock: 1 });

/* ---------------- Virtuals ---------------- */
productVariantSchema.virtual('inStock').get(function inStock() {
  return this.isActive && this.stock > 0;
});

productVariantSchema.virtual('stockStatus').get(function stockStatus() {
  if (!this.isActive) return 'unavailable';
  if (this.stock <= 0) return 'out_of_stock';
  if (this.stock <= (this.lowStockThreshold ?? 0)) return 'low_stock';
  return 'in_stock';
});

/** "Black · M" — the human label used in carts, orders, invoices and emails. */
productVariantSchema.virtual('label').get(function label() {
  return (this.attributes || []).map((a) => a.value).join(' · ');
});

productVariantSchema.virtual('savings').get(function savings() {
  return Math.max(0, Math.round((this.price - this.finalPrice) * 100) / 100);
});

productVariantSchema.virtual('primaryImage').get(function primaryImage() {
  if (!this.images?.length) return null;
  return this.images.find((img) => img.isPrimary) || this.images[0];
});

/* ---------------- Hooks ---------------- */
productVariantSchema.pre('validate', function normalise(next) {
  // finalPrice is derived server-side; a client-sent value is never trusted.
  if (this.isModified('price') || this.isModified('discountPercent') || this.isNew) {
    const discount = (this.price * (this.discountPercent || 0)) / 100;
    this.finalPrice = Math.round((this.price - discount) * 100) / 100;
  }

  if (this.images?.length) {
    const hasPrimary = this.images.some((img) => img.isPrimary);
    this.images.forEach((img, index) => {
      img.displayOrder = index;
      img.isPrimary = hasPrimary ? img.isPrimary : index === 0;
    });
  }

  next();
});

module.exports = mongoose.model('ProductVariant', productVariantSchema);
