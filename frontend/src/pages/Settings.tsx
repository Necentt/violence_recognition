import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Alert,
  Divider,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon,
  Telegram as TelegramIcon,
  Science as TestIcon,
} from '@mui/icons-material';

interface TelegramSettings {
  bot_token: string;
  chat_id: string;
  enabled: boolean;
  notification_interval: number;
  max_notifications: number;
  send_thumbnails: boolean;
}

interface SystemSettings {
  // Triton Server Settings
  triton_url: string;
  model_name: string;
  model_version: string;
  
  // Stream Settings
  max_streams: number;
  frame_skip: number;
  confidence_threshold: number;
  
  // Performance Settings
  max_fps: number;
  buffer_size: number;
  enable_gpu: boolean;
  
  // Security Settings
  enable_auth: boolean;
  enable_ssl: boolean;
  allowed_origins: string[];
  
  // Storage Settings
  enable_recording: boolean;
  max_storage_gb: number;
  retention_days: number;
  
  // Telegram Settings
  telegram: TelegramSettings;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    // Triton Server Settings
    triton_url: 'http://localhost:8000',
    model_name: 'bidirectional_lstm',
    model_version: '1',
    
    // Stream Settings
    max_streams: 10,
    frame_skip: 1,
    confidence_threshold: 0.7,
    
    // Performance Settings
    max_fps: 30,
    buffer_size: 100,
    enable_gpu: true,
    
    // Security Settings
    enable_auth: false,
    enable_ssl: false,
    allowed_origins: ['http://localhost:3000'],
    
    // Storage Settings
    enable_recording: false,
    max_storage_gb: 10,
    retention_days: 30,
    
    // Telegram Settings
    telegram: {
      bot_token: '',
      chat_id: '',
      enabled: false,
      notification_interval: 300,
      max_notifications: 5,
      send_thumbnails: true,
    },
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<string | null>(null);

