import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';

import TranslationEditor from '../common/TranslationEditor';
import { TRANSLATABLE_LANGUAGES } from '../../utils/languages';

/**
 * Optional step: the same product copy in every shipped language.
 *
 * Nothing here is required — a product with no translations simply reads in English
 * everywhere, which is why this step has no validation and never blocks publishing.
 *
 * Variant attributes are matched by slug rather than position, so renaming or
 * reordering options later does not scramble their translations.
 */
export default function StepTranslations({ values, onChange }) {
  const setTranslations = (translations) => onChange({ translations });

  const attributes = values.hasVariants
    ? values.variantAttributes.filter((a) => a.name?.trim() && a.values?.length)
    : [];

  /** Variant attributes sit outside TranslationEditor: they key on slug, not index. */
  const setAttributeField = (lang, slug, key, next) => {
    const perLang = values.translations?.[lang] || {};
    const list = [...(perLang.variantAttributes || [])];
    const at = list.findIndex((a) => a?.slug === slug);
    const row = at === -1 ? { slug } : { ...list[at] };
    row[key] = next;
    if (at === -1) list.push(row);
    else list[at] = row;
    setTranslations({ ...values.translations, [lang]: { ...perLang, variantAttributes: list } });
  };

  const setAttributeValueLabel = (lang, slug, valueSlug, next) => {
    const perLang = values.translations?.[lang] || {};
    const list = [...(perLang.variantAttributes || [])];
    const at = list.findIndex((a) => a?.slug === slug);
    const row = at === -1 ? { slug } : { ...list[at], values: [...(list[at].values || [])] };
    const vals = [...(row.values || [])];
    const vAt = vals.findIndex((v) => v?.slug === valueSlug);
    if (vAt === -1) vals.push({ slug: valueSlug, label: next });
    else vals[vAt] = { ...vals[vAt], label: next };
    row.values = vals;
    if (at === -1) list.push(row);
    else list[at] = row;
    setTranslations({ ...values.translations, [lang]: { ...perLang, variantAttributes: list } });
  };

  const readAttribute = (lang, slug) =>
    (values.translations?.[lang]?.variantAttributes || []).find((a) => a?.slug === slug) || {};

  return (
    <Box>
      <Typography variant="h6">Translations</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Optional. Shoppers browsing in another language see these words instead — anything
        left blank shows the English.
      </Typography>

      <TranslationEditor
        value={values.translations}
        onChange={setTranslations}
        fields={[
          { name: 'name', label: 'Product name', source: values.name },
          {
            name: 'shortDescription',
            label: 'Short description',
            source: values.shortDescription,
            multiline: true,
            rows: 2,
          },
          {
            name: 'description',
            label: 'Description',
            source: values.description,
            multiline: true,
            rows: 5,
          },
        ]}
        lists={[
          { name: 'highlights', label: 'Highlight', source: values.highlights.filter((h) => h.trim()) },
          {
            name: 'features',
            label: 'Specifications',
            source: values.features.filter((f) => f.key.trim() && f.value.trim()),
            keys: ['key', 'value'],
          },
          {
            name: 'faqs',
            label: 'FAQs',
            source: values.faqs.filter((f) => f.question.trim() && f.answer.trim()),
            keys: ['question', 'answer'],
          },
        ]}
      />

      {attributes.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Variant options
            </Typography>
          </Divider>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Option labels only. The underlying value stays in English so links, filters and
            past orders keep working.
          </Typography>

          <Stack spacing={3}>
            {attributes.map((attribute) => (
              <Box key={attribute.name}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  {attribute.name}
                </Typography>
                <Stack spacing={2}>
                  {TRANSLATABLE_LANGUAGES.map((lang) => {
                    // On an existing product the server-assigned slug is authoritative;
                    // for a brand-new one it has to be predicted the same way.
                    const slug = attribute.slug || slugify(attribute.name);
                    const row = readAttribute(lang.code, slug);
                    return (
                      <Stack
                        key={lang.code}
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1.5}
                        alignItems={{ md: 'center' }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ minWidth: 88, color: 'text.secondary' }}
                        >
                          {lang.native}
                        </Typography>
                        <TextField
                          size="small"
                          sx={{ flex: 1 }}
                          label="Option name"
                          placeholder={attribute.name}
                          value={row.name || ''}
                          onChange={(e) =>
                            setAttributeField(lang.code, slug, 'name', e.target.value)
                          }
                        />
                        {attribute.values.map((value) => (
                          <TextField
                            key={value.slug || value.label}
                            size="small"
                            sx={{ flex: 1 }}
                            label={value.label}
                            placeholder={value.label}
                            value={
                              (row.values || []).find(
                                (v) => v?.slug === (value.slug || slugify(value.label))
                              )?.label || ''
                            }
                            onChange={(e) =>
                              setAttributeValueLabel(
                                lang.code,
                                slug,
                                value.slug || slugify(value.label),
                                e.target.value
                              )
                            }
                          />
                        ))}
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

/** Mirrors the server's attribute slugging so translations match the saved documents. */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
