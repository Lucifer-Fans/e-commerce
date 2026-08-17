import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import FormControlLabel from '@mui/material/FormControlLabel';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import PlayIcon from '@mui/icons-material/PlayArrow';

import { formatPrice, computeFinalPrice } from '../../utils/format';
import { variantLabel } from '../../utils/variants';

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** Step 4 — full review of everything entered, plus the publish/draft choice. */
export default function StepPreview({ values, categories, subCategoryName, issues = [] }) {
  const finalPrice = computeFinalPrice(values.price, values.discountPercent);
  const categoryName = categories.find((c) => c._id === values.category)?.name || '—';
  const primary = values.images[0];

  // A varied product is described by its SKUs, not by the single price on step 1 — so the
  // summary rows switch to the range and the total across every combination.
  const variants = values.hasVariants ? values.variants || [] : [];
  const activeVariants = variants.filter((row) => row.isActive !== false);
  const variantPrices = activeVariants.map((row) => computeFinalPrice(row.price, row.discountPercent));
  const variantStock = activeVariants.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
  const priceRange = variantPrices.length
    ? { min: Math.min(...variantPrices), max: Math.max(...variantPrices) }
    : null;

  return (
    <Box>
      <Typography variant="h6">Review & Publish</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Check everything below before publishing. You can go back to any step to make changes.
      </Typography>

      {issues.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={700} gutterBottom>
            Please resolve before publishing
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
            {issues.map((issue) => (
              <Typography key={issue} component="li" variant="body2">
                {issue}
              </Typography>
            ))}
          </Box>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ---------- Storefront card preview ---------- */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            How it looks on the storefront
          </Typography>

          <Paper variant="outlined" sx={{ overflow: 'hidden', maxWidth: 300 }}>
            <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'grey.100' }}>
              {primary ? (
                <Box
                  component="img"
                  src={primary.url}
                  alt={values.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', color: 'text.disabled' }}>
                  <ImageNotSupportedIcon sx={{ fontSize: 42 }} />
                </Box>
              )}

              {Number(values.discountPercent) > 0 && (
                <Chip
                  label={`${Math.round(values.discountPercent)}% OFF`}
                  size="small"
                  color="error"
                  sx={{ position: 'absolute', top: 8, left: 8 }}
                />
              )}
            </Box>

            <Box sx={{ p: 1.75 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1, minHeight: 40 }}>
                {values.name || 'Product name'}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="h6" fontWeight={800}>
                  {formatPrice(finalPrice)}
                </Typography>
                {Number(values.discountPercent) > 0 && (
                  <Typography variant="body2" color="text.disabled" sx={{ textDecoration: 'line-through' }}>
                    {formatPrice(values.price)}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Paper>

          {(values.images.length > 1 || values.videos.length > 0) && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              {values.images.slice(1).map((image, index) => (
                <Box
                  key={image.publicId || index}
                  component="img"
                  src={image.url}
                  alt=""
                  sx={{
                    width: 52,
                    height: 52,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                  }}
                />
              ))}

              {/* Clips sit at the end of the gallery, which is where they render on the storefront. */}
              {values.videos.map((video, index) => (
                <Box
                  key={video.publicId || index}
                  sx={{
                    position: 'relative',
                    width: 52,
                    height: 52,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    overflow: 'hidden',
                    bgcolor: 'grey.900',
                  }}
                >
                  {video.thumbnail && (
                    <Box
                      component="img"
                      src={video.thumbnail}
                      alt=""
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      bgcolor: 'rgba(15,23,42,.35)',
                    }}
                  >
                    <PlayIcon sx={{ fontSize: 20 }} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Grid>

        {/* ---------- Details ---------- */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Section title="Basic information">
            <Table size="small">
              <TableBody>
                {[
                  ['Product name', values.name || '—'],
                  ['Category', categoryName],
                  ['Sub-category', subCategoryName || '—'],
                  ['Brand', values.brand || '—'],
                  ['SKU', values.sku || 'Auto-generated'],
                  ['Price (MRP)', formatPrice(values.price, true)],
                  ['Discount', `${Number(values.discountPercent) || 0}%`],
                  [
                    'Final price',
                    priceRange
                      ? priceRange.min === priceRange.max
                        ? formatPrice(priceRange.min, true)
                        : `${formatPrice(priceRange.min)} – ${formatPrice(priceRange.max)} across variants`
                      : formatPrice(finalPrice, true),
                  ],
                  [
                    'Stock',
                    variants.length
                      ? `${variantStock} units across ${activeVariants.length} active SKU(s)`
                      : `${values.stock || 0} units`,
                  ],
                  ['Tags', values.tags.length ? values.tags.join(', ') : '—'],
                ].map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell sx={{ border: 0, color: 'text.secondary', width: '35%', py: 0.75 }}>
                      {label}
                    </TableCell>
                    <TableCell sx={{ border: 0, fontWeight: 600, py: 0.75 }}>{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          {values.shortDescription && (
            <Section title="Short description">
              <Typography variant="body2">{values.shortDescription}</Typography>
            </Section>
          )}

          <Section title={`Description (${values.description.length} characters)`}>
            <Paper variant="outlined" sx={{ p: 2, maxHeight: 220, overflow: 'auto' }}>
              <Box
                sx={{ fontSize: 14, lineHeight: 1.6, '& p': { mb: 1 }, '& ul': { pl: 2.5 } }}
                dangerouslySetInnerHTML={{ __html: values.description || '<p>No description added</p>' }}
              />
            </Paper>
          </Section>

          {values.highlights.filter(Boolean).length > 0 && (
            <Section title="Key highlights">
              <Stack spacing={0.75}>
                {values.highlights.filter(Boolean).map((highlight, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="center">
                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="body2">{highlight}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Section>
          )}

          <Section title={`Feature specification table (${values.features.length} rows)`}>
            {values.features.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                No features added — the Features tab will be empty on the product page.
              </Typography>
            ) : (
              <Paper variant="outlined">
                <Table size="small">
                  <TableBody>
                    {values.features.map((feature, index) => (
                      <TableRow key={index}>
                        <TableCell sx={{ color: 'text.secondary', width: '40%' }}>
                          {feature.key || <em>(blank)</em>}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {feature.value || <em>(blank)</em>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            )}
          </Section>

          {variants.length > 0 && (
            <Section title={`Variants (${variants.length} SKUs)`}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {values.variantAttributes.map((attribute) => (
                  <Chip
                    key={attribute.name}
                    size="small"
                    variant="outlined"
                    label={`${attribute.name}: ${attribute.values.map((v) => v.label).join(', ')}`}
                  />
                ))}
              </Stack>

              <Paper variant="outlined" sx={{ maxHeight: 260, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableBody>
                    {variants.map((row, index) => (
                      <TableRow key={row._id || row.sku || index}>
                        <TableCell sx={{ fontWeight: 600 }}>{variantLabel(row.attributes)}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 12 }}>
                          {row.sku || 'Auto'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatPrice(computeFinalPrice(row.price, row.discountPercent))}
                        </TableCell>
                        <TableCell align="right" sx={{ color: Number(row.stock) > 0 ? 'text.primary' : 'error.main' }}>
                          {Number(row.stock) > 0 ? `${row.stock} in stock` : 'Sold out'}
                        </TableCell>
                        <TableCell align="right">
                          {row.isActive === false && <Chip size="small" label="Disabled" color="warning" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Section>
          )}

          {values.faqs.filter((f) => f.question).length > 0 && (
            <Section title={`FAQs (${values.faqs.length})`}>
              <Stack spacing={1.25}>
                {values.faqs.map((faq, index) => (
                  <Box key={index}>
                    <Typography variant="body2" fontWeight={700}>
                      {faq.question}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {faq.answer}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          )}

          <Divider sx={{ my: 3 }} />

          <Section title="Homepage rails">
            {/* "Products For You" and "Top Selling" are worked out from sales and from
                what each shopper browses — there is no switch to preview here. */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Homepage sections are automatic. Once published, this product appears in
              “Top Selling” as it sells, and in “Products For You” for shoppers browsing
              this category or brand.
            </Typography>
          </Section>
        </Grid>
      </Grid>
    </Box>
  );
}

/** Publish/draft selector, rendered in the wizard footer next to the submit button. */
export function PublishChoice({ status, onChange }) {
  return (
    <RadioGroup row value={status} onChange={(e) => onChange(e.target.value)}>
      <FormControlLabel
        value="published"
        control={<Radio size="small" />}
        label={<Typography variant="body2">Publish now</Typography>}
      />
      <FormControlLabel
        value="draft"
        control={<Radio size="small" />}
        label={<Typography variant="body2">Save as draft</Typography>}
      />
    </RadioGroup>
  );
}
