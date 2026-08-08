const mongoose = require('mongoose');

/**
 * An open role the careers page offers in its "Position Applying For" dropdown.
 *
 * Fully admin-managed from Inquiries → Careers, so HR can open and close roles
 * without a deploy. Applications keep the position as a plain string (see
 * JobApplication.position) — deleting a role must never orphan an application.
 */
const jobPositionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Position title is required'],
      trim: true,
      maxlength: 80,
      unique: true,
    },
    department: { type: String, trim: true, maxlength: 60, default: '' },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    type: {
      type: String,
      enum: ['full-time', 'part-time', 'internship', 'contract'],
      default: 'full-time',
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobPosition', jobPositionSchema);
