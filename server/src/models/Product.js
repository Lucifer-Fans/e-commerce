const mongoose = require('mongoose');
const slugify = require('slugify');
const { translationsField, featurePair, faqPair } = require('./translatable');

/** Admin-authored spec rows — these render the "Features" table on the details page. */
const featureSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    value: { type: String, required: true, trim: true, maxlength: 500 },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * A short product clip. Videos live beside the images but never stand in for one:
 * cards, search results and social previews all keep using `primaryImage`, so a
 * product with only a video would still have nothing to show there.
 */
const videoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    /** Poster frame Cloudinary derives from the clip — used for the gallery tile. */
    thumbnail: { type: String },
    duration: { type: Number },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * One selectable value of a variant attribute — "Black", "256 GB", "32 (Waist)".
 * `hex` paints a colour swatch and `image` a thumbnail swatch; both are optional and the
 * storefront falls back to a text chip, so a brand-new attribute needs no code change.
 */
const attributeValueSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    hex: { type: String, trim: true, maxlength: 9 },
    image: {
      url: String,
      publicId: String,
    },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * The admin-authored definition of one axis of variation. The set is completely open —
 * Color, Size, Storage, RAM, Waist, Shoe Size or anything a future catalogue needs — and
 * the storefront renders whatever it is handed.
 */
const variantAttributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    /** How the selector paints this axis. `auto` picks swatch/image/chip from the values. */
    inputType: {
      type: String,
      enum: ['auto', 'chip', 'swatch', 'image'],
      default: 'auto',
    },
    /** Shown next to the attribute name, e.g. "Size" → "Size chart". */
    helpText: { type: String, trim: true, maxlength: 120 },
    values: { type: [attributeValueSchema], default: [] },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Product name must be at least 3 characters'],
      maxlength: [160, 'Product name cannot exceed 160 characters'],
    },
    slug: { type: String, unique: true, index: true },
    sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    brand: { type: String, trim: true, maxlength: 60, index: true },

    shortDescription: { type: String, trim: true, maxlength: 300 },
    description: { type: String, required: [true, 'Description is required'] }, // rich text HTML

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      index: true,
    },

    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountPercent: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [95, 'Discount cannot exceed 95%'],
    },
    finalPrice: { type: Number, min: 0, index: true },

    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    lowStockThreshold: { type: Number, default: 5 },

    images: {
      type: [imageSchema],
      validate: {
        validator: (v) => v.length <= 5,
        message: 'A product can have at most 5 images',
      },
      default: [],
    },
    videos: {
      type: [videoSchema],
      validate: {
        validator: (v) => v.length <= 2,
        message: 'A product can have at most 2 videos',
      },
      default: [],
    },
    features: { type: [featureSchema], default: [] },
    highlights: { type: [String], default: [] }, // bullet list above the tabs
    faqs: { type: [faqSchema], default: [] },
    tags: { type: [String], default: [], index: true },

    /* ---------------- Variants ---------------- *
     * The rows themselves live in the ProductVariant collection. What is stored here is the
     * attribute *definition* (what the selector renders) plus a rollup, so every existing
     * list, filter, sort, rail and dashboard query keeps working on the parent document
     * without needing to join. The rollup is recomputed by variant.service on every write.
     */
    hasVariants: { type: Boolean, default: false, index: true },
    variantAttributes: { type: [variantAttributeSchema], default: [] },
    variantSummary: {
      count: { type: Number, default: 0 },
      activeCount: { type: Number, default: 0 },
      inStockCount: { type: Number, default: 0 },
      minPrice: { type: Number, default: 0 }, // lowest selling price across variants
      maxPrice: { type: Number, default: 0 },
      minMrp: { type: Number, default: 0 },
      maxDiscountPercent: { type: Number, default: 0 },
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    isFeatured: { type: Boolean, default: false, index: true },
    isTopSelling: { type: Boolean, default: false, index: true },

    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      // histogram powers the review-summary bars without an aggregation per request
      breakdown: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },

    soldCount: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0 },

    meta: {
      title: String,
      description: String,
      keywords: [String],
    },

    /*
     * Per-language copy. Arrays overlay positionally — `features[2]` here replaces
     * `features[2]` above — so a translator reorders nothing and a short array simply
     * leaves the remaining rows in English. See models/translatable.js.
     *
     * `brand`, `tags`, `sku` and every `slug` are absent on purpose: they are matched
     * on rather than read, and translating them breaks filters, URLs and search.
     */
    translations: translationsField({
      name: { type: String, trim: true, maxlength: 160 },
      shortDescription: { type: String, trim: true, maxlength: 300 },
      description: { type: String }, // rich text HTML, same as the base field
      highlights: { type: [String], default: undefined },
      features: { type: [new mongoose.Schema(featurePair, { _id: false })], default: undefined },
      faqs: { type: [new mongoose.Schema(faqPair, { _id: false })], default: undefined },
      meta: {
        title: String,
        description: String,
        keywords: [String],
      },
      // Display-only halves of the variant selector; the slugs still do the matching.
      variantAttributes: {
        type: [
          new mongoose.Schema(
            {
              slug: { type: String, trim: true, lowercase: true }, // which axis this renames
              name: { type: String, trim: true, maxlength: 40 },
              helpText: { type: String, trim: true, maxlength: 120 },
              values: {
                type: [
                  new mongoose.Schema(
                    {
                      slug: { type: String, trim: true, lowercase: true },
                      label: { type: String, trim: true, maxlength: 60 },
                    },
                    { _id: false }
                  ),
                ],
                default: undefined,
              },
            },
            { _id: false }
          ),
        ],
        default: undefined,
      },
    }),

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* ---------------- Indexes ---------------- */
productSchema.index({ name: 'text', shortDescription: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1, subCategory: 1, status: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, finalPrice: 1 });
productSchema.index({ status: 1, 'ratings.average': -1 });

