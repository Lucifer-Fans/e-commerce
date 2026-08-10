const { body } = require('express-validator');
const { EXPERIENCE_LEVELS, APPLICATION_STATUSES, INTERVIEW_MODES } = require('../models/JobApplication');
const { SUPPORTED_LANGUAGES } = require('../config/languages');

const EXPERIENCE_VALUES = EXPERIENCE_LEVELS.map((level) => level.value);
const INTERVIEW_MODE_VALUES = INTERVIEW_MODES.map((mode) => mode.value);

module.exports = {
  ...require('./common.validators'),
  auth: require('./auth.validators'),
  product: require('./product.validators'),
  variant: require('./variant.validators'),

  /*
   * Per-language catalogue copy. Only the shape is checked here — that the keys are
   * languages we ship and that the payload is an object. The per-field lengths are
   * enforced by the schema, which is the one place they are defined.
   */
  translationsRules: [
    body('translations')
      .optional({ values: 'null' })
      .isObject()
      .withMessage('Translations must be an object keyed by language code')
      .bail()
      .custom((value) => {
        const bad = Object.keys(value).filter(
          (code) => !SUPPORTED_LANGUAGES.includes(code) || code === 'en'
        );
        if (bad.length) {
          throw new Error(`Unsupported translation language: ${bad.join(', ')}`);
        }
        return true;
      }),
  ],

  categoryRules: [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Category name must be 2-60 characters'),
    body('description').optional().trim().isLength({ max: 500 }),
    // Blank is how the admin clears an image, so only a present value is checked.
    body('image.url').optional({ values: 'falsy' }).isURL().withMessage('Category image must be an uploaded image'),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  subCategoryRules: [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Sub-category name must be 2-60 characters'),
    body('category').isMongoId().withMessage('Please select a valid parent category'),
    body('image.url').optional({ values: 'falsy' }).isURL().withMessage('Sub-category image must be an uploaded image'),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  brandRules: [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Brand name must be 2-60 characters'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
    body('logo.url').optional({ values: 'falsy' }).isURL().withMessage('Brand logo must be an uploaded image'),
    body('website')
      .optional({ values: 'falsy' })
      .trim()
      .isURL({ require_protocol: true })
      .withMessage('Enter a full website URL starting with https://'),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
    body('isFeatured').optional().isBoolean().toBoolean(),
  ],

  addressRules: [
    body('fullName').trim().isLength({ min: 2, max: 60 }).withMessage('Full name is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10 digit mobile number'),
    body('alternatePhone').optional({ values: 'falsy' }).matches(/^[6-9]\d{9}$/).withMessage('Enter a valid alternate number'),
    body('addressLine1').trim().isLength({ min: 5, max: 200 }).withMessage('Address line 1 must be 5-200 characters'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
    body('label').optional().isIn(['home', 'work', 'other']),
  ],

  cartItemRules: [
    body('productId').isMongoId().withMessage('Please select a valid product'),
    // Optional here, but required by the controller for any product that has variants —
    // the message there can name the missing attribute ("choose a size").
    body('variantId').optional({ values: 'falsy' }).isMongoId().withMessage('Please select a valid option'),
    body('quantity').optional().isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10').toInt(),
  ],

  cartVariantRules: [
    body('variantId').isMongoId().withMessage('Please select a valid option'),
  ],

  cartQuantityRules: [
    body('quantity').isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10').toInt(),
  ],

  checkoutRules: [
    body('addressId').isMongoId().withMessage('Please select a delivery address'),
    body('paymentMethod').optional().isIn(['razorpay', 'cod']).withMessage('Invalid payment method'),
    body('couponCode').optional({ values: 'falsy' }).trim().isLength({ max: 24 }),
  ],

  orderStatusRules: [
    body('status')
      .isIn(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'])
      .withMessage('Invalid order status'),
    body('note').optional().trim().isLength({ max: 300 }),
    body('trackingNumber').optional().trim().isLength({ max: 60 }),
    // Staff may quote the same admin-managed picklist the storefront offers.
    body('reasonId').optional({ values: 'falsy' }).isMongoId().withMessage('Select a valid reason'),
  ],

  /**
   * Cancelling from the storefront. Exactly one of the two arrives: the id of a
   * reason the admin published, or the sentence typed under "Other". Which one is
   * required is settled in the controller — it is the only place that knows
   * whether the id resolves to a reason that is still active.
   */
  cancelOrderRules: [
    body('reasonId').optional({ values: 'falsy' }).isMongoId().withMessage('Select a valid reason'),
    body('reason')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 5, max: 300 })
      .withMessage('Tell us a little more — between 5 and 300 characters'),
  ],

  /**
   * Marking a refund sent. There is no status to pass — the endpoint does one
   * thing — so the only field is the reference staff can quote back later.
   */
  refundRules: [body('refundReference').optional({ values: 'falsy' }).trim().isLength({ max: 80 })],

  cancellationReasonRules: [
    body('label').trim().isLength({ min: 3, max: 120 }).withMessage('Reason must be 3-120 characters'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  verifyPaymentRules: [
    body('orderId').isMongoId().withMessage('Invalid order'),
    body('razorpayOrderId').trim().notEmpty().withMessage('razorpayOrderId is required'),
    body('razorpayPaymentId').trim().notEmpty().withMessage('razorpayPaymentId is required'),
    body('signature').trim().notEmpty().withMessage('signature is required'),
  ],

  reviewRules: [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5').toInt(),
    body('title').optional().trim().isLength({ max: 120 }),
    body('comment').optional().trim().isLength({ max: 2000 }),
  ],

  couponRules: [
    body('code').trim().isLength({ min: 3, max: 24 }).withMessage('Coupon code must be 3-24 characters'),
    body('discountType').isIn(['percentage', 'flat']).withMessage('Invalid discount type'),
    body('discountValue').isFloat({ min: 0 }).withMessage('Discount value must be positive').toFloat(),
    body('minOrderAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('maxDiscountAmount').optional({ values: 'null' }).isFloat({ min: 0 }).toFloat(),
    body('expiresAt').isISO8601().withMessage('A valid expiry date is required'),
  ],

  bannerRules: [
    body('title').trim().isLength({ min: 2, max: 120 }).withMessage('Banner title is required'),
    body('image.url').isURL().withMessage('Banner image is required'),
    body('placement').optional().isIn(['hero', 'strip', 'sidebar']),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
  ],

  // Every field is optional: the settings screen sends partial patches, and a blank
  // value is a legitimate way to clear a social link or a tagline.
  settingRules: [
    body('general.siteName').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 80 }).withMessage('Site name must be 2-80 characters'),
    // No normalizeEmail() here — it strips dots from gmail addresses, and this is a
    // display address customers write to, not a login.
    body('general.contactEmail').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid contact email'),
    body('general.contactNumber').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 24 }).withMessage('Enter a valid contact number'),
    body('general.companyAddress').optional({ values: 'falsy' }).trim().isLength({ max: 300 }).withMessage('Address cannot exceed 300 characters'),
    // Accepts the bare src or the whole <iframe> Google hands out; the controller keeps the src.
    body('general.mapEmbedUrl')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Map embed link is too long')
      .custom((value) => /https?:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(value))
      .withMessage('Paste a Google Maps embed link (Share → Embed a map)'),

    body('seo.metaTitle').optional({ values: 'falsy' }).trim().isLength({ max: 70 }).withMessage('Meta title should stay under 70 characters'),
    body('seo.metaDescription').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('Meta description should stay under 200 characters'),

    body('branding.logo.url').optional({ values: 'falsy' }).isURL().withMessage('Logo must be an uploaded image'),
    body('branding.favicon.url').optional({ values: 'falsy' }).isURL().withMessage('Favicon must be an uploaded image'),

    ...['instagram', 'twitter', 'facebook', 'linkedin'].map((network) =>
      body(`social.${network}`)
        .optional({ values: 'falsy' })
        .trim()
        .isURL({ require_protocol: true })
        .withMessage(`Enter a full ${network} URL starting with https://`)
    ),

    // WhatsApp is usually given as a number, so accept either that or a wa.me link.
    body('social.whatsapp')
      .optional({ values: 'falsy' })
      .trim()
      .custom((value) => /^\+?[0-9][0-9\s-]{6,19}$/.test(value) || /^https?:\/\//i.test(value))
      .withMessage('Enter a WhatsApp number or a full wa.me link'),
  ],

  // Contact-us form. Anonymous visitors post this, so every bound is explicit.
  inquiryRules: [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Please enter your full name'),
    // No normalizeEmail(): this is a reply-to address, not a login identity.
    body('email').trim().isEmail().withMessage('Enter a valid email address').isLength({ max: 120 }),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10 digit mobile number'),
    body('subject').optional({ values: 'falsy' }).trim().isLength({ max: 150 }).withMessage('Subject cannot exceed 150 characters'),
    body('message').trim().isLength({ min: 5, max: 3000 }).withMessage('Message must be 5-3000 characters'),
  ],

  // Footer newsletter box. Email is the only field, so it carries the whole contract.
  newsletterRules: [
    body('email').trim().isEmail().withMessage('Enter a valid email address').isLength({ max: 120 }),
  ],

  newsletterStatusRules: [
    body('status').isIn(['subscribed', 'unsubscribed']).withMessage('Invalid subscription status'),
  ],

  inquiryReplyRules: [
    body('message').trim().isLength({ min: 2, max: 3000 }).withMessage('Write a reply before sending'),
  ],

  // The careers form posts multipart/form-data, so every value arrives as a string.
  jobApplicationRules: [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Please enter your full name'),
    body('email').trim().isEmail().withMessage('Enter a valid email address').isLength({ max: 120 }),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10 digit mobile number'),
    body('position').trim().notEmpty().withMessage('Select the position you are applying for').isLength({ max: 80 }),
    body('experience')
      .isIn(EXPERIENCE_VALUES)
      .withMessage('Select your experience level'),
    body('location').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
    body('coverLetter').optional({ values: 'falsy' }).trim().isLength({ max: 3000 }).withMessage('Message cannot exceed 3000 characters'),
  ],

  jobPositionRules: [
    body('title').trim().isLength({ min: 2, max: 80 }).withMessage('Position title must be 2-80 characters'),
    body('department').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
    body('location').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
    body('type').optional().isIn(['full-time', 'part-time', 'internship', 'contract']).withMessage('Invalid employment type'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  // Blank is a legitimate way to clear the HR contact card.
  careerContactRules: [
    body('hrEmail').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid HR email'),
    body('hrPhone').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 24 }).withMessage('Enter a valid HR phone number'),
  ],

  /**
   * The interview block is only *required* when the move is to `interviewed` —
   * that status is what calls a candidate in, and a mail announcing an interview
   * with no time on it is worse than no mail. Every other status ignores it.
   *
   * The slot has to be in the future: the panel's picker makes a past date easy
   * to land on by mistyping the year, and the invitation gives no hint that it
   * is describing a day that has already gone.
   */
  applicationStatusRules: [
    body('status').isIn(APPLICATION_STATUSES).withMessage('Invalid application status'),
    body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),

    body('interview.scheduledAt')
      .if(body('status').equals('interviewed'))
      .notEmpty()
      .withMessage('Pick the interview date and time')
      .bail()
      .isISO8601()
      .withMessage('Enter a valid interview date and time')
      .bail()
      .custom((value) => new Date(value).getTime() > Date.now())
      .withMessage('The interview date and time must be in the future'),
    body('interview.mode')
      .if(body('status').equals('interviewed'))
      .isIn(INTERVIEW_MODE_VALUES)
      .withMessage('Select how the interview will be held'),
    // Required only for the mode that cannot be joined without it. An in-person
    // round can legitimately say nothing but "our office" in the instructions.
    body('interview.meetingLink')
      .if(body('status').equals('interviewed'))
      .if(body('interview.mode').equals('online'))
      .trim()
      .notEmpty()
      .withMessage('Add the meeting link for an online interview')
      .bail()
      .isURL({ require_protocol: true })
      .withMessage('The meeting link must be a full URL, starting with https://'),

    body('interview.location').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
    body('interview.interviewer').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
    body('interview.contactPhone').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 20 })
      .withMessage('Enter a valid contact number'),
    body('interview.durationMins').optional({ values: 'falsy' }).isInt({ min: 5, max: 600 }).toInt()
      .withMessage('Duration must be between 5 and 600 minutes'),
    body('interview.instructions').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
  ],

  profileRules: [
    body('name').optional().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
    body('phone').optional({ values: 'falsy' }).matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10 digit mobile number'),
  ],

  languageRules: [
    body('language').isIn(SUPPORTED_LANGUAGES).withMessage('That language is not supported'),
  ],

  userStatusRules: [body('status').isIn(['active', 'blocked']).withMessage('Invalid status')],
  userRoleRules: [body('role').isIn(['user', 'admin']).withMessage('Invalid role')],
};
