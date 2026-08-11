const mongoose = require('mongoose');
const Product = require('./Product');

/** Mirrored by the storefront uploader and the request validator. */
const MAX_MEDIA = 5;

/**
 * A photo or clip a shopper attached to their review. Videos carry a poster frame
 * so a list of reviews can render thumbnails without loading any video bytes.
 */
const mediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    url: { type: String, required: true },
    publicId: String,
    thumbnail: String,
    width: Number,
    height: Number,
    duration: Number,
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
    },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, trim: true, maxlength: 2000 },
    images: [{ url: String, publicId: String }],
    media: {
      type: [mediaSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= MAX_MEDIA,
        message: `A review can carry at most ${MAX_MEDIA} photos or videos`,
      },
    },
    isVerifiedPurchase: { type: Boolean, default: false },
    helpfulCount: { type: Number, default: 0 },
    /**
     * Who has voted, so a review can only be marked helpful once per account.
     * Hidden by default — the count is public, but who voted is not.
     */
    helpfulBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      select: false,
      default: [],
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  },
  { timestamps: true }
);

// One review per user per product.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });

async function resync(doc) {
  if (doc) await Product.syncRatings(doc.product);
}

reviewSchema.post('save', resync);
reviewSchema.post('findOneAndUpdate', resync);
reviewSchema.post('findOneAndDelete', resync);
reviewSchema.post('deleteOne', { document: true, query: false }, resync);

const Review = mongoose.model('Review', reviewSchema);
Review.MAX_MEDIA = MAX_MEDIA;

module.exports = Review;
