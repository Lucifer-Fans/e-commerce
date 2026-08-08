const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const env = require('../config/env');
const { JobPosition, JobApplication, Setting } = require('../models');
const { EXPERIENCE_LEVELS } = require('../models/JobApplication');
const { uploadRawBuffer, destroyAsset, privateDownloadUrl } = require('../config/cloudinary');
const { sendApplicationAckEmail, sendApplicationStatusEmail } = require('../services/mail.service');
const broadcast = require('../realtime/broadcast');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A résumé is personal data, so its Cloudinary URL never leaves the server — the
 * panel is handed a filename and a `hasFile` flag and fetches the bytes through
 * GET /careers/applications/:id/resume, which is admin-guarded.
 */
const publicResume = (resume) =>
  resume?.publicId
    ? {
        fileName: resume.fileName || '',
        bytes: resume.bytes,
        format: resume.format,
        hasFile: true,
      }
    : { hasFile: false };

/* ------------------------------------------------------------------ *
 * Careers page configuration
 * ------------------------------------------------------------------ */

/**
 * GET /careers/config — public.
 * One request gives the storefront everything its form needs: the open roles for the
 * position dropdown, the experience options, and the HR contact card.
 */
exports.getCareerConfig = asyncHandler(async (_req, res) => {
  const [positions, settings] = await Promise.all([
    JobPosition.find({ isActive: true }).sort({ displayOrder: 1, title: 1 }).lean(),
    Setting.getSingleton(),
  ]);

  return sendSuccess(res, {
    message: 'Careers configuration fetched',
    data: {
      positions,
      experienceLevels: EXPERIENCE_LEVELS,
      hr: {
        email: settings.careers?.hrEmail || '',
        phone: settings.careers?.hrPhone || '',
      },
    },
  });
});

/** PATCH /careers/config (admin) — the "Contact HR" card on the careers page. */
exports.updateCareerConfig = asyncHandler(async (req, res) => {
  const settings = await Setting.getSingleton();

  // Both fields are optional and a blank string is a valid "clear this".
  if (req.body.hrEmail !== undefined) settings.careers.hrEmail = String(req.body.hrEmail).trim();
  if (req.body.hrPhone !== undefined) settings.careers.hrPhone = String(req.body.hrPhone).trim();

  settings.updatedBy = req.user._id;
  await settings.save();

  broadcast.careerPositionChanged('hr-updated', null);

  return sendSuccess(res, {
    message: 'HR contact details saved',
    data: { hr: { email: settings.careers.hrEmail, phone: settings.careers.hrPhone } },
  });
});

/* ------------------------------------------------------------------ *
 * Positions (admin-managed)
 * ------------------------------------------------------------------ */

/** GET /careers/positions (admin) — includes closed roles so they can be reopened. */
exports.listPositions = asyncHandler(async (_req, res) => {
  const positions = await JobPosition.find().sort({ displayOrder: 1, title: 1 }).lean();
  return sendSuccess(res, { message: 'Positions fetched', data: { positions } });
});

/** POST /careers/positions (admin) */
exports.createPosition = asyncHandler(async (req, res) => {
  const position = await JobPosition.create(req.body);
  broadcast.careerPositionChanged('created', position);

  return sendSuccess(res, { statusCode: 201, message: 'Position added', data: { position } });
});

/** PATCH /careers/positions/:id (admin) */
exports.updatePosition = asyncHandler(async (req, res) => {
  const position = await JobPosition.findById(req.params.id);
  if (!position) throw ApiError.notFound('Position not found');

  Object.assign(position, req.body);
  await position.save();

  broadcast.careerPositionChanged('updated', position);

  return sendSuccess(res, { message: 'Position updated', data: { position } });
});

/**
 * DELETE /careers/positions/:id (admin)
 * Applications keep their position as text, so removing a role never breaks history.
 */
