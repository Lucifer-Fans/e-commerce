import { useEffect, useState } from 'react';

import { formatDate } from '../../utils/format';
import { POLICY_LAST_UPDATED } from '../../utils/constants';
import Breadcrumb from '../common/Breadcrumb';
import Icon from '../common/Icon';
import PolicyBlocks from './PolicyBlocks';
import RelatedPolicies from './RelatedPolicies';
import SupportCta from './SupportCta';

/**
 * The shared shell behind Shipping, Returns, Terms, Privacy and Refunds.
 *
 * All five are the same document with different words: a heading, a revision
 * date, a list of numbered sections, a way to jump between them, and a way to
 * reach a human at the end. Rendering them from one component is what keeps them
 * looking like one site rather than five pages written on five different days —
 * and means a change to the layout lands on all of them at once.
 *
 * `sections` comes straight out of `legal.json`; see PolicyBlocks for the block
 * vocabulary each section's body is written in.
 */

/**
 * Which section the reader is currently in, for the sidebar highlight.
 *
 * The top quarter of the viewport is the "reading line": a section counts as
 * current once its heading crosses it, which matches where the eye actually sits
 * and avoids the flicker a mid-screen threshold gives on short sections.
 */
function useActiveSection(idKey) {
  const [active, setActive] = useState('');

  useEffect(() => {
    // Joined rather than passed as an array: the caller derives the ids from its
    // props on every render, and a fresh array would tear the observer down and
    // rebuild it each time.
    const ids = idKey ? idKey.split('|') : [];
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!elements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [idKey]);

  return active;
}

function TableOfContents({ sections, active }) {
  return (
    <ol className="space-y-1">
      {sections.map((section, index) => {
        const isActive = active === section.id;
        return (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={isActive ? 'true' : undefined}
              className={`flex gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-brand-600'
              }`}
            >
              <span className={isActive ? 'text-brand-500' : 'text-ink-400'}>{index + 1}.</span>
              <span>{stripNumber(section.title)}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Terms numbers its own clauses; the contents list supplies its own numbering. */
const stripNumber = (title = '') => title.replace(/^\s*\d+\.\s*/, '');

export default function PolicyLayout({
  t,
  breadcrumb,
  heading,
  intro,
  sections = [],
  highlights = [],
  children,
}) {
  const active = useActiveSection(sections.map((section) => section.id).join('|'));

  return (
    <div id="top" className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: breadcrumb }]} className="mb-4" />

      <header className="mb-8">
        <h1 className="text-3xl font-black text-ink-900 sm:text-4xl">{heading}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-500">{intro}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600">
          <Icon name="clock" size={13} />
          {t('ui.lastUpdated', { date: formatDate(POLICY_LAST_UPDATED) })}
        </p>
      </header>

      {highlights.length > 0 && (
        <ul className="mb-8 grid gap-4 sm:grid-cols-3">
          {highlights.map((item) => (
            <li key={item.title} className="card flex gap-3.5 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Icon name={item.icon} size={19} />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-900">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        {/* ---------------- Contents: collapsed on mobile, pinned on desktop ---------------- */}
        {/* top-28 clears the sticky header (top bar + category strip), the same
            offset the sections use as their scroll margin. */}
        <nav aria-label={t('ui.onThisPage')} className="lg:sticky lg:top-28">
          <details className="card overflow-hidden lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-ink-900">
              {t('ui.onThisPage')}
              <Icon name="chevronDown" size={17} className="shrink-0 text-ink-400" />
            </summary>
            <div className="border-t border-ink-100 p-2">
              <TableOfContents sections={sections} active={active} />
            </div>
          </details>

          {/* Terms runs to twenty clauses — the rail scrolls inside itself rather
              than running off the bottom of a short viewport. */}
          <div className="card hidden max-h-[calc(100vh-9rem)] overflow-y-auto p-4 lg:block">
            <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-ink-900">
              {t('ui.onThisPage')}
            </p>
            <TableOfContents sections={sections} active={active} label={t('ui.onThisPage')} />
          </div>
        </nav>

        {/* ---------------- The document itself ---------------- */}
        <div className="space-y-5">
          {children}

          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              /* Clears the sticky header when a contents link jumps here. */
              className="card scroll-mt-28 p-5 sm:p-7"
            >
              <h2 className="mb-4 text-lg font-bold text-ink-900 sm:text-xl">{section.title}</h2>
              <PolicyBlocks blocks={section.blocks} />
            </section>
          ))}

          <p className="pt-1 text-center lg:hidden">
            <a href="#top" className="text-sm font-semibold text-brand-600 hover:underline">
              {t('ui.backToTop')}
            </a>
          </p>
        </div>
      </div>

      <SupportCta t={t} />
      <RelatedPolicies t={t} />
    </div>
  );
}
