const mongoose = require('mongoose');
const slugify = require('slugify');
const { translationsField } = require('./translatable');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
      maxlength: [60, 'Category name cannot exceed 60 characters'],
    },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { url: String, publicId: String },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    meta: {
      title: String,
      description: String,
      keywords: [String],
    },

    // The slug is intentionally absent: it is the category's URL and its filter key.
    translations: translationsField({
      name: { type: String, trim: true, maxlength: 60 },
      description: { type: String, trim: true, maxlength: 500 },
    }),
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

categorySchema.virtual('subCategories', {
  ref: 'SubCategory',
  localField: '_id',
  foreignField: 'category',
});

categorySchema.pre('validate', function setSlug(next) {
  if (this.isModified('name')) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model('Category', categorySchema);
