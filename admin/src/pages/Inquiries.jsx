import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import MailIcon from '@mui/icons-material/MailOutline';
import DraftsIcon from '@mui/icons-material/DraftsOutlined';
import NewsletterIcon from '@mui/icons-material/MarkEmailReadOutlined';
import WorkIcon from '@mui/icons-material/WorkOutline';

import { inquiryApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { INQUIRY_EVENTS, CAREER_EVENTS, NEWSLETTER_EVENTS } from '../realtime/events';
import { formatNumber } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import ContactMessagesTab from '../components/inquiries/ContactMessagesTab';
import NewsletterTab from '../components/inquiries/NewsletterTab';
import CareerApplicationsTab from '../components/inquiries/CareerApplicationsTab';

const TABS = ['messages', 'newsletter', 'careers'];

/**
 * Everything the storefront's public forms produce, in one place: contact-us
 * enquiries, newsletter sign-ups and job applications.
 *
 * The active tab lives in the URL so an admin notification can deep-link straight to
 * "/inquiries?tab=careers" and a refresh keeps the reader where they were.
 */
export default function Inquiries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'messages';

  const statsQuery = useFetch(useCallback(() => inquiryApi.stats(), []), []);
  useLiveRefetch(statsQuery.refetch, [...INQUIRY_EVENTS, ...NEWSLETTER_EVENTS, ...CAREER_EVENTS]);

  const stats = statsQuery.data?.data?.stats || {};

  const selectTab = (_event, value) => {
    setSearchParams(value === 'messages' ? {} : { tab: value }, { replace: true });
  };

  return (
    <Box>
      <PageHeader
        title="Inbox"
        subtitle="Enquiries and job applications submitted through the website."
        breadcrumbs={[{ label: 'Inquiries' }]}
      />

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Contact Us Messages"
            value={formatNumber(stats.total)}
            icon={<MailIcon />}
            color="primary"
            caption="Contact form submissions"
            loading={statsQuery.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Unread Messages"
            value={formatNumber(stats.unread)}
            icon={<DraftsIcon />}
            color="warning"
            caption="Waiting to be opened"
            loading={statsQuery.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Newsletter Emails"
            value={formatNumber(stats.activeSubscribers)}
            icon={<NewsletterIcon />}
            color="info"
            // The headline is active subscribers; the total only differs once
            // somebody opts out, so it is only worth printing when it does.
            caption={
              stats.subscribers > stats.activeSubscribers
                ? `${formatNumber(stats.subscribers - stats.activeSubscribers)} unsubscribed`
                : 'Active subscribers'
            }
            loading={statsQuery.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Career Applications"
            value={formatNumber(stats.careerApplications)}
            icon={<WorkIcon />}
            color="success"
            caption={`${formatNumber(stats.newApplications)} not yet reviewed`}
            loading={statsQuery.loading}
          />
        </Grid>
      </Grid>

      <Card sx={{ mb: 2.5 }}>
        <Tabs value={tab} onChange={selectTab} variant="scrollable" scrollButtons="auto">
          <Tab value="messages" label="Contact Us Messages" sx={{ fontWeight: 700, py: 2 }} />
          <Tab value="newsletter" label="Newsletter Emails" sx={{ fontWeight: 700, py: 2 }} />
          <Tab value="careers" label="Careers" sx={{ fontWeight: 700, py: 2 }} />
        </Tabs>
      </Card>

      {/* Unmounting the hidden tabs keeps their filters and polling out of the way. */}
      {tab === 'messages' && <ContactMessagesTab onCountsChanged={statsQuery.refetch} />}
      {tab === 'newsletter' && <NewsletterTab onCountsChanged={statsQuery.refetch} />}
      {tab === 'careers' && <CareerApplicationsTab onCountsChanged={statsQuery.refetch} />}
    </Box>
  );
}