  // Загрузка настроек при монтировании компонента
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8003/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        setError('Failed to load settings');
      }
    } catch (err) {
      setError('Error loading settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8003/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to save settings');
      }
    } catch (err) {
      setError('Error saving settings');
      console.error('Error saving settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    loadSettings();
  };

  const handleTelegramTest = async () => {
    try {
      setLoading(true);
      setTelegramTestResult(null);
      setError(null);
      
      const response = await fetch('http://localhost:8003/api/settings/telegram/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setTelegramTestResult('success');
        setTimeout(() => setTelegramTestResult(null), 5000);
      } else {
        setError(data.detail || 'Telegram test failed');
      }
    } catch (err) {
      setError('Error testing Telegram connection');
      console.error('Error testing Telegram:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTelegramSettings = (field: keyof TelegramSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      telegram: {
        ...prev.telegram,
        [field]: value,
      },
    }));
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Settings</Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={loading}
          >
            Save Settings
          </Button>
        </Box>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {telegramTestResult === 'success' && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Telegram connection test successful!
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
        {/* Triton Server Settings */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <StorageIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Triton Server</Typography>
            </Box>
            
            <TextField
              fullWidth
              label="Triton Server URL"
              value={settings.triton_url}
              onChange={(e) => setSettings({ ...settings, triton_url: e.target.value })}
              margin="normal"
            />
            
            <TextField
              fullWidth
              label="Model Name"
              value={settings.model_name}
              onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
              margin="normal"
            />
            
            <TextField
              fullWidth
              label="Model Version"
              value={settings.model_version}
              onChange={(e) => setSettings({ ...settings, model_version: e.target.value })}
              margin="normal"
            />
          </CardContent>
        </Card>

        {/* Stream Settings */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <SpeedIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Stream Settings</Typography>
            </Box>
            
            <TextField
              fullWidth
              label="Max Streams"
              type="number"
              value={settings.max_streams}
              onChange={(e) => setSettings({ ...settings, max_streams: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 1, max: 50 }}
            />
            
            <TextField
              fullWidth
              label="Frame Skip"
              type="number"
              value={settings.frame_skip}
              onChange={(e) => setSettings({ ...settings, frame_skip: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 1, max: 10 }}
            />
            
            <TextField
              fullWidth
              label="Confidence Threshold"
              type="number"
              value={settings.confidence_threshold}
              onChange={(e) => setSettings({ ...settings, confidence_threshold: parseFloat(e.target.value) })}
              margin="normal"
              inputProps={{ min: 0, max: 1, step: 0.1 }}
            />
          </CardContent>
        </Card>

        {/* Performance Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Performance</Typography>
            
            <TextField
              fullWidth
              label="Max FPS"
              type="number"
              value={settings.max_fps}
              onChange={(e) => setSettings({ ...settings, max_fps: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 1, max: 60 }}
            />
            
            <TextField
              fullWidth
              label="Buffer Size"
              type="number"
              value={settings.buffer_size}
              onChange={(e) => setSettings({ ...settings, buffer_size: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 10, max: 1000 }}
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enable_gpu}
                  onChange={(e) => setSettings({ ...settings, enable_gpu: e.target.checked })}
                />
              }
              label="Enable GPU Acceleration"
            />
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <SecurityIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Security</Typography>
            </Box>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enable_auth}
                  onChange={(e) => setSettings({ ...settings, enable_auth: e.target.checked })}
                />
              }
              label="Enable Authentication"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enable_ssl}
                  onChange={(e) => setSettings({ ...settings, enable_ssl: e.target.checked })}
                />
              }
              label="Enable SSL/TLS"
            />
            
            <TextField
              fullWidth
              label="Allowed Origins"
              value={settings.allowed_origins.join(', ')}
              onChange={(e) => setSettings({ 
                ...settings, 
                allowed_origins: e.target.value.split(',').map(s => s.trim()) 
              })}
              margin="normal"
              helperText="Comma-separated list of allowed origins"
            />
          </CardContent>
        </Card>

        {/* Telegram Settings */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center">
                <TelegramIcon sx={{ mr: 1 }} />
                <Typography variant="h6">Telegram Notifications</Typography>
              </Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<TestIcon />}
                onClick={handleTelegramTest}
                disabled={loading || !settings.telegram.enabled}
              >
                Test
              </Button>
            </Box>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.telegram.enabled}
                  onChange={(e) => updateTelegramSettings('enabled', e.target.checked)}
                />
              }
              label="Enable Telegram Notifications"
            />
            
            <TextField
              fullWidth
              label="Bot Token"
              value={settings.telegram.bot_token}
              onChange={(e) => updateTelegramSettings('bot_token', e.target.value)}
              margin="normal"
              type="password"
              helperText="Get this from @BotFather on Telegram"
            />
            
            <TextField
              fullWidth
              label="Chat ID"
              value={settings.telegram.chat_id}
              onChange={(e) => updateTelegramSettings('chat_id', e.target.value)}
              margin="normal"
              helperText="Your Telegram chat ID or channel ID"
            />
            
            <TextField
              fullWidth
              label="Notification Interval (seconds)"
              type="number"
              value={settings.telegram.notification_interval}
              onChange={(e) => updateTelegramSettings('notification_interval', parseInt(e.target.value))}
              margin="normal"
              inputProps={{ min: 60, max: 3600 }}
              helperText="Time between notifications during ongoing events"
            />
            
            <TextField
              fullWidth
              label="Max Notifications per Event"
              type="number"
              value={settings.telegram.max_notifications}
              onChange={(e) => updateTelegramSettings('max_notifications', parseInt(e.target.value))}
              margin="normal"
              inputProps={{ min: 1, max: 20 }}
              helperText="Maximum number of notifications for a single violence event"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.telegram.send_thumbnails}
                  onChange={(e) => updateTelegramSettings('send_thumbnails', e.target.checked)}
                />
              }
              label="Send Thumbnails with Alerts"
            />
          </CardContent>
        </Card>

        {/* Storage Settings */}
        <Card sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Storage</Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enable_recording}
                  onChange={(e) => setSettings({ ...settings, enable_recording: e.target.checked })}
                />
              }
              label="Enable Video Recording"
            />
            
            <TextField
              fullWidth
              label="Max Storage (GB)"
              type="number"
              value={settings.max_storage_gb}
              onChange={(e) => setSettings({ ...settings, max_storage_gb: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 1, max: 1000 }}
            />
            
            <TextField
              fullWidth
              label="Retention Days"
              type="number"
              value={settings.retention_days}
              onChange={(e) => setSettings({ ...settings, retention_days: parseInt(e.target.value) })}
              margin="normal"
              inputProps={{ min: 1, max: 365 }}
            />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default Settings; 