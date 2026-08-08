import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { productApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { REVIEW_EVENTS } from '../../realtime/events';
import { formatNumber, timeAgo } from '../../utils/format';
import Rating from '../common/Rating';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import Pagination from '../common/Pagination';
import EmptyState from '../common/EmptyState';
import { ListRowSkeleton } from '../common/Skeleton';

function RatingSummary({ summary }) {
  const { t } = useTranslation('shop');
  const total = summary?.count || 0;

  return (
    <div className="grid gap-6 rounded-xl bg-ink-50 p-5 sm:grid-cols-[auto_1fr] sm:gap-10">
      <div className="text-center sm:border-r sm:border-ink-200 sm:pr-10">
        <p className="text-4xl font-extrabold text-ink-900">
          {(summary?.average || 0).toFixed(1)}
        </p>
        <Rating value={summary?.average || 0} size={16} showValue={false} className="justify-center py-1.5" />
        <p className="text-xs text-ink-500">
          {t('reviews.ratingsCount', { count: total, formatted: formatNumber(total) })}
        </p>
      </div>

      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary?.breakdown?.[star] || 0;
          const percent = total ? (count / total) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-3">
              <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs font-medium text-ink-600">
                {star}
                <Icon name="star" size={11} filled className="text-amber-400" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-ink-500">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WriteReviewModal({ open, onClose, productId, onSubmitted }) {
  const { t } = useTranslation(['shop', 'common']);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return toast.error(t('reviews.pickRating'));

    setSubmitting(true);
    try {
      await productApi.createReview(productId, { rating, title, comment });
      toast.success(t('reviews.thanks'));
      setRating(0);
      setTitle('');
      setComment('');
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err.message || t('reviews.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('reviews.writeTitle')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="label">{t('reviews.yourRating')}</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                aria-label={t('reviews.starCount', { count: star })}
                className={`transition hover:scale-110 ${
                  star <= rating ? 'text-amber-400' : 'text-ink-300'
                }`}
              >
                <Icon name="star" size={30} filled />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="review-title" className="label">
            {t('reviews.titleLabel')}{' '}
            <span className="font-normal text-ink-400">{t('reviews.optional')}</span>
          </label>
          <input
            id="review-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('reviews.titlePlaceholder')}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="review-comment" className="label">
            {t('reviews.commentLabel')}{' '}
            <span className="font-normal text-ink-400">{t('reviews.optional')}</span>
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t('reviews.commentPlaceholder')}
            className="input resize-none"
          />
          <p className="mt-1 text-right text-xs text-ink-400">{comment.length}/2000</p>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-outline">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting && <Spinner size={14} />}
            {t('reviews.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProductReviews({ product }) {
  const { t } = useTranslation('shop');
  const navigate = useNavigate();
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [ratingFilter, setRatingFilter] = useState('');
  const [writeOpen, setWriteOpen] = useState(false);

  const { data, loading, refetch } = useFetch(
    useCallback(
      () => productApi.reviews(product._id, { page, sort, limit: 5, rating: ratingFilter || undefined }),
      [product._id, page, sort, ratingFilter]
    ),
    [product._id, page, sort, ratingFilter]
  );

  // Another shopper's review shows up without a reload.
  useLiveRefetch(refetch, REVIEW_EVENTS, {
    filter: (payload) => payload?.productId === product._id,
  });

  const reviews = data?.data?.reviews || [];
  const summary = data?.data?.summary || product.ratings;
  const meta = data?.meta;

  const openWrite = () => {
    if (!isAuthenticated) {
      toast(t('reviews.loginToReview'), { icon: '🔒' });
      return navigate('/login', { state: { from: `/product/${product.slug}` } });
    }
    setWriteOpen(true);
  };

  return (
    <div>
      <RatingSummary summary={summary} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="input !w-auto !py-2 text-sm"
            aria-label={t('reviews.sortAria')}
          >
            <option value="newest">{t('reviews.sort.newest')}</option>
            <option value="helpful">{t('reviews.sort.helpful')}</option>
            <option value="highest">{t('reviews.sort.highest')}</option>
            <option value="lowest">{t('reviews.sort.lowest')}</option>
          </select>

          <select
            value={ratingFilter}
            onChange={(e) => {
              setRatingFilter(e.target.value);
              setPage(1);
            }}
            className="input !w-auto !py-2 text-sm"
            aria-label={t('reviews.filterAria')}
          >
            <option value="">{t('reviews.allRatings')}</option>
            {[5, 4, 3, 2, 1].map((star) => (
              <option key={star} value={star}>
                {t('reviews.starCount', { count: star })}
              </option>
            ))}
          </select>
        </div>

        <button type="button" onClick={openWrite} className="btn-outline">
          {t('reviews.writeTitle')}
        </button>
      </div>

      <div className="mt-5">
        {loading ? (
          <ListRowSkeleton rows={3} />
        ) : !reviews.length ? (
          <EmptyState
            icon="star"
            title={t('reviews.emptyTitle')}
            message={t('reviews.emptyMessage')}
            actionLabel={t('reviews.writeTitle')}
            onAction={openWrite}
          />
        ) : (
          <div className="divide-y divide-ink-100">
            {reviews.map((review) => (
              <article key={review._id} className="py-5">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                    {review.user?.name?.charAt(0).toUpperCase() || '?'}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-800">
                      {review.user?.name || t('reviews.anonymous')}
                    </p>
                    <p className="text-xs text-ink-400">{timeAgo(review.createdAt)}</p>
                  </div>
                  {review.isVerifiedPurchase && (
                    <span className="badge bg-emerald-50 text-success ring-emerald-200">
                      <Icon name="check" size={11} className="mr-1" />
                      {t('reviews.verified')}
                    </span>
                  )}
                </div>

                <Rating value={review.rating} size={13} showValue={false} className="mb-1.5" />
                {review.title && <h4 className="mb-1 text-sm font-bold text-ink-900">{review.title}</h4>}
                {review.comment && (
                  <p className="text-sm leading-relaxed text-ink-600">{review.comment}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {meta?.totalPages > 1 && (
        <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} className="mt-6" />
      )}

      <WriteReviewModal
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        productId={product._id}
        onSubmitted={refetch}
      />
    </div>
  );
}
