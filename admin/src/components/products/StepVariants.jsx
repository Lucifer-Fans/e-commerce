import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';

import VariantAttributeBuilder from './VariantAttributeBuilder';
import VariantMatrix from './VariantMatrix';
import ConfirmDialog from '../common/ConfirmDialog';
import {
  MAX_COMBINATIONS,
  attributeKeyOf,
  combinationCount,
  mergeCombinations,
  normaliseAttributes,
} from '../../utils/variants';

/**
 * Step 3 — variants.
 *
 * Two halves: define the axes of variation, then generate and price every combination.
 * Generating is deliberately additive — an existing SKU keeps its price, stock and images,
 * so adding one new colour to a product with twenty SKUs never resets the other twenty.
 */
export default function StepVariants({ values, errors, onChange }) {
  const { enqueueSnackbar } = useSnackbar();
  const [confirmDisable, setConfirmDisable] = useState(false);

  const attributes = values.variantAttributes || [];
  const variants = values.variants || [];
  const enabled = Boolean(values.hasVariants);

  const expected = combinationCount(attributes);
  const ready = normaliseAttributes(attributes).length > 0;

  // What "Generate" would actually do, so the button can say it rather than surprise them.
  const pending = useMemo(() => {
    if (!ready) return { added: 0, removed: 0 };
    const merged = mergeCombinations(variants, attributes, {}, values.sku || values.name);
    const nextKeys = new Set(merged.map((row) => attributeKeyOf(row.attributes)));
    const currentKeys = new Set(variants.map((row) => attributeKeyOf(row.attributes)));
    return {
      added: [...nextKeys].filter((key) => !currentKeys.has(key)).length,
      removed: [...currentKeys].filter((key) => !nextKeys.has(key)).length,
    };
  }, [ready, variants, attributes, values.sku, values.name]);

  const generate = () => {
    if (expected > MAX_COMBINATIONS) {
      enqueueSnackbar(
        `${expected} combinations exceeds the limit of ${MAX_COMBINATIONS}. Reduce the values or split the product.`,
        { variant: 'error' }
      );
      return;
    }

    // Blank rows inherit the product's own pricing, so a matrix of forty SKUs is usable
    // straight away and the admin only edits the ones that differ.
    const merged = mergeCombinations(
      variants,
      attributes,
      {
        price: values.price === '' ? '' : Number(values.price),
        discountPercent: Number(values.discountPercent) || 0,
        stock: 0,
        lowStockThreshold: Number(values.lowStockThreshold) || 5,
      },
      values.sku || values.name
    );

    onChange({ variants: merged, variantAttributes: attributes });
    enqueueSnackbar(
      pending.added || pending.removed
        ? `${merged.length} combination(s) ready · ${pending.added} added, ${pending.removed} dropped`
        : `${merged.length} combination(s) up to date`,
      { variant: 'success' }
    );
  };

  const setEnabled = (next) => {
    if (!next && variants.length) {
      setConfirmDisable(true);
      return;
    }
    onChange({ hasVariants: next, ...(next ? {} : { variants: [], variantAttributes: [] }) });
  };

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Box>
          <Typography variant="h6">Product Variants</Typography>
          <Typography variant="body2" color="text.secondary">
            Sell the same product in several options — each combination gets its own SKU,
            price, stock and images.
          </Typography>
        </Box>

        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
          label={<Typography variant="body2" fontWeight={600}>This product has variants</Typography>}
        />
      </Stack>

      {!enabled ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          <AlertTitle>Selling a single version</AlertTitle>
          The price, stock and images from the earlier steps are used as-is. Turn variants on
          if the product comes in more than one colour, size, capacity or any other option —
          each one then gets its own SKU so inventory and orders stay accurate per option.
        </Alert>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              1 · Define the options
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add an attribute for each way the product varies, then list its values. Anything
              you name works — Color, Size, Storage, RAM, Waist, Shoe Size — and the storefront
              renders it automatically.
            </Typography>

            <VariantAttributeBuilder
              value={attributes}
              onChange={(next) => onChange({ variantAttributes: next })}
            />
          </Paper>

          <Divider sx={{ my: 3 }} />

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              spacing={1.5}
              sx={{ mb: 2 }}
            >
              <Box>
                <Typography variant="subtitle2">2 · Generate and price the combinations</Typography>
                <Typography variant="body2" color="text.secondary">
                  {ready
                    ? `${expected} combination${expected === 1 ? '' : 's'} from your attributes` +
                      (pending.added || pending.removed
                        ? ` · ${pending.added} new, ${pending.removed} no longer valid`
                        : '')
                    : 'Add an attribute with at least one value first'}
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={!ready}
                onClick={generate}
              >
                {variants.length ? 'Regenerate combinations' : 'Generate combinations'}
              </Button>
            </Stack>

            {expected > MAX_COMBINATIONS && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {expected} combinations exceeds the limit of {MAX_COMBINATIONS}. Reduce the number
                of values, or split this into separate products.
              </Alert>
            )}

            {variants.length === 0 ? (
              <Alert severity={ready ? 'warning' : 'info'}>
                {ready
                  ? 'Generate the combinations, then set a price and stock quantity for each SKU.'
                  : 'Nothing to generate yet — define at least one attribute above.'}
              </Alert>
            ) : (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Each row is an independent SKU. Edit price and stock inline; open the tune icon
                  for that variant&apos;s own images, barcode and HSN code. A row left at zero
                  stock shows as sold out on the storefront rather than disappearing.
                </Alert>

                <VariantMatrix
                  value={variants}
                  onChange={(next) => onChange({ variants: next })}
                  productName={values.name}
                  error={errors.variants}
                />
              </>
            )}
          </Paper>
        </>
      )}

      <ConfirmDialog
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        onConfirm={() => {
          onChange({ hasVariants: false, variants: [], variantAttributes: [] });
          setConfirmDisable(false);
        }}
        title="Turn variants off?"
        message={`All ${variants.length} SKU(s) and their stock figures will be removed when you save, and the product falls back to the single price and stock from step 1. Existing orders keep their own record of what was bought.`}
        confirmLabel="Turn off variants"
      />
    </Box>
  );
}