/* ---------------- Virtuals ---------------- */
productSchema.virtual('primaryImage').get(function primaryImage() {
  if (!this.images?.length) return null;
  return this.images.find((img) => img.isPrimary) || this.images[0];
});

productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

productSchema.virtual('stockStatus').get(function stockStatus() {
  if (this.stock <= 0) return 'out_of_stock';
  if (this.stock <= this.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

productSchema.virtual('savings').get(function savings() {
  return Math.max(0, Math.round((this.price - this.finalPrice) * 100) / 100);
});

/**
 * True when variants are priced differently, which is what makes a card render
 * "From ₹1,299" instead of a single price.
 */
productSchema.virtual('hasPriceRange').get(function hasPriceRange() {
  if (!this.hasVariants) return false;
  const { minPrice = 0, maxPrice = 0 } = this.variantSummary || {};
  return maxPrice - minPrice > 0.009;
});

productSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'product',
});

/* ---------------- Hooks ---------------- */
productSchema.pre('validate', async function normalise(next) {
  if (this.isModified('name')) {
    const base = slugify(this.name, { lower: true, strict: true });
    // Slugs must stay unique even when two products share a name.
    const taken = await this.constructor.exists({ slug: base, _id: { $ne: this._id } });
    this.slug = taken ? `${base}-${this._id.toString().slice(-6)}` : base;
  }

  // finalPrice is derived server-side; a client-sent value is never trusted.
  if (this.isModified('price') || this.isModified('discountPercent') || this.isNew) {
    const discount = (this.price * (this.discountPercent || 0)) / 100;
    this.finalPrice = Math.round((this.price - discount) * 100) / 100;
  }

  if (this.images?.length) {
    const hasPrimary = this.images.some((img) => img.isPrimary);
    this.images.forEach((img, index) => {
      img.displayOrder = index;
      // First image wins by default, matching the admin uploader's contract.
      img.isPrimary = hasPrimary ? img.isPrimary : index === 0;
    });
  }

  if (this.videos?.length) {
    this.videos.forEach((video, index) => {
      video.displayOrder = index;
    });
  }

  next();
});

/** Recompute the rating aggregate after any review write. */
productSchema.statics.syncRatings = async function syncRatings(productId) {
  const Review = mongoose.model('Review');
  const rows = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;
  rows.forEach(({ _id, count }) => {
    breakdown[_id] = count;
    total += count;
    weighted += _id * count;
  });

  await this.findByIdAndUpdate(productId, {
    'ratings.average': total ? Math.round((weighted / total) * 10) / 10 : 0,
    'ratings.count': total,
    'ratings.breakdown': breakdown,
  });
};

module.exports = mongoose.model('Product', productSchema);