exports.deletePosition = asyncHandler(async (req, res) => {
  const position = await JobPosition.findById(req.params.id);
  if (!position) throw ApiError.notFound('Position not found');

  await position.deleteOne();
  broadcast.careerPositionChanged('deleted', position);

  return sendSuccess(res, { message: 'Position removed' });
});

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

/**
 * POST /careers/applications — public, multipart/form-data with a `resume` file.
 *
 * The résumé goes to Cloudinary as a raw asset before the document is written, so a
 * saved application always has a downloadable file attached to it.
 */
exports.createApplication = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach your résumé (PDF, DOC or DOCX)');

  if (!env.cloudinaryEnabled) {
    throw ApiError.serviceUnavailable(
      'Résumé uploads are not configured. Please email your application to us instead.'
    );
  }

  // The dropdown is admin-driven, so only a currently open role is accepted.
  const position = await JobPosition.findOne({
    title: new RegExp(`^${escapeRegex(req.body.position)}$`, 'i'),
    isActive: true,
  });
  if (!position) throw ApiError.badRequest('This position is no longer open for applications');

  const resume = await uploadRawBuffer(req.file.buffer, {
    folder: `${env.cloudinary.folder}/resumes`,
    fileName: req.file.originalname,
  });

  const application = await JobApplication.create({
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    position: position.title,
    positionRef: position._id,
    experience: req.body.experience,
    location: req.body.location || '',
    coverLetter: req.body.coverLetter || '',
    resume: { ...resume, fileName: req.file.originalname },
  });

  broadcast.jobApplicationCreated(application);

  sendApplicationAckEmail({
    to: application.email,
    name: application.name,
    position: application.position,
    // Admin-managed and optional — the acknowledgement drops the row when blank.
    department: position.department,
    appliedAt: application.createdAt,
  }).catch(() => {});

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Your application has been successfully submitted. We will get back to you soon.',
    data: { submitted: true },
  });
});

/** GET /careers/applications (admin) — status / position / experience filters. */
exports.listApplications = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.position && req.query.position !== 'all') filter.position = req.query.position;
  if (req.query.experience && req.query.experience !== 'all') filter.experience = req.query.experience;

  if (req.query.search?.trim()) {
    const pattern = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }

  const sort = req.query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

  const [applications, total] = await Promise.all([
    JobApplication.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobApplication.countDocuments(filter),
  ]);

  const rows = applications.map((application) => ({
    ...application,
    resume: publicResume(application.resume),
  }));

  return sendSuccess(res, {
    message: 'Applications fetched',
    data: { applications: rows },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** GET /careers/applications/:id (admin) — opening the profile marks it reviewed. */
exports.getApplication = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id);
  if (!application) throw ApiError.notFound('Application not found');

  if (!application.isRead) {
    application.isRead = true;
    await application.save();
    broadcast.jobApplicationChanged('read', application);
  }

  const payload = application.toJSON();
  payload.resume = publicResume(payload.resume);

  return sendSuccess(res, { message: 'Application fetched', data: { application: payload } });
});

/**
 * GET /careers/applications/:id/resume?disposition=inline|attachment (admin)
 *
 * Streams the stored résumé through the API rather than redirecting: the signed
 * Cloudinary link is short-lived and must never reach the browser, and proxying is
 * what lets the panel preview a PDF inline as well as download it.
 */
exports.streamResume = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id).select('resume name');
  if (!application) throw ApiError.notFound('Application not found');

  const { publicId, fileName, format } = application.resume || {};
  if (!publicId) throw ApiError.notFound('No résumé is attached to this application');

  const signedUrl = privateDownloadUrl(publicId);
  if (!signedUrl) {
    throw ApiError.serviceUnavailable('Résumé storage is not configured on this server');
  }

  const upstream = await fetch(signedUrl);
  if (!upstream.ok) {
    throw ApiError.serviceUnavailable('The stored résumé could not be retrieved right now');
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  // Quotes and non-ASCII in an applicant's filename would otherwise break the header.
  const safeName = (fileName || `${application.name}-resume.${format || 'pdf'}`).replace(
    /[^\w.\- ]+/g,
    '_'
  );

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);

  return res.end(Buffer.from(await upstream.arrayBuffer()));
});

