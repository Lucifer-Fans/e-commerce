const mongoose = require('mongoose');

/** Hero slider + promo strips. Fully admin-managed; the storefront has no fallback slides. */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Banner title is required'], trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 200 },
    ctaLabel: { type: String, trim: true, maxlength: 40, default: 'Shop Now' },
    ctaLink: { type: String, trim: true, default: '/products' },
    image: {
      url: { type: String, required: [true, 'Banner image is required'] },
      publicId: String,
    },
    mobileImage: { url: String, publicId: String },
    placement: {
      type: String,
      enum: ['hero', 'strip', 'sidebar'],
      default: 'hero',
      index: true,
    },
    theme: { type: String, enum: ['light', 'dark'], default: 'dark' }, // text colour over the art
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema);
