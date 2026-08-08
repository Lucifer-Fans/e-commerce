const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        // Saving "the blue one in L" rather than just the product, so moving it to the
        // cart later restores the exact SKU the shopper had picked.
        variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
        variantSku: { type: String, default: null },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wishlist', wishlistSchema);
