import Seo from '../components/common/Seo';
import PolicyLayout from '../components/legal/PolicyLayout';
import usePolicyVars from '../components/legal/usePolicyVars';

export default function Terms() {
  const { tx, list } = usePolicyVars();

  return (
    <>
      <Seo
        title={tx('terms.seoTitle')}
        description={tx('terms.seoDescription')}
        path="/terms"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: tx('terms.seoTitle'),
          description: tx('terms.seoDescription'),
        }}
      />

      <PolicyLayout
        t={tx}
        breadcrumb={tx('terms.breadcrumb')}
        heading={tx('terms.heading')}
        intro={tx('terms.intro')}
        sections={list('terms.sections')}
      />
    </>
  );
}
