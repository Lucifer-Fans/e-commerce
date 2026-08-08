import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';

import SaveIcon from '@mui/icons-material/SaveOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import InstagramIcon from '@mui/icons-material/Instagram';
import XIcon from '@mui/icons-material/X';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FacebookIcon from '@mui/icons-material/FacebookOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';

import { settingApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useRealtimeEvent } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import ErrorState from '../components/common/ErrorState';
import AssetPicker from '../components/common/AssetPicker';
import TranslationEditor from '../components/common/TranslationEditor';
import { pruneTranslations } from '../utils/languages';

const EMPTY = {
  general: { siteName: '', contactEmail: '', contactNumber: '', companyAddress: '', mapEmbedUrl: '' },
  seo: { metaTitle: '', metaDescription: '', metaKeywords: '' },
  branding: { logo: { url: '', publicId: '' }, favicon: { url: '', publicId: '' } },
  social: { instagram: '', twitter: '', whatsapp: '', facebook: '', linkedin: '' },
  translations: {},
};

const asset = (value) => ({ url: value?.url || '', publicId: value?.publicId || '' });

/** Server document -> flat form state (keywords become the comma-separated string we show). */
function toForm(settings) {
  if (!settings) return EMPTY;
  return {
    general: { ...EMPTY.general, ...settings.general },
    seo: {
      metaTitle: settings.seo?.metaTitle || '',
      metaDescription: settings.seo?.metaDescription || '',
      metaKeywords: (settings.seo?.metaKeywords || []).join(', '),
    },
    branding: { logo: asset(settings.branding?.logo), favicon: asset(settings.branding?.favicon) },
    social: { ...EMPTY.social, ...settings.social },
    translations: settings.translations || {},
  };
}

const SECTION_LABEL = {
  general: 'General information',
  seo: 'SEO settings',
  branding: 'Branding',
  social: 'Social profiles',
  translations: 'Translations',
};

