import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import { cancellationReasonApi, deactivationReasonApi } from '../api/endpoints';
import { EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import ReasonsTab from '../components/reasons/ReasonsTab';

const TABS = ['cancellation', 'deactivation'];

/**
 * Every picklist the storefront asks a customer to choose from, in one place.
 *
 * They were two screens' worth of identical table until there were two of them;
 * an admin curating "why customers leave" and "why orders are cancelled" is doing
 * the same job twice, and splitting that across two sidebar entries buries the
 * newer list where nobody looks for it. The tab lives in the URL for the same
 * reason the Inbox's does — a deep link and a refresh both keep the reader where
 * they were.
 */
const COPY = {
  cancellation: {
    fieldHelper: 'Shown as an option in the storefront cancel dialog',
    orderHelper: 'Its place in the storefront cancel dialog',
    orderTooltip: "The sequence this reason appears in on the storefront's cancel dialog",
    intro: (
      <>
        Shoppers pick from this list when cancelling an order, and can always write their own under
        &ldquo;Other&rdquo;. <strong>Display order</strong> sets the sequence they appear in on the
        storefront cancel dialog. Changes here affect future cancellations only — an order that has
        already been cancelled keeps the reason it was given.
      </>
    ),
    emptyTitle: 'No cancellation reasons',
    emptyMessage: "Add a reason and it will appear in the storefront's cancel dialog.",
    deleteMessage: (label) =>
      `"${label}" will stop being offered. Orders already cancelled for this reason are unaffected.`,
  },
  deactivation: {
    fieldHelper: 'Shown as an option in the account deactivation dialog',
    orderHelper: 'Its place in the account deactivation dialog',
    orderTooltip: 'The sequence this reason appears in when a customer closes their account',
    intro: (
      <>
        Customers pick from this list when deactivating their own account, and can always write
        their own under &ldquo;Other&rdquo;. The chosen reason is stored on the account and shown to
        you on any reactivation request that follows. Changes here affect future deactivations only
        — an account already closed keeps the reason it was given.
      </>
    ),
    emptyTitle: 'No deactivation reasons',
    emptyMessage: 'Add a reason and it will appear in the account deactivation dialog.',
    deleteMessage: (label) =>
      `"${label}" will stop being offered. Accounts already deactivated for this reason are unaffected.`,
  },
};

export default function Reasons() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'cancellation';

  const selectTab = (_event, value) => {
    setSearchParams(value === 'cancellation' ? {} : { tab: value }, { replace: true });
  };

  return (
    <Box>
      <PageHeader
        title="Reasons"
        subtitle="The picklists customers choose from when cancelling an order or deactivating their account."
        breadcrumbs={[{ label: 'Reasons' }]}
      />

      <Card sx={{ mb: 2.5 }}>
        <Tabs value={tab} onChange={selectTab} variant="scrollable" scrollButtons="auto">
          <Tab value="cancellation" label="Order Cancellation" sx={{ fontWeight: 700, py: 2 }} />
          <Tab value="deactivation" label="Account Deactivation" sx={{ fontWeight: 700, py: 2 }} />
        </Tabs>
      </Card>

      {/* Unmounting the hidden tab keeps its fetch and its live subscription out
          of the way, exactly as the Inbox does. */}
      {tab === 'cancellation' && (
        <ReasonsTab
          api={cancellationReasonApi}
          event={EVENTS.CANCELLATION_REASON_CHANGED}
          copy={COPY.cancellation}
        />
      )}
      {tab === 'deactivation' && (
        <ReasonsTab
          api={deactivationReasonApi}
          event={EVENTS.DEACTIVATION_REASON_CHANGED}
          copy={COPY.deactivation}
        />
      )}
    </Box>
  );
}
