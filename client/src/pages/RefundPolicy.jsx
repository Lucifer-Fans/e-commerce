import Seo from '../components/common/Seo';
import PolicyLayout from '../components/legal/PolicyLayout';
import usePolicyVars from '../components/legal/usePolicyVars';

export default function RefundPolicy() {
  const { tx, list } = usePolicyVars();

  return (
    <>
      <Seo
        title={tx('refund.seoTitle')}
        description={tx('refund.seoDescription')}
        path="/refund-policy"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: tx('refund.seoTitle'),
          description: tx('refund.seoDescription'),
        }}
      />

      <PolicyLayout
        t={tx}
        breadcrumb={tx('refund.breadcrumb')}
        heading={tx('refund.heading')}
        intro={tx('refund.intro')}
        highlights={list('refund.highlights')}
        sections={list('refund.sections')}
      />
    </>
  );
}