/** Card shell shared by every section: title, per-section reset, consistent padding. */
function SectionCard({ title, section, onReset, dirty, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="h6">{title}</Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            {dirty && <Chip label="Edited" size="small" color="warning" />}
            <Tooltip title={dirty ? `Undo changes to ${SECTION_LABEL[section].toLowerCase()}` : 'No changes to undo'}>
              <span>
                <IconButton size="small" disabled={!dirty} onClick={() => onReset(section)}>
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider sx={{ mt: 1.5, mb: 2.5 }} />
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * One labelled input with its own "last updated" stamp, so the admin can see at a
 * glance which details have gone stale.
 */
function SettingField({ label, path, values, errors, history, onChange, helperText, ...textFieldProps }) {
  const [section, field] = path.split('.');
  const updatedAt = history?.[path];

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.disabled" noWrap>
          {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleDateString('en-IN')}` : 'Never updated'}
        </Typography>
      </Stack>

      <TextField
        fullWidth
        value={values[section][field]}
        onChange={(e) => onChange(section, field, e.target.value)}
        error={Boolean(errors[path])}
        {...textFieldProps}
        helperText={errors[path] || helperText}
      />
    </Box>
  );
}

export default function Settings() {
  const { enqueueSnackbar } = useSnackbar();
  const query = useFetch(useCallback(() => settingApi.get(), []), []);

  const [values, setValues] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY); // last persisted snapshot, for dirty checks + undo
  const [history, setHistory] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  /** Seed the form once the document arrives (and after every successful save). */
  const adopt = useCallback((settings) => {
    const form = toForm(settings);
    setValues(form);
    setSaved(form);
    setHistory(settings?.fieldHistory || {});
  }, []);

  useEffect(() => {
    if (query.data) adopt(query.data.data.settings);
  }, [query.data, adopt]);

  const set = (section, field, value) => {
    setValues((v) => ({ ...v, [section]: { ...v[section], [field]: value } }));
    setErrors((e) => ({ ...e, [`${section}.${field}`]: undefined }));
  };

  const dirtySections = useMemo(
    () =>
      Object.keys(EMPTY).filter(
        (section) => JSON.stringify(values[section]) !== JSON.stringify(saved[section])
      ),
    [values, saved]
  );
  const isDirty = dirtySections.length > 0;

  // A half-finished settings change is easy to lose on a stray tab close.
  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  /**
   * Adopt another admin's save — but never over a half-typed form. While this one is
   * dirty the incoming values are ignored, so the editor keeps their work and the
   * next save is theirs.
   */
  useRealtimeEvent(EVENTS.SETTINGS_UPDATED, (payload) => {
    if (isDirty || !payload?.settings) return;
    adopt(payload.settings);
  });

  const resetSection = (section) => {
    setValues((v) => ({ ...v, [section]: saved[section] }));
    setErrors({});
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      // The whole document goes up; the API stamps only the leaves that actually changed.
      const res = await settingApi.update({
        ...values,
        translations: pruneTranslations(values.translations) ?? null,
      });
      adopt(res.data.settings);
      enqueueSnackbar('Organization settings saved', { variant: 'success' });
    } catch (err) {
      const fieldErrors = {};
      (err.errors || []).forEach(({ field, message }) => {
        fieldErrors[field] = message;
      });
      setErrors(fieldErrors);
      enqueueSnackbar(err.message || 'Could not save the settings', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const fieldProps = { values, errors, history, onChange: set };

  if (query.error) {
    return (
      <Box>
        <PageHeader title="Organization" breadcrumbs={[{ label: 'Organization' }]} />
        <Card>
          <ErrorState message={query.error.message} onRetry={query.refetch} />
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader
        title="Organization"
        subtitle="Store identity, contact details, branding and search engine metadata — everything the storefront reads from here"
        breadcrumbs={[{ label: 'Organization' }]}
        action={
          isDirty ? <Chip label={`${dirtySections.length} section(s) edited`} color="warning" /> : null
        }
      />

      {query.loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={2.5} alignItems="stretch">
        {/* ---------- General information ---------- */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard
            title="General Information"
            section="general"
            dirty={dirtySections.includes('general')}
            onReset={resetSection}
          >
            <Stack spacing={2.5}>
              <SettingField
                label="Site Name"
                path="general.siteName"
                placeholder="Your store name"
                inputProps={{ maxLength: 80 }}
                {...fieldProps}
              />
              <SettingField
                label="Contact Email"
                path="general.contactEmail"
                type="email"
                placeholder="support@yourstore.in"
                inputProps={{ maxLength: 120 }}
                {...fieldProps}
              />
              <SettingField
                label="Contact Number"
                path="general.contactNumber"
                placeholder="+91 90000 00000"
                inputProps={{ maxLength: 24 }}
                {...fieldProps}
              />
              <SettingField
                label="Company Address"
                path="general.companyAddress"
                placeholder="City, State (Country)"
                multiline
                minRows={3}
                inputProps={{ maxLength: 300 }}
                {...fieldProps}
              />
              <SettingField
                label="Google Maps Embed"
                path="general.mapEmbedUrl"
                placeholder="https://www.google.com/maps/embed?pb=..."
                multiline
                minRows={3}
                inputProps={{ maxLength: 2000 }}
                helperText="Paste the embed link, or the whole <iframe> from Google Maps → Share → Embed a map. Drives the map on Contact Us and the footer's location link."
                {...fieldProps}
              />
            </Stack>
          </SectionCard>
        </Grid>

        {/* ---------- SEO ---------- */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard
            title="SEO Settings"
            section="seo"
            dirty={dirtySections.includes('seo')}
            onReset={resetSection}
          >
            <Stack spacing={2.5}>
              <SettingField
                label="Meta Title"
                path="seo.metaTitle"
                placeholder="Store | Your tagline"
                inputProps={{ maxLength: 70 }}
                helperText={`${values.seo.metaTitle.length}/70 characters — Google truncates beyond this`}
                {...fieldProps}
              />
              <SettingField
                label="Meta Description"
                path="seo.metaDescription"
                placeholder="One or two sentences describing the store"
                multiline
                minRows={3}
                inputProps={{ maxLength: 200 }}
                helperText={`${values.seo.metaDescription.length}/200 characters`}
                {...fieldProps}
              />
              <SettingField
                label="Meta Keywords"
                path="seo.metaKeywords"
                placeholder="springs, compression springs, industrial springs mumbai"
                multiline
                minRows={2}
                helperText="Separate each keyword with a comma"
                {...fieldProps}
              />
            </Stack>
          </SectionCard>
        </Grid>

        {/* ---------- Branding ---------- */}
        <Grid size={{ xs: 12, lg: 3 }}>
          <SectionCard
            title="Branding"
            section="branding"
            dirty={dirtySections.includes('branding')}
            onReset={resetSection}
          >
            <Stack spacing={3}>
              <AssetPicker
                label="Logo"
                hint="Transparent PNG, around 400×120px"
                ratio="16/9"
                value={values.branding.logo}
                onChange={(image) => set('branding', 'logo', asset(image))}
              />
              <AssetPicker
                label="Favicon"
                hint="Square PNG, 64×64px or larger"
                value={values.branding.favicon}
                onChange={(image) => set('branding', 'favicon', asset(image))}
              />
            </Stack>
          </SectionCard>
        </Grid>

        {/* ---------- Social ---------- */}
        <Grid size={12}>
          <SectionCard
            title="Social Profiles"
            section="social"
            dirty={dirtySections.includes('social')}
            onReset={resetSection}
          >
            <Grid container spacing={2.5}>
              {[
                { field: 'instagram', label: 'Instagram', icon: <InstagramIcon fontSize="small" />, placeholder: 'https://instagram.com/yourstore' },
                { field: 'twitter', label: 'Twitter (X)', icon: <XIcon fontSize="small" />, placeholder: 'https://x.com/yourstore' },
                { field: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon fontSize="small" />, placeholder: '+91 90000 00000' },
                { field: 'facebook', label: 'Facebook', icon: <FacebookIcon fontSize="small" />, placeholder: 'https://facebook.com/yourstore' },
                { field: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon fontSize="small" />, placeholder: 'https://linkedin.com/company/yourstore' },
              ].map((network) => (
                <Grid key={network.field} size={{ xs: 12, md: 6, lg: 4 }}>
                  <SettingField
                    label={network.label}
                    path={`social.${network.field}`}
                    placeholder={network.placeholder}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'text.disabled' }}>
                          {network.icon}
                        </InputAdornment>
                      ),
                    }}
                    inputProps={{ maxLength: 200 }}
                    {...fieldProps}
                  />
                </Grid>
              ))}
            </Grid>
          </SectionCard>
        </Grid>

        {/* ---------- Translations ---------- */}
        <Grid size={12}>
          <SectionCard
            title="Translations"
            section="translations"
            dirty={dirtySections.includes('translations')}
            onReset={resetSection}
          >
            {/*
              Only the prose leaves. Emails, phone numbers, links and the site name stay
              in English — they are identifiers the storefront and inboxes match on.
            */}
            <TranslationEditor
              value={values.translations}
              onChange={(translations) => setValues((v) => ({ ...v, translations }))}
              fields={[
                {
                  name: 'companyAddress',
                  label: 'Company address',
                  source: values.general.companyAddress,
                  multiline: true,
                  rows: 2,
                },
                { name: 'metaTitle', label: 'Meta title', source: values.seo.metaTitle },
                {
                  name: 'metaDescription',
                  label: 'Meta description',
                  source: values.seo.metaDescription,
                  multiline: true,
                  rows: 2,
                },
              ]}
            />
          </SectionCard>
        </Grid>
      </Grid>

      {/* ---------- Action bar ---------- */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          mt: 2.5,
          py: 2,
          px: { xs: 2, sm: 2.5 },
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -1px 3px rgba(15,23,42,.06)',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
        >
          <Typography variant="body2" color="text.secondary">
            {isDirty
              ? 'You have unsaved changes.'
              : 'Everything here is live on the storefront.'}
          </Typography>

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button
              color="inherit"
              disabled={!isDirty || saving}
              startIcon={<RestartAltIcon />}
              onClick={() => {
                setValues(saved);
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button
              variant="contained"
              disabled={!isDirty || saving || query.loading}
              onClick={save}
              startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <SaveIcon />}
            >
              Save Changes
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
