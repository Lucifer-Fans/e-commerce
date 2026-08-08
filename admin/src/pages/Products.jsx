import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';

import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';

import { productApi, categoryApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useDebounce from '../hooks/useDebounce';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS, TAXONOMY_EVENTS } from '../realtime/events';
import { formatPrice, formatDate, thumb, primaryImageOf } from '../utils/format';
import { STOREFRONT_URL } from '../utils/constants';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Products() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState(searchParams.get('availability') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [deleting, setDeleting] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const categoriesQuery = useFetch(useCallback(() => categoryApi.list(), []), []);
  const categories = categoriesQuery.data?.data?.categories || [];

  const query = useFetch(
    useCallback(
      () =>
        productApi.list({
          page,
          limit,
          status,
          search: debouncedSearch || undefined,
          category: category || undefined,
          availability: availability || undefined,
          sort: 'newest',
        }),
      [page, limit, status, debouncedSearch, category, availability]
    ),
    [page, limit, status, debouncedSearch, category, availability]
  );

  // Stock moves as customers buy, and another admin may be editing the same catalogue.
  useLiveRefetch(query.refetch, CATALOG_EVENTS);
  useLiveRefetch(categoriesQuery.refetch, TAXONOMY_EVENTS);

  const products = query.data?.data?.products || [];
  const meta = query.data?.meta;

  const remove = async () => {
    try {
      await productApi.remove(deleting._id);
      enqueueSnackbar('Product deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the product', { variant: 'error' });
    }
  };

  const toggleStatus = async (product) => {
    const next = product.status === 'published' ? 'draft' : 'published';
    try {
      await productApi.setStatus(product._id, next);
      enqueueSnackbar(next === 'published' ? 'Product published' : 'Product moved to draft', {
        variant: 'success',
      });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the status', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'image',
      label: 'Image',
      width: 76,
      render: (row) => (
        <Avatar variant="rounded" src={thumb(primaryImageOf(row), 96)} sx={{ width: 52, height: 52 }} />
      ),
    },
    {
      key: 'name',
      label: 'Product Name',
      minWidth: 240,
      render: (row) => (
        <Box sx={{ maxWidth: 300 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={row.name}>
            {row.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.brand ? `${row.brand} · ` : ''}
            {row.sku || 'No SKU'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      minWidth: 140,
      render: (row) => (
        <Typography variant="body2">{row.category?.name || '—'}</Typography>
      ),
    },
    {
      key: 'subCategory',
      label: 'Sub-category',
      minWidth: 140,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.subCategory?.name || '—'}
        </Typography>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      render: (row) => (
        <Typography variant="body2" color="text.secondary" sx={{ textDecoration: row.discountPercent ? 'line-through' : 'none' }}>
          {formatPrice(row.price)}
        </Typography>
      ),
    },
    {
      key: 'discountPercent',
      label: 'Discount',
      align: 'center',
      render: (row) =>
        row.discountPercent > 0 ? (
          <Chip label={`${Math.round(row.discountPercent)}%`} size="small" color="error" />
        ) : (
          <Typography variant="body2" color="text.disabled">
            —
          </Typography>
        ),
    },
    {
      key: 'finalPrice',
      label: 'Final Price',
      align: 'right',
      render: (row) => {
        // A varied product has no single price — show the range its SKUs span.
        const { minPrice, maxPrice } = row.variantSummary || {};
        const spread = row.hasVariants && maxPrice - minPrice > 0.009;
        return (
          <Typography variant="body2" fontWeight={700} noWrap>
            {spread ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}` : formatPrice(row.finalPrice)}
          </Typography>
        );
      },
    },
    {
      key: 'variants',
      label: 'Variants',
      align: 'center',
      width: 110,
      render: (row) =>
        row.hasVariants ? (
          <Tooltip title="Edit the product to manage each SKU's price, stock and images">
            <Chip
              label={`${row.variantSummary?.count ?? 0} SKUs`}
              size="small"
              color={row.variantSummary?.inStockCount > 0 ? 'primary' : 'warning'}
              variant="outlined"
              onClick={() => navigate(`/products/${row._id}/edit`)}
            />
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.disabled">
            —
          </Typography>
        ),
    },
    {
      key: 'stock',
      label: 'Stock',
      align: 'center',
      render: (row) => (
        <Tooltip title={row.hasVariants ? 'Total across every active SKU' : 'Units available'}>
          <Chip
            label={row.stock}
            size="small"
            color={row.stock === 0 ? 'error' : row.stock <= (row.lowStockThreshold ?? 5) ? 'warning' : 'success'}
            variant={row.stock === 0 ? 'filled' : 'outlined'}
          />
        </Tooltip>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (row) => (
        <Tooltip title="Click to toggle published / draft">
          <Box component="span" onClick={() => toggleStatus(row)} sx={{ cursor: 'pointer' }}>
            <StatusChip status={row.status} kind="product" />
          </Box>
        </Tooltip>
      ),
    },
    {
      key: 'createdAt',
      label: 'Added',
      minWidth: 110,
      render: (row) => (
        <Typography variant="caption" color="text.secondary">
          {formatDate(row.createdAt)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 130,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <Tooltip title="View on storefront">
            <IconButton
              size="small"
              component="a"
              href={`${STOREFRONT_URL}/product/${row.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit product">
            <IconButton size="small" color="primary" onClick={() => navigate(`/products/${row._id}/edit`)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete product">
            <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const resetPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('all');
    setCategory('');
    setAvailability('');
    setPage(1);
  };

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle={`${meta?.total ?? 0} product(s) in your catalogue`}
        breadcrumbs={[{ label: 'Products' }]}
        action={
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => navigate('/products/new')}>
            Upload Product
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={products}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        emptyTitle="No products found"
        emptyMessage="Adjust your filters, or upload your first product to get started."
        emptyAction={{ label: 'Upload Product', onClick: () => navigate('/products/new') }}
        toolbar={
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <TextField
              placeholder="Search by name, brand or SKU…"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              select
              label="Category"
              value={category}
              onChange={(e) => resetPage(setCategory)(e.target.value)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">All categories</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c._id} value={c._id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Status"
              value={status}
              onChange={(e) => resetPage(setStatus)(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="published">Published</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </TextField>

            <TextField
              select
              label="Stock"
              value={availability}
              onChange={(e) => resetPage(setAvailability)(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">Any stock level</MenuItem>
              <MenuItem value="in_stock">In stock</MenuItem>
              <MenuItem value="out_of_stock">Out of stock</MenuItem>
            </TextField>

            <Button color="inherit" onClick={resetFilters}>
              Reset
            </Button>
          </Stack>
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this product?"
        message={`"${deleting?.name}" and its images will be permanently removed. Existing orders keep their own copy of the product details.`}
        confirmLabel="Delete product"
      />
    </Box>
  );
}
