import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Videocam as VideocamIcon,
  Warning as WarningIcon,
  Settings as SettingsIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';

const drawerWidth = 240;

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected } = useWebSocket();

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Streams', icon: <VideocamIcon />, path: '/streams' },
    { text: 'Alerts', icon: <WarningIcon />, path: '/alerts' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#1a1a1a',
          borderRight: '1px solid #333',
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid #333' }}>
        <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 600 }}>
          Violence Detection
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {isConnected ? (
            <>
              <WifiIcon sx={{ color: 'success.main', fontSize: 16 }} />
              <Chip 
                label="Connected" 
                size="small" 
                color="success" 
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            </>
          ) : (
            <>
              <WifiOffIcon sx={{ color: 'error.main', fontSize: 16 }} />
              <Chip 
                label="Disconnected" 
                size="small" 
                color="error" 
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            </>
          )}
        </Box>
      </Box>
      
      <List sx={{ pt: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                mx: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                },
              }}
            >
              <ListItemIcon sx={{ color: location.pathname === item.path ? 'white' : 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text} 
                sx={{ 
                  '& .MuiListItemText-primary': {
                    fontWeight: location.pathname === item.path ? 600 : 400,
                  }
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Navigation; 