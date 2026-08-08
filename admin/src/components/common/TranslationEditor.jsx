import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';

import { TRANSLATABLE_LANGUAGES } from '../../utils/languages';

/**
 * Per-language editor for catalogue copy.
 *
 * One tab per language, and every input sits directly under the English it
 * replaces — a translator should never have to hold the source in their head or
 * flip between screens. Anything left blank falls back to English at render time,
 * so a partly-filled language is a valid, shippable state rather than a broken one.
 *
 * Arrays (highlights, spec rows, FAQs) are matched by position against the English
 * list and are read-only in shape: rows can be translated but not added, removed or
 * reordered here, because the storefront overlays them positionally.
 *
 * @param {object}   value    the whole `translations` object, keyed by language
 * @param {Function} onChange receives the next `translations` object
 * @param {Array}    fields   [{ name, label, source, multiline, rows }]
 * @param {Array}    lists    [{ name, label, source, keys?: [string, string] }]
 */
export default function TranslationEditor({ value, onChange, fields = [], lists = [] }) {
  const [active, setActive] = useState(TRANSLATABLE_LANGUAGES[0].code);
  const current = value?.[active] || {};

  /** How many of this language's translatable slots are filled — shown on each tab. */
  const filledCount = useMemo(() => {
    const counts = {};
    for (const { code } of TRANSLATABLE_LANGUAGES) {
      const t = value?.[code] || {};
      let n = 0;
      for (const f of fields) if (t[f.name]?.trim?.()) n += 1;
      for (const l of lists) if (Array.isArray(t[l.name]) && t[l.name].some(Boolean)) n += 1;
      counts[code] = n;
    }
    return counts;
  }, [value, fields, lists]);

  const total = fields.length + lists.length;

  const setField = (name, next) =>
    onChange({ ...value, [active]: { ...current, [name]: next } });

  const setListItem = (name, index, next) => {
    const list = [...(current[name] || [])];
    list[index] = next;
    setField(name, list);
  };

  return (
    <Box>
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Anything you leave blank falls back to the English text, so you can translate a
        few fields now and the rest later. Brand names, SKUs and web addresses are
        never translated — the storefront matches on them.
      </Alert>

      <Tabs
        value={active}
        onChange={(_e, code) => setActive(code)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}
      >
        {TRANSLATABLE_LANGUAGES.map((lang) => (
          <Tab
            key={lang.code}
            value={lang.code}
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>{lang.native}</span>
                <Chip
                  size="small"
                  label={`${filledCount[lang.code]}/${total}`}
                  color={filledCount[lang.code] === total ? 'success' : 'default'}
                  variant={filledCount[lang.code] ? 'filled' : 'outlined'}
                  sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
                />
              </Stack>
            }
          />
        ))}
      </Tabs>

      <Stack spacing={2.5}>
        {fields.map((field) => (
          <Box key={field.name}>
            <TextField
              fullWidth
              size="small"
              label={field.label}
              value={current[field.name] || ''}
              onChange={(e) => setField(field.name, e.target.value)}
              multiline={field.multiline}
              minRows={field.rows || (field.multiline ? 3 : undefined)}
              placeholder={field.source || ''}
            />
            {field.source ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, pl: 0.5 }}
              >
                English: {field.source}
              </Typography>
            ) : null}
          </Box>
        ))}

        {lists.map((list) => {
          const source = list.source || [];
          if (!source.length) return null;

          return (
            <Box key={list.name}>
              <Divider sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="text.secondary">
                  {list.label}
                </Typography>
              </Divider>

              <Stack spacing={2}>
                {source.map((item, index) => {
                  const translated = current[list.name]?.[index];

                  // A pair row (spec key/value, FAQ question/answer) vs a plain string.
                  if (list.keys) {
                    const [a, b] = list.keys;
                    return (
                      <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <TextField
                          size="small"
                          sx={{ flex: 1 }}
                          label={`${a} ${index + 1}`}
                          value={translated?.[a] || ''}
                          onChange={(e) =>
                            setListItem(list.name, index, { ...translated, [a]: e.target.value })
                          }
                          placeholder={item?.[a] || ''}
                          helperText={item?.[a] ? `English: ${item[a]}` : ' '}
                        />
                        <TextField
                          size="small"
                          sx={{ flex: 2 }}
                          label={`${b} ${index + 1}`}
                          value={translated?.[b] || ''}
                          onChange={(e) =>
                            setListItem(list.name, index, { ...translated, [b]: e.target.value })
                          }
                          placeholder={item?.[b] || ''}
                          helperText={item?.[b] ? `English: ${item[b]}` : ' '}
                        />
                      </Stack>
                    );
                  }

                  return (
                    <TextField
                      key={index}
                      fullWidth
                      size="small"
                      label={`${list.label} ${index + 1}`}
                      value={translated || ''}
                      onChange={(e) => setListItem(list.name, index, e.target.value)}
                      placeholder={item || ''}
                      helperText={item ? `English: ${item}` : ' '}
                    />
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
