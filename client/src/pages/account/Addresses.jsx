import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addressApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { EVENTS } from '../../realtime/events';
import Icon from '../../components/common/Icon';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import { ListRowSkeleton } from '../../components/common/Skeleton';
import AddressForm from '../../components/checkout/AddressForm';

export default function Addresses() {
  // `checkout` comes along for the address vocabulary shared with AddressForm.
  const { t } = useTranslation(['account', 'checkout', 'common']);
  const { data, loading, refetch } = useFetch(useCallback(() => addressApi.list(), []), []);
  const addresses = data?.data?.addresses || [];

  // Keeps the book identical across the shopper's open tabs.
  useLiveRefetch(refetch, EVENTS.ADDRESS_CHANGED);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const remove = async () => {
    try {
      await addressApi.remove(deleting._id);
      toast.success(t('addresses.deleted'));
      refetch();
    } catch (err) {
      toast.error(err.message || t('addresses.deleteFailed'));
    }
  };

  // The default address stays put until another one takes its place, so say why
  // rather than opening a confirm dialog the server would only reject.
  const askToDelete = (address) => {
    if (address.isDefault) {
      toast.error(t('addresses.deleteDefaultHint'));
      return;
    }
    setDeleting(address);
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-900">{t('addresses.title')}</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="btn-primary"
        >
          <Icon name="plus" size={16} />
          {t('addresses.add')}
        </button>
      </div>

      {loading ? (
        <ListRowSkeleton rows={2} />
      ) : !addresses.length ? (
        <EmptyState
          icon="location"
          title={t('addresses.emptyTitle')}
          message={t('addresses.emptyMessage')}
          actionLabel={t('addresses.addFirst')}
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <article key={address._id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="badge bg-ink-100 text-ink-600 ring-ink-200">
                  {t(`checkout:address.labels.${address.label}`, address.label)}
                </span>
                {address.isDefault && (
                  <span className="badge bg-emerald-50 text-success ring-emerald-200">
                    {t('checkout:address.default')}
                  </span>
                )}
              </div>

              <p className="text-sm font-bold text-ink-900">{address.fullName}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                {address.addressLine1}
                {address.addressLine2 && `, ${address.addressLine2}`}
                {address.landmark && `, ${address.landmark}`}
                <br />
                {address.city}, {address.state} — {address.pincode}
              </p>
              <p className="mt-1.5 text-sm text-ink-500">
                {t('checkout:address.phoneLine', { phone: address.phone })}
              </p>

              <div className="mt-3 flex flex-wrap gap-3 border-t border-ink-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(address);
                    setFormOpen(true);
                  }}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  {t('common:actions.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => askToDelete(address)}
                  className="text-xs font-semibold text-ink-500 hover:text-danger"
                >
                  {t('common:actions.delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t(editing ? 'checkout:address.editTitle' : 'checkout:address.addTitle')}
        size="lg"
      >
        <AddressForm
          address={editing}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            refetch();
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={t('addresses.deleteTitle')}
        message={t('addresses.deleteMessage', {
          name: `${deleting?.fullName}, ${deleting?.city}`,
        })}
        confirmLabel={t('common:actions.delete')}
      />
    </div>
  );
}
