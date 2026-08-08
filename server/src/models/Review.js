const mongoose = require('mongoose');
const Product = require('./Product');

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

module.exports = mongoose.model('Review', reviewSchema);
