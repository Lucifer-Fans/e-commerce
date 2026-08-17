import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import Avatar from '@mui/material/Avatar';
import InputAdornment from '@mui/material/InputAdornment';

import TuneIcon from '@mui/icons-material/TuneOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import BoltIcon from '@mui/icons-material/BoltOutlined';

import VariantEditorDialog from './VariantEditorDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import { formatPrice, computeFinalPrice, thumb } from '../../utils/format';
import { variantLabel } from '../../utils/variants';

/**
 * The SKU grid.
 *
 * Every generated combination is one row that owns its price, MRP, discount, stock and
 * availability inline; the rest — images, barcode, HSN code — opens in a dialog so
 * the table stays scannable at fifty rows. Bulk fill exists because typing the same price
 * into forty cells is how pricing mistakes happen.
 */
export default function VariantMatrix({ value = [], onChange, productName = '', error }) {
  const [editing, setEditing] = useState(null); // index
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState({ field: 'price', amount: '' });

  const patchRow = (index, changes) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const attributeNames = useMemo(
    () => value[0]?.attributes.map((a) => a.name) || [],
    [value]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return value
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          !term ||
          variantLabel(row.attributes).toLowerCase().includes(term) ||
          (row.sku || '').toLowerCase().includes(term)
      );
  }, [value, search]);

  const totals = useMemo(() => {
    const active = value.filter((row) => row.isActive !== false);
    const prices = active.map((row) => computeFinalPrice(row.price, row.discountPercent));
    return {
      count: value.length,
      active: active.length,
      stock: active.reduce((sum, row) => sum + (Number(row.stock) || 0), 0),
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [value]);

  /** Fills one column across every row currently matching the search. */
  const applyBulk = () => {
    if (bulk.amount === '') return;
    const targets = new Set(rows.map(({ index }) => index));
    onChange(value.map((row, index) => (targets.has(index) ? { ...row, [bulk.field]: bulk.amount } : row)));
    setBulk((b) => ({ ...b, amount: '' }));
  };

  if (!value.length) return null;

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${totals.count} SKU${totals.count === 1 ? '' : 's'}`} color="primary" />
            <Chip size="small" variant="outlined" label={`${totals.active} active`} />
            <Chip size="small" variant="outlined" label={`${totals.stock} units in total`} />
            <Chip
              size="small"
              variant="outlined"
              label={
                totals.min === totals.max
                  ? formatPrice(totals.min)
                  : `${formatPrice(totals.min)} – ${formatPrice(totals.max)}`
              }
            />
          </Stack>

          <TextField
            size="small"
            placeholder="Find a combination or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 240 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        {/* Bulk fill — set one column across every row the search is showing. */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }} alignItems="center">
          <BoltIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Set for all {rows.length} shown:
          </Typography>
          <TextField
            select
            size="small"
            value={bulk.field}
            onChange={(e) => setBulk({ field: e.target.value, amount: '' })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="price">MRP</MenuItem>
            <MenuItem value="discountPercent">Discount %</MenuItem>
            <MenuItem value="stock">Stock</MenuItem>
            <MenuItem value="lowStockThreshold">Low stock alert</MenuItem>
          </TextField>
          <TextField
            size="small"
            type="number"
            value={bulk.amount}
            onChange={(e) => setBulk((b) => ({ ...b, amount: e.target.value }))}
            sx={{ width: 130 }}
            inputProps={{ min: 0 }}
          />
          <Button size="small" variant="outlined" onClick={applyBulk} disabled={bulk.amount === ''}>
            Apply
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell sx={{ width: 56 }}>Image</TableCell>
              {attributeNames.map((name) => (
                <TableCell key={name} sx={{ fontWeight: 700 }}>
                  {name}
                </TableCell>
              ))}
              <TableCell sx={{ minWidth: 170, fontWeight: 700 }}>SKU</TableCell>
              <TableCell align="right" sx={{ width: 110, fontWeight: 700 }}>
                MRP
              </TableCell>
              <TableCell align="right" sx={{ width: 100, fontWeight: 700 }}>
                Discount
              </TableCell>
              <TableCell align="right" sx={{ width: 110, fontWeight: 700 }}>
                Selling
              </TableCell>
              <TableCell align="right" sx={{ width: 95, fontWeight: 700 }}>
                Stock
              </TableCell>
              <TableCell align="center" sx={{ width: 80, fontWeight: 700 }}>
                Active
              </TableCell>
              <TableCell align="center" sx={{ width: 90, fontWeight: 700 }}>
                Action
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map(({ row, index }) => {
              const finalPrice = computeFinalPrice(row.price, row.discountPercent);
              const inactive = row.isActive === false;
              const outOfStock = Number(row.stock) <= 0;

              return (
                <TableRow key={row._id || row.sku || index} hover sx={{ opacity: inactive ? 0.55 : 1 }}>
                  <TableCell>
                    <Avatar variant="rounded" src={thumb(row.images?.[0]?.url, 72)} sx={{ width: 38, height: 38 }}>
                      {row.attributes[0]?.value?.[0] || '?'}
                    </Avatar>
                  </TableCell>

                  {row.attributes.map((attribute) => (
                    <TableCell key={attribute.slug}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {attribute.value}
                      </Typography>
                    </TableCell>
                  ))}

                  <TableCell>
                    <TextField
                      variant="standard"
                      fullWidth
                      value={row.sku || ''}
                      onChange={(e) => patchRow(index, { sku: e.target.value.toUpperCase() })}
                      placeholder="Auto"
                      inputProps={{ style: { fontSize: 12, fontFamily: 'monospace' } }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <TextField
                      variant="standard"
                      type="number"
                      value={row.price}
                      onChange={(e) => patchRow(index, { price: e.target.value })}
                      error={row.price === '' || Number(row.price) < 0}
                      inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontSize: 13 } }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <TextField
                      variant="standard"
                      type="number"
                      value={row.discountPercent}
                      onChange={(e) => patchRow(index, { discountPercent: e.target.value })}
                      error={Number(row.discountPercent) < 0 || Number(row.discountPercent) > 95}
                      inputProps={{ min: 0, max: 95, step: '0.1', style: { textAlign: 'right', fontSize: 13 } }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="primary.main">
                      {formatPrice(finalPrice)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <TextField
                      variant="standard"
                      type="number"
                      value={row.stock}
                      onChange={(e) => patchRow(index, { stock: e.target.value })}
                      error={row.stock === '' || Number(row.stock) < 0}
                      inputProps={{ min: 0, step: 1, style: { textAlign: 'right', fontSize: 13 } }}
                      // A zero-stock SKU is legal — it shows as sold out rather than vanishing.
                      helperText={outOfStock && !inactive ? 'Sold out' : ' '}
                      FormHelperTextProps={{ sx: { m: 0, fontSize: 10, textAlign: 'right' } }}
                    />
                  </TableCell>

                  <TableCell align="center">
                    <Tooltip title={inactive ? 'Shown disabled on the storefront' : 'Available to buy'}>
                      <Switch
                        size="small"
                        checked={!inactive}
                        onChange={(e) => patchRow(index, { isActive: e.target.checked })}
                      />
                    </Tooltip>
                  </TableCell>

                  <TableCell align="center">
                    <Stack direction="row" spacing={0} justifyContent="center">
                      <Tooltip title="Images, barcode & HSN code">
                        <IconButton size="small" color="primary" onClick={() => setEditing(index)}>
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove this combination">
                        <IconButton size="small" color="error" onClick={() => setDeleting({ row, index })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={attributeNames.length + 7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No combination matches “{search}”.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <VariantEditorDialog
        open={editing !== null}
        variant={editing !== null ? value[editing] : null}
        productName={productName}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          patchRow(editing, draft);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          onChange(value.filter((_, i) => i !== deleting.index));
          setDeleting(null);
        }}
        title="Remove this combination?"
        message={`"${deleting ? variantLabel(deleting.row.attributes) : ''}" will stop being sellable, and its stock figure is discarded. Regenerating the matrix brings it back empty. Orders that already contain it keep their own record.`}
        confirmLabel="Remove"
      />
    </Box>
  );
}
