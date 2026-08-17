import { NavLink, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';

import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import InventoryIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryIcon from '@mui/icons-material/AccountTreeOutlined';
import BrandIcon from '@mui/icons-material/SellOutlined';
import OrdersIcon from '@mui/icons-material/ReceiptLongOutlined';
import ReasonIcon from '@mui/icons-material/RuleOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import InquiryIcon from '@mui/icons-material/ForumOutlined';
import BannerIcon from '@mui/icons-material/SlideshowOutlined';
import CouponIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';

import { APP_NAME } from '../../utils/constants';

export const DRAWER_WIDTH = 252;

const NAV_GROUPS = [
  {
    heading: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: <DashboardIcon />, end: true }],
  },
  {
    heading: 'Catalogue',
    items: [
      { to: '/products', label: 'Products', icon: <InventoryIcon /> },
      { to: '/categories', label: 'Categories', icon: <CategoryIcon /> },
      { to: '/brands', label: 'Brands', icon: <BrandIcon /> },
      { to: '/banners', label: 'Banners', icon: <BannerIcon /> },
      { to: '/coupons', label: 'Coupons', icon: <CouponIcon /> },
    ],
  },
  {
    heading: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders', icon: <OrdersIcon /> },
      { to: '/reasons', label: 'Reasons', icon: <ReasonIcon /> },
      { to: '/users', label: 'Users', icon: <PeopleIcon /> },
      { to: '/inquiries', label: 'Inquiries', icon: <InquiryIcon /> },
    ],
  },
  {
    heading: 'System',
    items: [{ to: '/settings', label: 'Organization', icon: <SettingsIcon /> }],
  },
];

function NavContent({ onNavigate }) {
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0f172a', color: '#fff' }}>
      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 38,
            height: 38,
            borderRadius: 2,
            bgcolor: 'primary.main',
            fontWeight: 900,
            fontSize: 19,
          }}
        >
          P
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} fontSize={14} noWrap>
            {APP_NAME}
          </Typography>
          <Typography fontSize={11} sx={{ color: 'rgba(255,255,255,.55)' }}>
            Control panel
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />

      {/* The theme's slate scrollbar thumb is tuned for light cards and all but
          disappears on this navy panel, so the nav inverts it: a translucent
          white bar at the same width, brightening on hover exactly as the light
          one darkens. */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          py: 1,
          scrollbarColor: 'rgba(255,255,255,.22) transparent',
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(255,255,255,.22)' },
          '&::-webkit-scrollbar-thumb:hover': { backgroundColor: 'rgba(255,255,255,.38)' },
        }}
      >
        {NAV_GROUPS.map((group) => (
          <Box key={group.heading} sx={{ mb: 1 }}>
            <Typography
              sx={{
                px: 2.5,
                py: 1,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.4)',
              }}
            >
              {group.heading}
            </Typography>

            <List dense disablePadding>
              {group.items.map((item) => {
                // NavLink's own isActive would light up "Products" while on "/products/new";
                // that's the behaviour we want, so we derive it the same way.
                const active = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);

                return (
                  <ListItemButton
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    onClick={onNavigate}
                    sx={{
                      mx: 1.25,
                      mb: 0.25,
                      borderRadius: 2,
                      color: active ? '#fff' : 'rgba(255,255,255,.68)',
                      bgcolor: active ? 'primary.main' : 'transparent',
                      '&:hover': { bgcolor: active ? 'primary.dark' : 'rgba(255,255,255,.07)' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 500 }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />

      <Box sx={{ p: 2 }}>
        <Chip
          label="v1.0.0"
          size="small"
          sx={{ ml: 1, bgcolor: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.6)' }}
        />
      </Box>
    </Box>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}>
      {/* Temporary drawer on small screens, permanent from lg up. */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 0 },
        }}
      >
        <NavContent onNavigate={onClose} />
      </Drawer>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', lg: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 0 },
        }}
      >
        <NavContent />
      </Drawer>
    </Box>
  );
}
