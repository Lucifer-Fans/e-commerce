const mongoose = require('mongoose');

/** The careers form's experience dropdown — the panel filters on the same list. */
const EXPERIENCE_LEVELS = [
  { value: 'intern', label: 'Intern' },
  { value: 'fresher', label: 'Fresher (0-1 Years)' },
  { value: '1-3', label: '1-3 Years' },
  { value: '3-5', label: '3-5 Years' },
  { value: '5+', label: '5+ Years' },
];

const APPLICATION_STATUSES = ['new', 'shortlisted', 'interviewed', 'rejected', 'hired'];

/**
 * How the interview is held. The mode decides which of the two "where" fields
 * the panel asks for and the mail prints — an address is meaningless for a
 * video call and a joining link is meaningless for one held in the office.
 */
const INTERVIEW_MODES = [
  { value: 'in-person', label: 'In person' },
  { value: 'online', label: 'Online / Video call' },
  { value: 'phone', label: 'Telephone' },
];

/**
 * What HR fills in when an application is moved to `interviewed` — the status
 * is set to call a candidate *in*, so the record has to carry the appointment
 * the mail then states. Everything but the slot and the mode is optional: a
 * first-round phone screen often has nothing more to say than when it is.
 *
 * `scheduledAt` is a single instant rather than a date plus a "10:30 AM" string
 * so it sorts, compares and formats like every other date in the system.
 *
 * `sentAt` records when the applicant was actually told, which is not the same
 * as when the row was written — a mail can fail, and a re-schedule overwrites
 * the slot above it.
 */
const interviewSchema = new mongoose.Schema(
  {
    scheduledAt: { type: Date },
    mode: { type: String, enum: INTERVIEW_MODES.map((mode) => mode.value), default: 'in-person' },
    // Where to come, for an in-person round.
    location: { type: String, trim: true, maxlength: 200, default: '' },
    // Where to join, for an online one. Kept separate from `location` so neither
    // has to be parsed to work out which it is.
    meetingLink: { type: String, trim: true, maxlength: 500, default: '' },
    interviewer: { type: String, trim: true, maxlength: 80, default: '' },
    contactPhone: { type: String, trim: true, maxlength: 20, default: '' },
    durationMins: { type: Number, min: 5, max: 600 },
    // Anything else the candidate should bring, read or expect.
    instructions: { type: String, trim: true, maxlength: 1000, default: '' },
    sentAt: { type: Date },
  },
  { _id: false }
);

/**
 * A job application submitted from the storefront careers page.
 *
 * `position` is denormalised to a string on purpose: a role can be closed or renamed
 * long after someone applied, and the application must still say what they applied for.
 */
const jobApplicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: 120,
      index: true,
    },
    phone: { type: String, required: [true, 'Phone is required'], trim: true, maxlength: 20 },

    position: { type: String, required: [true, 'Position is required'], trim: true, maxlength: 80, index: true },
    // Snapshot of the role that was picked, useful when titles are later edited.
    positionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosition' },

    experience: {
      type: String,
      required: [true, 'Experience is required'],
      enum: EXPERIENCE_LEVELS.map((level) => level.value),
      index: true,
    },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    coverLetter: { type: String, trim: true, maxlength: 3000, default: '' },

    resume: {
      url: String,
      publicId: String,
      // Original filename and size, so the panel can label the download sensibly.
      fileName: { type: String, maxlength: 200 },
      bytes: Number,
      format: String,
    },

    status: { type: String, enum: APPLICATION_STATUSES, default: 'new', index: true },
    // Absent until the application reaches `interviewed`, and left in place if it
    // moves past it — an offer letter should not erase the record of the round
    // that earned it.
    interview: { type: interviewSchema, default: undefined },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    isRead: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

jobApplicationSchema.index({ createdAt: -1 });

// Statics are attached to the model itself, so validators and controllers can read
// the canonical lists straight off the require.
jobApplicationSchema.statics.EXPERIENCE_LEVELS = EXPERIENCE_LEVELS;
jobApplicationSchema.statics.APPLICATION_STATUSES = APPLICATION_STATUSES;
jobApplicationSchema.statics.INTERVIEW_MODES = INTERVIEW_MODES;

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
