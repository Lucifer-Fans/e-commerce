import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepButton from '@mui/material/StepButton';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import ArrowBackIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardIos';
import SaveIcon from '@mui/icons-material/Save';

import { productApi, categoryApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import PageHeader from '../components/common/PageHeader';
import ErrorState from '../components/common/ErrorState';
import StepBasicInfo from '../components/products/StepBasicInfo';
import StepFeatures from '../components/products/StepFeatures';
import StepImages from '../components/products/StepImages';
import StepVariants from '../components/products/StepVariants';
import StepTranslations from '../components/products/StepTranslations';
import StepPreview, { PublishChoice } from '../components/products/StepPreview';
import { pruneTranslations } from '../utils/languages';
import { fromApiVariant, toApiVariant, validateVariants } from '../utils/variants';

const STEPS = [
  { label: 'Basic Information', hint: 'Name, category, pricing and description' },
  { label: 'Features & FAQs', hint: 'Specification rows, highlights and questions' },
  { label: 'Product Images', hint: 'Up to 5 images, first one is primary' },
  { label: 'Variants', hint: 'Colours, sizes and any other option — one SKU each' },
  { label: 'Translations', hint: 'Optional — the same copy in the other shipped languages' },
  { label: 'Preview & Publish', hint: 'Review everything before it goes live' },
];

const EMPTY = {
  name: '', category: '', subCategory: '', brand: '', sku: '',
  price: '', discountPercent: 0, stock: '', lowStockThreshold: 5,
  shortDescription: '', description: '',
  tags: [], features: [], highlights: [], faqs: [], images: [],
  hasVariants: false, variantAttributes: [], variants: [],
  isFeatured: false, isTopSelling: false, status: 'published',
  translations: {},
};

/** Per-step validation. Returning {} means the step is complete. */
function validateStep(step, values) {
  const errors = {};

  if (step === 0) {
    if (values.name.trim().length < 3) errors.name = 'Product name must be at least 3 characters';
    if (!values.category) errors.category = 'Select a category';
    if (values.price === '' || Number(values.price) < 0) errors.price = 'Enter a valid price';
    const discount = Number(values.discountPercent);
    if (Number.isNaN(discount) || discount < 0 || discount > 95) {
      errors.discountPercent = 'Discount must be between 0 and 95';
    }
    // A varied product is stocked per SKU, so the product-level figure is only required
    // when there are no variants to roll up from.
    if (!values.hasVariants && (values.stock === '' || Number(values.stock) < 0)) {
      errors.stock = 'Enter the available stock';
    }
    if (!values.description.trim()) errors.description = 'A description is required';
  }

  if (step === 1) {
    // Partially-filled rows would render a broken spec table.
    const broken = values.features.some((f) => Boolean(f.key.trim()) !== Boolean(f.value.trim()));
    if (broken) errors.features = 'Every feature row needs both a name and a value';
  }

  if (step === 2 && values.images.length === 0) {
    errors.images = 'Add at least one product image';
  }

  if (step === 3 && values.hasVariants) {
    const problems = validateVariants(values.variantAttributes, values.variants);
    if (problems.length) errors.variants = problems.join(' · ');
  }

  return errors;
}

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [step, setStep] = useState(0);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [visited, setVisited] = useState(new Set([0]));
  const [saving, setSaving] = useState(false);

  const categoriesQuery = useFetch(useCallback(() => categoryApi.list(), []), []);
  const categories = categoriesQuery.data?.data?.categories || [];

  const productQuery = useFetch(
    useCallback(() => productApi.detail(id), [id]),
    [id],
    { enabled: isEdit }
  );

  // Hydrate the form from an existing product when editing.
  useEffect(() => {
    const product = productQuery.data?.data?.product;
    if (!product) return;

    setValues({
      name: product.name || '',
      category: product.category?._id || product.category || '',
      subCategory: product.subCategory?._id || product.subCategory || '',
      brand: product.brand || '',
      sku: product.sku || '',
      price: product.price ?? '',
      discountPercent: product.discountPercent ?? 0,
      stock: product.stock ?? '',
      lowStockThreshold: product.lowStockThreshold ?? 5,
      shortDescription: product.shortDescription || '',
      description: product.description || '',
      tags: product.tags || [],
      features: (product.features || []).map((f) => ({ key: f.key, value: f.value })),
      highlights: product.highlights || [],
      faqs: (product.faqs || []).map((f) => ({ question: f.question, answer: f.answer })),
      images: product.images || [],
      hasVariants: Boolean(product.hasVariants),
      variantAttributes: (product.variantAttributes || []).map((attribute) => ({
        name: attribute.name,
        // Carried through untouched so the translation step keys on the same slug the
        // server already assigned rather than re-deriving one that might not match.
        slug: attribute.slug,
        inputType: attribute.inputType || 'auto',
        helpText: attribute.helpText || '',
        values: (attribute.values || []).map((value) => ({
          label: value.label,
          slug: value.slug,
          hex: value.hex,
          image: value.image,
        })),
      })),
      variants: (product.variants || []).map(fromApiVariant),
      isFeatured: Boolean(product.isFeatured),
      isTopSelling: Boolean(product.isTopSelling),
      status: product.status || 'published',
      translations: product.translations || {},
    });
  }, [productQuery.data]);

  const patch = (changes) => {
    setValues((v) => ({ ...v, ...changes }));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(changes).forEach((key) => delete next[key]);
      return next;
    });
  };

  const subCategoryName = useMemo(() => {
    const parent = categories.find((c) => c._id === values.category);
    return parent?.subCategories?.find((s) => s._id === values.subCategory)?.name || '';
  }, [categories, values.category, values.subCategory]);

  const outstandingIssues = useMemo(() => {
    const messages = [];
    [0, 1, 2, 3].forEach((s) => {
      Object.values(validateStep(s, values)).forEach((message) => messages.push(message));
    });
    return messages;
  }, [values]);

  const goToStep = (target) => {
    // Moving forward requires the current step to be valid; going back never does.
    if (target > step) {
      const found = validateStep(step, values);
      if (Object.keys(found).length) {
        setErrors(found);
        enqueueSnackbar('Please fix the highlighted fields first', { variant: 'warning' });
        return;
      }
    }
    setErrors({});
    setVisited((v) => new Set(v).add(target));
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (outstandingIssues.length) {
      enqueueSnackbar('Resolve the outstanding issues before saving', { variant: 'error' });
      return;
    }

    const payload = {
      name: values.name.trim(),
      category: values.category,
      subCategory: values.subCategory || undefined,
      brand: values.brand.trim() || undefined,
      sku: values.sku.trim() || undefined,
      price: Number(values.price),
      discountPercent: Number(values.discountPercent) || 0,
      // For a varied product the server recomputes stock and price from the SKUs, so what
      // is sent here is only a floor the rollup immediately overwrites.
      stock: values.hasVariants ? Number(values.stock) || 0 : Number(values.stock),
      lowStockThreshold: Number(values.lowStockThreshold) || 5,
      shortDescription: values.shortDescription.trim() || undefined,
      description: values.description,
      tags: values.tags,
      // Drop blank rows the admin left behind rather than persisting empty specs.
      features: values.features
        .filter((f) => f.key.trim() && f.value.trim())
        .map((f, index) => ({ key: f.key.trim(), value: f.value.trim(), displayOrder: index })),
      highlights: values.highlights.filter((h) => h.trim()),
      faqs: values.faqs.filter((f) => f.question.trim() && f.answer.trim()),
      images: values.images.map((image, index) => ({
        url: image.url,
        publicId: image.publicId,
        alt: image.alt || values.name.trim(),
        isPrimary: index === 0,
        displayOrder: index,
      })),
      // The attribute definition and the SKU rows travel with the product, so the whole
      // wizard saves in one request and the server reconciles them in one transaction-ish
      // pass. An empty array is meaningful: it removes every variant.
      variantAttributes: values.hasVariants
        ? values.variantAttributes
            .filter((attribute) => attribute.name?.trim() && attribute.values?.length)
            .map((attribute, index) => ({
              name: attribute.name.trim(),
              inputType: attribute.inputType || 'auto',
              helpText: attribute.helpText?.trim() || undefined,
              values: attribute.values.map((value, valueIndex) => ({
                label: value.label,
                slug: value.slug,
                hex: value.hex,
                image: value.image,
                displayOrder: valueIndex,
              })),
              displayOrder: index,
            }))
        : [],
      variants: values.hasVariants ? values.variants.map(toApiVariant) : [],
      isFeatured: values.isFeatured,
      isTopSelling: values.isTopSelling,
      status: values.status,
      // The translated lists are indexed against the same filtered arrays sent above, so
      // blank source rows dropped there are dropped here too and nothing shifts.
      translations: pruneTranslations(values.translations) ?? null,
    };

    setSaving(true);
    try {
      if (isEdit) await productApi.update(id, payload);
      else await productApi.create(payload);

      enqueueSnackbar(
        isEdit
          ? 'Product updated'
          : values.status === 'published'
            ? 'Product published successfully'
            : 'Product saved as draft',
        { variant: 'success' }
      );
      navigate('/products');
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the product', { variant: 'error' });
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field?.split('.').pop(), e.message])));
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && productQuery.loading) return <LinearProgress />;
  if (isEdit && productQuery.error) {
    return (
      <ErrorState
        title="Product not found"
        message={productQuery.error.message}
        onRetry={productQuery.refetch}
      />
    );
  }

  const stepProps = { values, errors, onChange: patch, categories };
  const isLastStep = step === STEPS.length - 1;

  return (
    <Box>
      <PageHeader
        title={isEdit ? 'Edit Product' : 'Upload New Product'}
        subtitle={STEPS[step].hint}
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: isEdit ? 'Edit' : 'New' }]}
        action={
          <Button variant="text" color="inherit" onClick={() => navigate('/products')}>
            Cancel
          </Button>
        }
      />

      <Card>
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: 3 }}>
          <Stepper activeStep={step} alternativeLabel nonLinear>
            {STEPS.map((item, index) => (
              <Step key={item.label} completed={visited.has(index) && index < step}>
                <StepButton onClick={() => goToStep(index)}>
                  <StepLabel>
                    <Typography variant="body2" fontWeight={index === step ? 700 : 500}>
                      {item.label}
                    </Typography>
                  </StepLabel>
                </StepButton>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Divider sx={{ mt: 3 }} />

        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {step === 0 && <StepBasicInfo {...stepProps} />}
          {step === 1 && <StepFeatures {...stepProps} />}
          {step === 2 && <StepImages {...stepProps} />}
          {step === 3 && <StepVariants {...stepProps} />}
          {step === 4 && <StepTranslations {...stepProps} />}
          {step === 5 && (
            <StepPreview
              values={values}
              categories={categories}
              subCategoryName={subCategoryName}
              issues={outstandingIssues}
            />
          )}
        </CardContent>

        <Divider />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={2}
          sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: 'grey.50' }}
        >
          <Button
            startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
            disabled={step === 0 || saving}
            onClick={() => goToStep(step - 1)}
            color="inherit"
          >
            Back
          </Button>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            {isLastStep && !isEdit && (
              <PublishChoice status={values.status} onChange={(status) => patch({ status })} />
            )}

            {isLastStep ? (
              <Button
                variant="contained"
                size="large"
                disabled={saving || outstandingIssues.length > 0}
                onClick={submit}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              >
                {isEdit
                  ? 'Save changes'
                  : values.status === 'published'
                    ? 'Publish product'
                    : 'Save draft'}
              </Button>
            ) : (
              <Button
                variant="contained"
                size="large"
                endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                onClick={() => goToStep(step + 1)}
              >
                Continue
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}
