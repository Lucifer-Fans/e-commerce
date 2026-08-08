const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['razorpay', 'cod'], default: 'razorpay' },

    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, index: true },
    razorpaySignature: String,

    amount: { type: Number, required: true }, // rupees
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    method: String, // card / upi / netbanking — as reported by Razorpay
    errorCode: String,
    errorDescription: String,
    refund: {
      refundId: String,
      amount: Number,
      status: String,
      processedAt: Date,
    },
    // Trimmed provider payload kept for reconciliation/disputes.
    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
