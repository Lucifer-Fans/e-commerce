import Seo from '../components/common/Seo';
import PolicyLayout from '../components/legal/PolicyLayout';
import usePolicyVars from '../components/legal/usePolicyVars';

export default function Returns() {
  const { tx, list } = usePolicyVars();

  return (
    <>
      <Seo
        title={tx('returns.seoTitle')}
        description={tx('returns.seoDescription')}
        path="/returns"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: tx('returns.seoTitle'),
          description: tx('returns.seoDescription'),
        }}
      />

      <PolicyLayout
        t={tx}
        breadcrumb={tx('returns.breadcrumb')}
        heading={tx('returns.heading')}
        intro={tx('returns.intro')}
        highlights={list('returns.highlights')}
        sections={list('returns.sections')}
      />
    </>
  );
}
