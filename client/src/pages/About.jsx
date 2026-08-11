import { Link } from 'react-router-dom';

import useSettings from '../settings/useSettings';
import { SITE_URL } from '../utils/constants';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Breadcrumb from '../components/common/Breadcrumb';
import RelatedPolicies from '../components/legal/RelatedPolicies';
import SupportCta from '../components/legal/SupportCta';
import usePolicyVars from '../components/legal/usePolicyVars';

/** A prose block: heading, then a stack of paragraphs from the bundle. */
function Prose({ id, title, paragraphs }) {
  return (
    <section id={id} className="card scroll-mt-28 p-6 sm:p-8">
      <h2 className="mb-4 text-xl font-bold text-ink-900 sm:text-2xl">{title}</h2>
      <div className="space-y-4">
        {paragraphs.map((text, index) => (
          <p key={index} className="max-w-3xl text-sm leading-relaxed text-ink-600">
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}

export default function About() {
  const { tx, list } = usePolicyVars();
  const { siteName, general, logoUrl } = useSettings();

  return (
    <>
      <Seo
        title={tx('about.seoTitle')}
        description={tx('about.seoDescription')}
        path="/about"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: siteName,
          url: SITE_URL,
          ...(logoUrl ? { logo: logoUrl } : {}),
          ...(general.contactEmail || general.contactNumber
            ? {
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  areaServed: 'IN',
                  ...(general.contactEmail ? { email: general.contactEmail } : {}),
                  ...(general.contactNumber ? { telephone: general.contactNumber } : {}),
                },
              }
            : {}),
        }}
      />

      <div className="container-page py-8 lg:py-12">
        <Breadcrumb items={[{ label: tx('about.breadcrumb') }]} className="mb-4" />

        {/* ---------------- Hero ---------------- */}
        <header className="card overflow-hidden">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h1 className="max-w-2xl text-3xl font-black leading-tight text-ink-900 sm:text-4xl">
                {tx('about.heading')}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">
                {tx('about.intro')}
              </p>

              <ul className="mt-6 flex flex-wrap gap-2.5">
                {list('about.heroPoints').map((point) => (
                  <li
                    key={point}
                    className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700"
                  >
                    <Icon name="check" size={13} />
                    {point}
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/products" className="btn-primary px-5 py-2.5">
                  {tx('about.ctaBrowse')}
                  <Icon name="chevronRight" size={16} />
                </Link>
                <Link to="/contact" className="btn-outline px-5 py-2.5">
                  {tx('about.ctaContact')}
                </Link>
              </div>
            </div>

            {/* The brand's own mark, when the admin has uploaded one. */}
            {logoUrl && (
              <div className="hidden w-56 shrink-0 place-items-center rounded-xl bg-ink-50 p-8 lg:grid">
                <img
                  src={logoUrl}
                  alt={siteName}
                  loading="lazy"
                  className="max-h-24 w-full object-contain"
                />
              </div>
            )}
          </div>
        </header>

        <div className="mt-6 space-y-6">
          <Prose id="story" title={tx('about.storyTitle')} paragraphs={list('about.story')} />

          {/* ---------------- Mission ---------------- */}
          <section id="mission" className="card scroll-mt-28 overflow-hidden">
            <div className="flex flex-col gap-5 bg-brand-600 p-6 text-white sm:flex-row sm:items-start sm:p-10">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15">
                <Icon name="award" size={24} />
              </span>
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tx('about.missionTitle')}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-brand-50 sm:text-base">
                  {tx('about.mission')}
                </p>
              </div>
            </div>
          </section>

          {/* ---------------- How we work ---------------- */}
          <section id="pillars" className="scroll-mt-28">
            <h2 className="mb-5 text-xl font-bold text-ink-900 sm:text-2xl">
              {tx('about.pillarsTitle')}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list('about.pillars').map((pillar) => (
                <li key={pillar.title} className="card h-full p-6">
                  <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-600">
                    <Icon name={pillar.icon} size={20} />
                  </span>
                  <h3 className="text-base font-bold text-ink-900">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{pillar.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <Prose id="quality" title={tx('about.qualityTitle')} paragraphs={list('about.quality')} />

          {/* ---------------- Service commitment ---------------- */}
          <section id="service" className="card scroll-mt-28 p-6 sm:p-8">
            <h2 className="mb-5 text-xl font-bold text-ink-900 sm:text-2xl">
              {tx('about.serviceTitle')}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {list('about.service').map((promise) => (
                <li key={promise} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-success">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="text-sm leading-relaxed text-ink-600">{promise}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------------- Languages ---------------- */}
          <section id="languages" className="card scroll-mt-28 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Icon name="globe" size={22} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-900">{tx('about.languagesTitle')}</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-500">
                {tx('about.languagesText')}
              </p>
            </div>
          </section>

          {/* ---------------- Closing CTA ---------------- */}
          <section className="card p-6 text-center sm:p-10">
            <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">{tx('about.ctaTitle')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-500">
              {tx('about.ctaText')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/products" className="btn-primary px-6 py-3">
                {tx('about.ctaBrowse')}
              </Link>
              <Link to="/faq" className="btn-outline px-6 py-3">
                {tx('ui.related.faq')}
              </Link>
            </div>
          </section>
        </div>

        <SupportCta t={tx} />
        <RelatedPolicies t={tx} />
      </div>
    </>
  );
}
