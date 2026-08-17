const { body } = require('express-validator');
const { EXPERIENCE_LEVELS, APPLICATION_STATUSES, INTERVIEW_MODES } = require('../models/JobApplication');
const { SUPPORTED_LANGUAGES } = require('../config/languages');
const env = require('../config/env');

/** Read once: several rules below build a fixed-width digit pattern from it. */
const OTP_LENGTH = env.otp.length;

const EXPERIENCE_VALUES = EXPERIENCE_LEVELS.map((level) => level.value);
const INTERVIEW_MODE_VALUES = INTERVIEW_MODES.map((mode) => mode.value);

const MAX_REVIEW_MEDIA = require('../models/Review').MAX_MEDIA;

/** Only URLs Cloudinary handed us back count as an attachment. */
const isStoreAsset = (value) =>
  typeof value === 'string' && /^https:\/\/res\.cloudinary\.com\/[\w-]+\//.test(value);

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
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  /** The twin of the rule above — same shape, because the two lists are twins. */
  deactivationReasonRules: [
    body('label').trim().isLength({ min: 3, max: 120 }).withMessage('Reason must be 3-120 characters'),
    body('displayOrder').optional().isInt({ min: 0 }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
  ],

  /**
   * Step one of closing an account: which reason, or the shopper's own words.
   *
   * Exactly one of the two must arrive. `reasonId` names a published row and is
   * re-checked against the collection by the controller — a retired reason must
   * not be selectable from a tab left open since yesterday — while `reason` is
   * the free text behind "Other", held to the same 5-300 characters the order
   * cancellation dialog asks for.
   */
  deactivationRequestRules: [
    body('reasonId').optional({ values: 'falsy' }).isMongoId().withMessage('Please choose a valid reason'),
    body('reason')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 5, max: 300 })
      .withMessage('Tell us a little more — between 5 and 300 characters'),
    body().custom((_value, { req }) => {
      const hasId = Boolean(req.body.reasonId);
      const hasText = Boolean(String(req.body.reason || '').trim());
      if (!hasId && !hasText) throw new Error('Please select a reason for deactivating');
      if (hasId && hasText) throw new Error('Choose a listed reason or write your own, not both');
      return true;
    }),
  ],

  /** The code that actually closes the account. Digits, at the configured width. */
  deactivationConfirmRules: [
    body('otp')
      .trim()
      .matches(new RegExp(`^\\d{${OTP_LENGTH}}$`))
      .withMessage(`Enter the ${OTP_LENGTH}-digit code we emailed you`),
  ],

  /** Asking us to email a reactivation link. The address and nothing else. */
  reactivationEmailRules: [
    body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  ],

  /** Every later step in the reactivation carries the link's token. */
  reactivationTokenRules: [
    body('token').isString().trim().isLength({ min: 20 }).withMessage('Invalid reactivation link'),
  ],

  /**
   * The submission itself: the token, a fresh code, and the account's own details
   * re-typed from memory.
   *
   * The name and mobile number are checked against the record by the controller,
   * not here — this only guarantees they arrived in a shape worth comparing.
   * `phone` is optional because an account may never have had one; the controller
   * requires it exactly when the record holds one.
   */
  reactivationSubmitRules: [
    body('token').isString().trim().isLength({ min: 20 }).withMessage('Invalid reactivation link'),
    body('otp')
      .trim()
      .matches(new RegExp(`^\\d{${OTP_LENGTH}}$`))
      .withMessage(`Enter the ${OTP_LENGTH}-digit code we emailed you`),
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter the name on the account'),
    body('phone')
      .optional({ values: 'falsy' })
      .trim()
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Enter the 10 digit mobile number on the account'),
    body('message').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  ],

  /** An admin's decision on a reactivation request. */
  reactivationDecisionRules: [
    body('adminNotes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
    body('rejectionReason')
      .if(body('decision').equals('rejected'))
      .trim()
      .isLength({ min: 3, max: 300 })
      .withMessage('Tell the customer why the request was refused (at least 3 characters)'),
    body('decision').isIn(['approved', 'rejected']).withMessage('Invalid decision'),
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

    /*
     * Attachments arrive as URLs the client got back from /uploads/media, never as
     * files — so the only thing worth checking is that they really are assets this
     * store uploaded. Anything else would let a review embed a remote URL of the
     * author's choosing on a product page.
     */
    body('media')
      .optional({ values: 'null' })
      .isArray({ max: MAX_REVIEW_MEDIA })
      .withMessage(`You can attach at most ${MAX_REVIEW_MEDIA} photos or videos`),
    body('media.*.type').isIn(['image', 'video']).withMessage('Attachment type must be image or video'),
    body('media.*.url').custom(isStoreAsset).withMessage('Attachments must be uploaded through this store'),
    body('media.*.thumbnail')
      .optional({ values: 'falsy' })
      .custom(isStoreAsset)
      .withMessage('Attachments must be uploaded through this store'),
    body('media.*.publicId').optional({ values: 'falsy' }).isString().trim(),
  ],

  couponRules: [
    body('code').trim().isLength({ min: 3, max: 24 }).withMessage('Coupon code must be 3-24 characters'),
    body('discountType').isIn(['percentage', 'flat']).withMessage('Invalid discount type'),
    body('discountValue').isFloat({ min: 0 }).withMessage('Discount value must be positive').toFloat(),
    body('minOrderAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('maxDiscountAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
    // Blank is how the admin says "unlimited", so it must pass — the controller
    // turns it into null. Only a supplied value has to be a sane whole number.
    body('usageLimit').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Total usage limit must be at least 1').toInt(),
    body('perUserLimit').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Uses per customer must be at least 1').toInt(),
    body('startsAt').optional({ values: 'falsy' }).isISO8601(),
    body('isActive').optional().isBoolean().toBoolean(),
    // Empty/absent is the default and means the whole cart; anything listed pins
    // the coupon to those goods. Ids only — the controller strips populated docs.
    body('appliesTo.categories').optional({ values: 'null' }).isArray().withMessage('Select valid categories'),
    body('appliesTo.categories.*').isMongoId().withMessage('Select valid categories'),
    body('appliesTo.products').optional({ values: 'null' }).isArray().withMessage('Select valid products'),
    body('appliesTo.products.*').isMongoId().withMessage('Select valid products'),
    body('expiresAt').isISO8601().withMessage('A valid expiry date is required'),
  ],

  /**
   * The same rules with nothing required: the edit dialog sends whole documents,
   * but a PATCH is free to send one field. Leaving this off the route was how an
   * edit could set a percentage coupon to values create would have rejected.
   */
  couponUpdateRules: [
    body('code').optional().trim().isLength({ min: 3, max: 24 }).withMessage('Coupon code must be 3-24 characters'),
    body('discountType').optional().isIn(['percentage', 'flat']).withMessage('Invalid discount type'),
    body('discountValue').optional().isFloat({ min: 0 }).withMessage('Discount value must be positive').toFloat(),
    body('minOrderAmount').optional().isFloat({ min: 0 }).toFloat(),
    body('maxDiscountAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
    body('usageLimit').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Total usage limit must be at least 1').toInt(),
    body('perUserLimit').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Uses per customer must be at least 1').toInt(),
    body('startsAt').optional({ values: 'falsy' }).isISO8601(),
    body('isActive').optional().isBoolean().toBoolean(),
    // Empty/absent is the default and means the whole cart; anything listed pins
    // the coupon to those goods. Ids only — the controller strips populated docs.
    body('appliesTo.categories').optional({ values: 'null' }).isArray().withMessage('Select valid categories'),
    body('appliesTo.categories.*').isMongoId().withMessage('Select valid categories'),
    body('appliesTo.products').optional({ values: 'null' }).isArray().withMessage('Select valid products'),
    body('appliesTo.products.*').isMongoId().withMessage('Select valid products'),
    body('expiresAt').optional().isISO8601().withMessage('A valid expiry date is required'),
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
    // Each mode is asked only for the "where" it cannot be attended without: a
    // link for a call nobody can join otherwise, an address for a room nobody
    // can find. A phone round needs neither — the number applied with is on file.
    body('interview.meetingLink')
      .if(body('status').equals('interviewed'))
      .if(body('interview.mode').equals('online'))
      .trim()
      .notEmpty()
      .withMessage('Add the meeting link for an online interview')
      .bail()
      .isURL({ require_protocol: true })
      .withMessage('The meeting link must be a full URL, starting with https://'),
    body('interview.location')
      .if(body('status').equals('interviewed'))
      .if(body('interview.mode').equals('in-person'))
      .trim()
      .notEmpty()
      .withMessage('Add where the candidate should come for an in-person interview'),

    body('interview.location').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
      .withMessage('The venue cannot be longer than 200 characters'),
    body('interview.interviewer').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 80 })
      .withMessage("Enter the interviewer's name, up to 80 characters"),
    // The same 10 digit number every other phone field on the platform takes, so
    // what the invitation prints is a number the applicant can actually dial.
    body('interview.contactPhone').optional({ values: 'falsy' }).trim()
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Enter a valid 10 digit mobile number'),
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

  /**
   * The admin status control, which covers exactly two states.
   *
   * `deactivated` and `reactivation-pending` are deliberately not accepted here
   * even as values to *set*: an account the owner closed comes back through an
   * approved reactivation request and no other way, and staff close an account by
   * blocking it. The controller refuses the reverse direction — a request that
   * tries to move a deactivated account with this route — for the same reason.
   */
  userStatusRules: [
    body('status').isIn(['active', 'blocked']).withMessage('Invalid status'),
    // Only a block carries a reason — reactivating clears it, so nothing is required there.
    body('blockedReason')
      .if(body('status').equals('blocked'))
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Enter the reason for blocking (at least 3 characters)'),
  ],
  userRoleRules: [body('role').isIn(['user', 'admin']).withMessage('Invalid role')],
};
