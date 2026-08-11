import Seo from '../components/common/Seo';
import PolicyLayout from '../components/legal/PolicyLayout';
import usePolicyVars from '../components/legal/usePolicyVars';

export default function Privacy() {
  const { tx, list } = usePolicyVars();

  return (
    <>
      <Seo
        title={tx('privacy.seoTitle')}
        description={tx('privacy.seoDescription')}
        path="/privacy"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: tx('privacy.seoTitle'),
          description: tx('privacy.seoDescription'),
        }}
      />

      <PolicyLayout
        t={tx}
        breadcrumb={tx('privacy.breadcrumb')}
        heading={tx('privacy.heading')}
        intro={tx('privacy.intro')}
        sections={list('privacy.sections')}
      />
    </>
  );
}
