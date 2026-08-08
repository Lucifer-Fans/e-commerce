/**
 * Verifies every translation bundle against the English source of truth.
 *
 *   npm run check:locales
 *
 * A namespace a language hasn't translated yet is fine — it simply isn't listed,
 * and i18next falls back to English at runtime. What is *not* fine is a namespace
 * that exists but has drifted: a missing key silently falls back mid-sentence, a
 * stray key is dead weight, and a dropped `{{placeholder}}` renders a price or a
 * name as literal text. Those three are what this catches.
 *
 * Exits non-zero on drift so it can gate CI.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] || 'src/i18n/locales';
const BASE = 'en';

const flatten = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
};

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const placeholders = (s) => new Set([...String(s).matchAll(PLACEHOLDER)].map((m) => m[1]));

const namespaces = readdirSync(join(ROOT, BASE)).filter((f) => f.endsWith('.json'));
const languages = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let problems = 0;

for (const lang of languages) {
  const present = [];
  for (const ns of namespaces) {
    const file = join(ROOT, lang, ns);
    if (!existsSync(file)) continue;
    present.push(ns.replace('.json', ''));

    const base = flatten(JSON.parse(readFileSync(join(ROOT, BASE, ns), 'utf8')));
    const target = flatten(JSON.parse(readFileSync(file, 'utf8')));

    const missing = [...base.keys()].filter((k) => !target.has(k));
    const extra = [...target.keys()].filter((k) => !base.has(k));

    // A translated string that drops or renames an interpolation silently breaks.
    const badVars = [...target.entries()]
      .filter(([k]) => base.has(k))
      .filter(([k, v]) => {
        const a = placeholders(base.get(k));
        const b = placeholders(v);
        return a.size !== b.size || [...a].some((x) => !b.has(x));
      })
      .map(([k]) => k);

    if (missing.length || extra.length || badVars.length) {
      problems++;
      console.log(`\n${lang}/${ns}`);
      if (missing.length) console.log('  missing:', missing.join(', '));
      if (extra.length) console.log('  extra:  ', extra.join(', '));
      if (badVars.length) console.log('  vars:   ', badVars.join(', '));
    }
  }
  console.log(`${lang.padEnd(4)} → ${present.join(', ') || '(none)'}`);
}

if (problems) {
  console.error(`\n${problems} namespace(s) drifted from English.`);
  process.exit(1);
}
console.log('\nAll present namespaces match English exactly.');
