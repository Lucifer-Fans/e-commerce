import Seo from '../components/common/Seo';
import PolicyLayout from '../components/legal/PolicyLayout';
import usePolicyVars from '../components/legal/usePolicyVars';

export default function ShippingPolicy() {
  const { tx, list } = usePolicyVars();

  return (
    <>
      <Seo
        title={tx('shipping.seoTitle')}
        description={tx('shipping.seoDescription')}
        path="/shipping-policy"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: tx('shipping.seoTitle'),
          description: tx('shipping.seoDescription'),
        }}
      />

      <PolicyLayout
        t={tx}
        breadcrumb={tx('shipping.breadcrumb')}
        heading={tx('shipping.heading')}
        intro={tx('shipping.intro')}
        sections={list('shipping.sections')}
      />
    </>
  );
}
