import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Autocomplete from '@mui/material/Autocomplete';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';

import { couponApi, categoryApi, productApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useDebounce from '../hooks/useDebounce';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import { formatPrice, formatDate } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';

/**
 * The expiry field is an admin's own calendar day, so it is built from local
 * parts: toISOString would hand an IST evening back as yesterday, and today
 * would then read as a past date.
 */
const asDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const today = () => asDay(new Date());

/**
 * Blank is how this screen says "unlimited"/"no cap", and the API stores it as
 * null. A 0 means the same thing to older coupons, so both come back to the form
 * as an empty field and go back out as null — never as a limit of zero, which is
 * what once capped a flat ₹500 coupon at ₹0 and marked a coupon "used 3 / 0".
 */
const UNLIMITED = '∞';
const toField = (value) => (value == null || Number(value) <= 0 ? '' : String(value));
const toLimit = (value) => (value === '' || Number(value) <= 0 ? null : Number(value));
const limitLabel = (value) => (value == null || Number(value) <= 0 ? UNLIMITED : String(value));

const EMPTY = {
  code: '', description: '', discountType: 'percentage', discountValue: 10,
  maxDiscountAmount: '', minOrderAmount: 0, usageLimit: '', perUserLimit: 1,
  // A new coupon starts at today — the earliest the picker allows — so the
  // admin sets a run length deliberately rather than inheriting one.
  expiresAt: today(), isActive: true,
  // Both lists empty is the default and the common case: the coupon comes off
  // the whole cart. Naming anything here pins it to those goods alone.
  appliesTo: { categories: [], products: [] },
};

/** The coupon's scope, as the objects the pickers render. */
const toScope = (appliesTo) => ({
  categories: appliesTo?.categories || [],
  products: appliesTo?.products || [],
});

const scopeNames = (row) => [
  ...(row.appliesTo?.categories || []).map((c) => c.name).filter(Boolean),
  ...(row.appliesTo?.products || []).map((p) => p.name).filter(Boolean),
];

/**
 * The product picker searches the catalogue rather than listing it — a store
 * with thousands of SKUs cannot be poured into a dropdown. Products already on
 * the coupon are merged into the options so an edit shows their names before
 * any search has run.
 */
function useProductSearch(selected) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const search = useDebounce(input, 400);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    productApi
      .list({ search: search || undefined, limit: 20, sort: 'newest' })
      .then((res) => alive && setResults(res.data?.products || []))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [search]);

  const options = useMemo(() => {
    const ids = new Set(results.map((p) => p._id));
    return [...selected.filter((p) => !ids.has(p._id)), ...results];
  }, [results, selected]);

  return { options, loading, setInput };
}

