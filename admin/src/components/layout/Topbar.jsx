import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';

import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { logout } from '../../store/authSlice';
import { useRealtimeStatus } from '../../realtime/useRealtime';
import { STOREFRONT_URL } from '../../utils/constants';
import { DRAWER_WIDTH } from './Sidebar';

/**
 * Whether the panel is receiving live updates. Worth surfacing: once the pages stop
 * polling, a silent socket drop would otherwise look like "nothing is happening".
 */
function LiveIndicator() {
  const { connected, admins } = useRealtimeStatus();

  return (
    <Tooltip
      title={
        connected
          ? `Live — updating automatically${admins > 1 ? ` · ${admins} admins online` : ''}`
          : 'Offline — reconnecting. Figures may be out of date.'
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: connected ? 'success.main' : 'text.disabled',
            ...(connected && {
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': { '50%': { opacity: 0.35 } },
            }),
          }}
        />
        <Typography
          fontSize={11}
          fontWeight={600}
          color={connected ? 'success.main' : 'text.disabled'}
          sx={{ display: { xs: 'none', md: 'block' } }}
        >
          {connected ? 'Live' : 'Offline'}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default function Topbar({ onMenuClick }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const [anchor, setAnchor] = useState(null);

  const handleLogout = async () => {
    setAnchor(null);
    await dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="inherit"
      sx={{
        width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { lg: `${DRAWER_WIDTH}px` },
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton edge="start" onClick={onMenuClick} sx={{ display: { lg: 'none' } }} aria-label="Open menu">
          <MenuIcon />
        </IconButton>

        <Box sx={{ flexGrow: 1 }} />

        <LiveIndicator />

        <Tooltip title="Reload data">
          <IconButton onClick={() => window.location.reload()} aria-label="Reload">
            <RefreshIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Open storefront">
          <IconButton component="a" href={STOREFRONT_URL} target="_blank" rel="noreferrer" aria-label="Open storefront">
            <OpenInNewIcon />
          </IconButton>
        </Tooltip>

        <Box
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, ml: 1, cursor: 'pointer' }}
          role="button"
          aria-haspopup="menu"
        >
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14, fontWeight: 700 }}>
            {user?.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.2 }}>
            <Typography fontSize={13} fontWeight={700} noWrap>
              {user?.name}
            </Typography>
            <Typography fontSize={11} color="text.secondary" noWrap>
              Administrator
            </Typography>
          </Box>
        </Box>

        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 230, mt: 1 } } }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography fontSize={13} fontWeight={700} noWrap>
              {user?.name}
            </Typography>
            <Typography fontSize={12} color="text.secondary" noWrap>
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" color="error" />
            </ListItemIcon>
            Log out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
