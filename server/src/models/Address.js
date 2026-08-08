const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10 digit mobile number'],
    },
    alternatePhone: { type: String, match: [/^[6-9]\d{9}$/, 'Invalid alternate phone number'] },
    addressLine1: { type: String, required: [true, 'Address line 1 is required'], trim: true },
    addressLine2: { type: String, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, required: [true, 'City is required'], trim: true },
    state: { type: String, required: [true, 'State is required'], trim: true },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      match: [/^\d{6}$/, 'Pincode must be 6 digits'],
    },
    country: { type: String, default: 'India', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });

/** Exactly one default per user. */
addressSchema.pre('save', async function ensureSingleDefault(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

module.exports = mongoose.model('Address', addressSchema);