function CouponDialog({ initial, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState(
    initial
      ? {
          ...initial,
          appliesTo: toScope(initial.appliesTo),
          expiresAt: asDay(new Date(initial.expiresAt)),
          maxDiscountAmount: toField(initial.maxDiscountAmount),
          usageLimit: toField(initial.usageLimit),
          perUserLimit: toField(initial.perUserLimit),
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const isPercentage = values.discountType === 'percentage';

  const categoriesQuery = useFetch(useCallback(() => categoryApi.list(), []), []);
  const categories = categoriesQuery.data?.data?.categories || [];
  const products = useProductSearch(values.appliesTo.products);

  const setScope = (field) => (_event, next) =>
    setValues((v) => ({ ...v, appliesTo: { ...v.appliesTo, [field]: next } }));

  const submit = async () => {
    const found = {};
    const code = values.code.trim();
    if (!code) found.code = 'Enter coupon code';
    else if (code.length < 3) found.code = 'Code must be at least 3 characters';
    const amount = Number(values.discountValue);
    if (!amount || amount <= 0) found.discountValue = 'Enter a discount value';
    if (values.discountType === 'percentage' && amount > 90) {
      found.discountValue = 'Percentage discount cannot exceed 90%';
    }
    // A coupon that expires before it is saved can never be redeemed, so the
    // picker's min is backed by a check here — typed input and edits of an
    // already expired coupon both reach this path.
    if (!values.expiresAt) found.expiresAt = 'Choose an expiry date';
    else if (values.expiresAt < today()) found.expiresAt = 'Expiry date cannot be in the past';
    // The two limits are independent: a coupon can allow 2 redemptions in total
    // while allowing one customer 3, and neither is derived from the other.
    if (values.usageLimit !== '' && Number(values.usageLimit) < 1) {
      found.usageLimit = 'Enter 1 or more, or leave blank for unlimited';
    }
    if (values.perUserLimit !== '' && Number(values.perUserLimit) < 1) {
      found.perUserLimit = 'Enter 1 or more, or leave blank for unlimited';
    }
    if (Object.keys(found).length) {
      setErrors(found);
      enqueueSnackbar('Please fill the required fields first', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: values.code.trim().toUpperCase(),
        description: values.description?.trim() || undefined,
        discountType: values.discountType,
        discountValue: amount,
        // Blank means "no cap" / "unlimited", never zero — and a cap is only ever
        // a percentage-coupon device, so a flat coupon never carries one.
        maxDiscountAmount: isPercentage ? toLimit(values.maxDiscountAmount) : null,
        minOrderAmount: Number(values.minOrderAmount) || 0,
        usageLimit: toLimit(values.usageLimit),
        perUserLimit: toLimit(values.perUserLimit),
        expiresAt: new Date(`${values.expiresAt}T23:59:59`).toISOString(),
        isActive: values.isActive,
        // Ids only — the API stores references and hands the names back populated.
        appliesTo: {
          categories: values.appliesTo.categories.map((c) => c._id),
          products: values.appliesTo.products.map((p) => p._id),
        },
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

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        {values._id ? 'Edit coupon' : 'New coupon'}
        <IconButton
          onClick={onClose}
          size="small"
          disabled={saving}
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          aria-label="Close without saving"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

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
              value={isPercentage ? values.maxDiscountAmount : ''}
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
              inputProps={{ min: today() }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Total usage limit"
              value={values.usageLimit}
              onChange={set('usageLimit')}
              error={Boolean(errors.usageLimit)}
              helperText={errors.usageLimit || 'Successful orders across all customers — blank for unlimited'}
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
              error={Boolean(errors.perUserLimit)}
              helperText={errors.perUserLimit || 'Successful orders by one customer — blank for unlimited'}
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid size={12}>
            <Divider textAlign="left">
              <Typography variant="caption" color="text.secondary">
                Where this coupon applies
              </Typography>
            </Divider>
          </Grid>

          <Grid size={12}>
            <Autocomplete
              multiple
              options={categories}
              value={values.appliesTo.categories}
              onChange={setScope('categories')}
              loading={categoriesQuery.loading}
              getOptionLabel={(option) => option.name || ''}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderTags={(tags, getTagProps) =>
                tags.map((option, index) => (
                  <Chip
                    variant="outlined"
                    size="small"
                    label={option.name}
                    {...getTagProps({ index })}
                    key={option._id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Categories"
                  placeholder={values.appliesTo.categories.length ? '' : 'Any category'}
                  helperText="Leave both fields empty and the coupon comes off the whole cart"
                />
              )}
            />
          </Grid>

          <Grid size={12}>
            <Autocomplete
              multiple
              options={products.options}
              value={values.appliesTo.products}
              onChange={setScope('products')}
              loading={products.loading}
              // The catalogue is searched server-side; filtering again here would
              // hide results the API already decided were matches.
              filterOptions={(option) => option}
              onInputChange={(_event, next, reason) => reason === 'input' && products.setInput(next)}
              getOptionLabel={(option) => option.name || ''}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderTags={(tags, getTagProps) =>
                tags.map((option, index) => (
                  <Chip
                    variant="outlined"
                    size="small"
                    label={option.name}
                    {...getTagProps({ index })}
                    key={option._id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Products"
                  placeholder={values.appliesTo.products.length ? '' : 'Any product'}
                  helperText="Type to search. A named product counts whatever category it sits in"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {products.loading ? <CircularProgress size={15} color="inherit" /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
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

  /*
   * Switching a promotion off is the one edit that is urgent — a code being abused at
   * checkout should not need a dialog and a Save. The status chip toggles it in place,
   * the way the product table's chip toggles published/draft.
   */
  const toggleActive = async (coupon) => {
    const next = !coupon.isActive;
    try {
      await couponApi.update(coupon._id, { isActive: next });
      enqueueSnackbar(next ? 'Coupon activated' : 'Coupon deactivated', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the coupon', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'code',
      label: 'Code',
      width: '30%',
      minWidth: 220,
      render: (row) => {
        const scope = scopeNames(row);
        return (
          <Box>
            <Typography variant="body2" fontWeight={800} letterSpacing={0.5}>
              {row.code}
            </Typography>
            {/* `display: block` — caption renders a span, and the scope chip below was
                flowing onto the end of this line rather than starting its own. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {row.description || '—'}
            </Typography>

            {/* A coupon pinned to part of the catalogue must say so here — the discount
                column alone reads as if it came off everything. This is the widest column
                in the table, so the name gets the room to be recognisable; the tooltip
                carries the full list when there is more than one. */}
            {scope.length > 0 && (
              <Tooltip title={scope.join(', ')}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={scope.length > 1 ? `Only ${scope[0]} +${scope.length - 1}` : `Only ${scope[0]}`}
                  sx={{ mt: 0.75, height: 20, fontSize: 11, maxWidth: '100%' }}
                />
              </Tooltip>
            )}
          </Box>
        );
      },
    },
    {
      key: 'discount',
      label: 'Discount',
      align: 'right',
      width: 120,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={700} noWrap>
            {row.discountType === 'percentage' ? `${row.discountValue}%` : formatPrice(row.discountValue)}
          </Typography>
          {row.discountType === 'percentage' && row.maxDiscountAmount > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
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
      width: 120,
      render: (row) => (
        <Typography variant="body2" noWrap>
          {row.minOrderAmount ? formatPrice(row.minOrderAmount) : '—'}
        </Typography>
      ),
    },
    {
      key: 'usage',
      label: 'Used',
      align: 'center',
      width: 120,
      render: (row) => (
        <Box>
          {/* Successful redemptions across every customer, against the global limit. */}
          <Typography variant="body2" noWrap>
            {row.usedCount || 0} / {limitLabel(row.usageLimit)}
          </Typography>
          {/* Tracked separately — one customer's allowance, not a share of the above. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
            {limitLabel(row.perUserLimit)} per customer
          </Typography>
        </Box>
      ),
    },
    {
      key: 'expiresAt',
      label: 'Expires',
      align: 'center',
      width: 120,
      render: (row) => {
        const expired = new Date(row.expiresAt) < new Date();
        return (
          <Typography variant="body2" color={expired ? 'error.main' : 'text.primary'} noWrap>
            {formatDate(row.expiresAt)}
          </Typography>
        );
      },
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      width: 120,
      render: (row) => {
        const expired = new Date(row.expiresAt) < new Date();
        const chip = (
          <Chip
            label={expired ? 'Expired' : row.isActive ? 'Active' : 'Inactive'}
            size="small"
            color={expired ? 'error' : row.isActive ? 'success' : 'default'}
          />
        );

        /*
         * An expired coupon is off for a reason the chip cannot change — the date is.
         * Leaving it clickable would let an admin "activate" a code that still would
         * not work at checkout, so it says what to do instead.
         */
        if (expired) {
          return <Tooltip title="Expired — edit the coupon to extend it">{chip}</Tooltip>;
        }

        return (
          <Tooltip title="Click to toggle active / inactive">
            <Box component="span" onClick={() => toggleActive(row)} sx={{ cursor: 'pointer' }}>
              {chip}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 96,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center" sx={{ whiteSpace: 'nowrap' }}>
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
        verticalAlign="center"
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
