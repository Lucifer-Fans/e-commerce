const mongoose = require('mongoose');
const slugify = require('slugify');

const { translationsField } = require('./translatable');

/**
 * Brand catalogue.
 *
 * Products store the brand as a plain string (`Product.brand`) because the storefront
 * filters, the search index and the order snapshots all read it by name. This
 * collection is the curated list behind that string: it gives each brand a logo, a
 * description and a display order, and it is what the product form offers as options.
 * Renaming a brand rewrites the products that carry the old name — see the controller.
 */
const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      unique: true,
      maxlength: [60, 'Brand name cannot exceed 60 characters'],
    },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    logo: { url: String, publicId: String },
    website: { type: String, trim: true, maxlength: 300 },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },

    /**
     * `name` is deliberately absent: `Product.brand` stores this string verbatim and the
     * storefront filters, the search index and every past order snapshot match on it, so
     * a translated name would silently empty the brand filter. Only the prose travels.
     */
    translations: translationsField({
      description: { type: String, trim: true, maxlength: 500 },
    }),
  },
  { timestamps: true }
);

brandSchema.pre('validate', function setSlug(next) {
  if (this.isModified('name')) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model('Brand', brandSchema);
