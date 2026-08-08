import { useCallback, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

import { couponApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import { formatPrice, formatDate } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';

const inThirtyDays = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

const EMPTY = {
  code: '', description: '', discountType: 'percentage', discountValue: 10,
  maxDiscountAmount: '', minOrderAmount: 0, usageLimit: '', perUserLimit: 1,
  expiresAt: inThirtyDays(), isActive: true,
};

function CouponDialog({ initial, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState(
    initial
      ? { ...initial, expiresAt: new Date(initial.expiresAt).toISOString().slice(0, 10) }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const found = {};
    if (values.code.trim().length < 3) found.code = 'Code must be at least 3 characters';
    const amount = Number(values.discountValue);
    if (!amount || amount <= 0) found.discountValue = 'Enter a discount value';
    if (values.discountType === 'percentage' && amount > 90) {
      found.discountValue = 'Percentage discount cannot exceed 90%';
    }
    if (!values.expiresAt) found.expiresAt = 'Choose an expiry date';
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const payload = {
        code: values.code.trim().toUpperCase(),
        description: values.description?.trim() || undefined,
        discountType: values.discountType,
        discountValue: amount,
        // Empty string means "no cap" / "unlimited", not zero.
        maxDiscountAmount: values.maxDiscountAmount === '' ? null : Number(values.maxDiscountAmount),
        minOrderAmount: Number(values.minOrderAmount) || 0,
        usageLimit: values.usageLimit === '' ? null : Number(values.usageLimit),
        perUserLimit: Number(values.perUserLimit) || 1,
        expiresAt: new Date(`${values.expiresAt}T23:59:59`).toISOString(),
        isActive: values.isActive,
      };

      if (values._id) await couponApi.update(values._id, payload);
      else await couponApi.create(payload);

      enqueueSnackbar(values._id ? 'Coupon updated' : 'Coupon created', { variant: 'success' });
      onSaved();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the coupon', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isPercentage = values.discountType === 'percentage';

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{values._id ? 'Edit coupon' : 'New coupon'}</DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              label="Coupon code"
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
              error={Boolean(errors.code)}
              helperText={errors.code || 'Customers type this at checkout'}
              inputProps={{ maxLength: 24 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select fullWidth label="Discount type" value={values.discountType} onChange={set('discountType')}>
              <MenuItem value="percentage">Percentage off</MenuItem>
              <MenuItem value="flat">Flat amount off</MenuItem>
            </TextField>
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Description"
              value={values.description || ''}
              onChange={set('description')}
              helperText="Shown in the storefront's available-coupons list"
              inputProps={{ maxLength: 200 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              type="number"
              label={isPercentage ? 'Discount percentage' : 'Discount amount'}
              value={values.discountValue}
              onChange={set('discountValue')}
              error={Boolean(errors.discountValue)}
              helperText={errors.discountValue}
              InputProps={
                isPercentage
                  ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                  : { startAdornment: <InputAdornment position="start">₹</InputAdornment> }
              }
              inputProps={{ min: 0 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Maximum discount cap"
              value={values.maxDiscountAmount ?? ''}
              onChange={set('maxDiscountAmount')}
              disabled={!isPercentage}
              helperText={isPercentage ? 'Leave blank for no cap' : 'Only applies to percentage coupons'}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              inputProps={{ min: 0 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Minimum order value"
              value={values.minOrderAmount}
              onChange={set('minOrderAmount')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              inputProps={{ min: 0 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              required
              label="Expires on"
              value={values.expiresAt}
              onChange={set('expiresAt')}
              error={Boolean(errors.expiresAt)}
              helperText={errors.expiresAt}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Total usage limit"
              value={values.usageLimit ?? ''}
              onChange={set('usageLimit')}
              helperText="Leave blank for unlimited"
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Uses per customer"
              value={values.perUserLimit}
              onChange={set('perUserLimit')}
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid size={12}>
            <FormControlLabel
              control={<Switch checked={values.isActive} onChange={set('isActive')} />}
              label={<Typography variant="body2">Coupon is active</Typography>}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={15} color="inherit" /> : null}
        >
          Save coupon
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Coupons() {
  const { enqueueSnackbar } = useSnackbar();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useFetch(
    useCallback(() => couponApi.list({ page, limit }), [page, limit]),
    [page, limit]
  );

  // Redemption counts climb as shoppers use the codes.
  useLiveRefetch(query.refetch, EVENTS.COUPON_CHANGED);

  const coupons = query.data?.data?.coupons || [];
  const meta = query.data?.meta;

  const remove = async () => {
    try {
      await couponApi.remove(deleting._id);
      enqueueSnackbar('Coupon deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the coupon', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'code',
      label: 'Code',
      minWidth: 160,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={800} letterSpacing={0.5}>
            {row.code}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.description || '—'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'discount',
      label: 'Discount',
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={700}>
            {row.discountType === 'percentage' ? `${row.discountValue}%` : formatPrice(row.discountValue)}
          </Typography>
          {row.maxDiscountAmount != null && (
            <Typography variant="caption" color="text.secondary">
              max {formatPrice(row.maxDiscountAmount)}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'minOrderAmount',
      label: 'Min. order',
      align: 'right',
      render: (row) => (
        <Typography variant="body2">
          {row.minOrderAmount ? formatPrice(row.minOrderAmount) : '—'}
        </Typography>
      ),
    },
    {
      key: 'usage',
      label: 'Used',
      align: 'center',
      render: (row) => (
        <Typography variant="body2">
          {row.usedCount}
          {row.usageLimit != null ? ` / ${row.usageLimit}` : ' / ∞'}
        </Typography>
      ),
    },
    {
      key: 'expiresAt',
      label: 'Expires',
      minWidth: 120,
      render: (row) => {
        const expired = new Date(row.expiresAt) < new Date();
        return (
          <Typography variant="body2" color={expired ? 'error.main' : 'text.primary'}>
            {formatDate(row.expiresAt)}
          </Typography>
        );
      },
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      render: (row) => {
        const expired = new Date(row.expiresAt) < new Date();
        return (
          <Chip
            label={expired ? 'Expired' : row.isActive ? 'Active' : 'Inactive'}
            size="small"
            color={expired ? 'error' : row.isActive ? 'success' : 'default'}
          />
        );
      },
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 100,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <IconButton size="small" color="primary" onClick={() => setDialog(row)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Coupons"
        subtitle={`${meta?.total ?? 0} coupon(s) configured`}
        breadcrumbs={[{ label: 'Coupons' }]}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
            Create Coupon
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={coupons}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        emptyTitle="No coupons yet"
        emptyMessage="Create a coupon to run a promotion on the storefront."
        emptyAction={{ label: 'Create Coupon', onClick: () => setDialog({}) }}
      />

      {dialog && (
        <CouponDialog
          initial={dialog._id ? dialog : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            query.refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this coupon?"
        message={`"${deleting?.code}" will stop working immediately. Orders that already used it are unaffected.`}
        confirmLabel="Delete"
      />
    </Box>
  );
}
