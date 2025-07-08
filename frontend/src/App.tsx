import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import StreamsManager from './pages/StreamsManager';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import Navigation from './components/Navigation';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { StreamsProvider } from './contexts/StreamsContext';

// Темная тема для приложения
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
    error: {
      main: '#f44336',
    },
    warning: {
      main: '#ff9800',
    },
    success: {
      main: '#4caf50',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WebSocketProvider>
        <StreamsProvider>
          <Router>
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Navigation />
              <Box component="main" sx={{ flexGrow: 1, p: 3, backgroundColor: '#0a0a0a' }}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/streams" element={<StreamsManager />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Box>
            </Box>
          </Router>
        </StreamsProvider>
      </WebSocketProvider>
    </ThemeProvider>
  );
}

export default App;