/**
 * PATCH /careers/applications/:id/status (admin)
 *
 * Moving an application along tells the applicant, who otherwise only ever
 * hears the acknowledgement. `new` is excluded — it is the state the record was
 * created in, and the acknowledgement has already said what that mail would —
 * and so is a re-save of the status already stored, so an admin correcting a
 * note does not send the same decision twice.
 */
exports.updateApplicationStatus = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id);
  if (!application) throw ApiError.notFound('Application not found');

  // A move to `interviewed` always arrives from the scheduling dialog, which
  // cannot be submitted without a slot. Re-sending it on the status the record
  // already holds is therefore a *reschedule*, and the one case where the same
  // status twice is worth a second mail — the candidate is being told a new
  // time, not the same decision again.
  const scheduling = req.body.status === 'interviewed' && Boolean(req.body.interview);
  const notify =
    scheduling || (req.body.status !== 'new' && req.body.status !== application.status);

  application.status = req.body.status;
  if (req.body.notes !== undefined) application.notes = req.body.notes;
  if (scheduling) {
    const { scheduledAt, mode, location, meetingLink, interviewer, contactPhone, durationMins,
      instructions } = req.body.interview;

    application.interview = {
      scheduledAt,
      mode,
      // Only the field the mode actually uses is kept. Carrying both means a
      // round switched from online to in-person still holds a dead meeting link,
      // which the mail would then have to decide whether to print.
      location: mode === 'online' ? '' : location || '',
      meetingLink: mode === 'online' ? meetingLink : '',
      interviewer: interviewer || '',
      contactPhone: contactPhone || '',
      durationMins: durationMins || undefined,
      instructions: instructions || '',
      // Stamped only once the mail is actually away, below.
      sentAt: undefined,
    };
  }
  application.isRead = true;
  application.reviewedBy = req.user._id;
  await application.save();

  broadcast.jobApplicationChanged('status', application);

  if (notify) {
    // Fire and forget, as the acknowledgement is: a mail outage must not fail
    // the status change the admin has already seen applied in the table.
    (async () => {
      const [position, settings] = await Promise.all([
        // The department is admin-managed on the role, not copied onto the
        // application — a role deleted since is simply a mail without the row.
        application.positionRef ? JobPosition.findById(application.positionRef).lean() : null,
        Setting.getSingleton(),
      ]);

      const sent = await sendApplicationStatusEmail({
        to: application.email,
        name: application.name,
        position: application.position,
        department: position?.department || '',
        appliedAt: application.createdAt,
        status: application.status,
        // Only the interview mail reads this; every other status ignores it.
        interview: application.interview?.scheduledAt ? application.interview.toObject() : null,
        hrEmail: settings.careers?.hrEmail || '',
      });

      // "Told at", not "written at" — the panel shows this so HR can tell an
      // invitation that went out from one that silently failed to.
      if (sent && scheduling) {
        await JobApplication.updateOne(
          { _id: application._id },
          { $set: { 'interview.sentAt': new Date() } }
        );
      }
    })().catch(() => {});
  }

  return sendSuccess(res, {
    message: notify
      ? scheduling
        ? 'Interview scheduled and the invitation has been emailed to the applicant'
        : 'Application status updated and the applicant has been notified'
      : 'Application status updated',
    data: { application, notified: notify },
  });
});

/** DELETE /careers/applications/:id (admin) — also releases the stored résumé. */
exports.deleteApplication = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id);
  if (!application) throw ApiError.notFound('Application not found');

  await destroyAsset(application.resume?.publicId, { resourceType: 'raw' });
  await application.deleteOne();

  broadcast.jobApplicationChanged('deleted', application);

  return sendSuccess(res, { message: 'Application deleted' });
});
