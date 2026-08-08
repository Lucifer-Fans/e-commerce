const mongoose = require('mongoose');
const slugify = require('slugify');
const { translationsField } = require('./translatable');

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Sub-category name is required'],
      trim: true,
      maxlength: [60, 'Sub-category name cannot exceed 60 characters'],
    },
    slug: { type: String, index: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Parent category is required'],
      index: true,
    },
    description: { type: String, trim: true, maxlength: 500 },
    image: { url: String, publicId: String },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },

    translations: translationsField({
      name: { type: String, trim: true, maxlength: 60 },
      description: { type: String, trim: true, maxlength: 500 },
    }),
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Same sub-category name may exist under different parents ("Accessories"), never twice under one.
subCategorySchema.index({ category: 1, slug: 1 }, { unique: true });

subCategorySchema.pre('validate', function setSlug(next) {
  if (this.isModified('name')) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model('SubCategory', subCategorySchema);
