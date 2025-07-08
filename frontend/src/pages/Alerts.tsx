import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  Grid,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface Alert {
  id: number;
  type: 'violence' | 'error' | 'info' | 'warning';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
  stream_id?: string;
  detection_id?: number;
}

interface Detection {
  id: number;
  stream_id: string;
  timestamp: string;
  is_violence: boolean;
  confidence: number;
  frame_data?: string;
  processed: boolean;
  acknowledged: boolean;
  created_at: string;
}

interface Statistics {
  period_days: number;
  total_detections: number;
  violence_detections: number;
  violence_percentage: number;
  stream_statistics: Array<{
    stream_id: string;
    name: string;
    total_detections: number;
    violence_detections: number;
  }>;
  total_alerts: number;
  unacknowledged_alerts: number;
}

const Alerts: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  
  // Фильтры
  const [alertType, setAlertType] = useState<string>('');
  const [acknowledged, setAcknowledged] = useState<string>('');
  const [detectionType, setDetectionType] = useState<string>('');
  const [streamFilter, setStreamFilter] = useState<string>('');
  
  // Пагинация
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const [settings, setSettings] = useState({
    soundEnabled: true,
    pushEnabled: false,
    emailEnabled: false,
    confidenceThreshold: 0.7,
  });

  // Загрузка настроек системы
  const loadSystemSettings = async () => {
    try {
      const response = await axios.get('http://localhost:8003/api/settings');
      const systemSettings = response.data;
      setSettings(prev => ({
        ...prev,
        confidenceThreshold: systemSettings.confidence_threshold
      }));
    } catch (error) {
      console.error('Error loading system settings:', error);
    }
  };

  // Сохранение настроек системы
  const saveSystemSettings = async () => {
    try {
      const response = await axios.get('http://localhost:8003/api/settings');
      const systemSettings = response.data;
      
      // Обновляем только confidence_threshold
      systemSettings.confidence_threshold = settings.confidenceThreshold;
      
      await axios.post('http://localhost:8003/api/settings', systemSettings);
      console.log('System settings updated successfully');
    } catch (error) {
      console.error('Error saving system settings:', error);
    }
  };

  // Загрузка данных
  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      
      if (alertType) params.append('alert_type', alertType);
      if (acknowledged !== '') params.append('acknowledged', acknowledged);
      
      const response = await axios.get(`http://localhost:8003/api/alerts?${params}`);
      setAlerts(response.data.alerts);
      setTotalPages(Math.ceil(response.data.alerts.length / limit));
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDetections = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      
      if (detectionType !== '') params.append('is_violence', detectionType);
      if (streamFilter) params.append('stream_id', streamFilter);
      
      const response = await axios.get(`http://localhost:8003/api/detections/history?${params}`);
      setDetections(response.data.detections);
      setTotalPages(Math.ceil(response.data.detections.length / limit));
    } catch (error) {
      console.error('Error loading detections:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await axios.get('http://localhost:8003/api/statistics?days=7');
      setStatistics(response.data);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  useEffect(() => {
    // Загружаем настройки системы при монтировании
    loadSystemSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 0) {
      loadAlerts();
    } else if (activeTab === 1) {
      loadDetections();
    } else if (activeTab === 2) {
      loadStatistics();
    }
  }, [activeTab, page, alertType, acknowledged, detectionType, streamFilter]);

  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      await axios.post(`http://localhost:8003/api/alerts/${alertId}/acknowledge`);
      loadAlerts(); // Перезагружаем список
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const handleAcknowledgeDetection = async (detectionId: number) => {
    try {
      await axios.post(`http://localhost:8003/api/detections/${detectionId}/acknowledge`);
      loadDetections(); // Перезагружаем список
    } catch (error) {
      console.error('Error acknowledging detection:', error);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'violence':
        return <ErrorIcon color="error" />;
      case 'error':
        return <WarningIcon color="warning" />;
      default:
        return <InfoIcon color="info" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'violence':
        return 'error';
      case 'error':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const renderAlertsTab = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Alerts</Typography>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              label="Type"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="violence">Violence</MenuItem>
              <MenuItem value="error">Error</MenuItem>
              <MenuItem value="warning">Warning</MenuItem>
              <MenuItem value="info">Info</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={acknowledged}
              onChange={(e) => setAcknowledged(e.target.value)}
              label="Status"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="false">Unacknowledged</MenuItem>
              <MenuItem value="true">Acknowledged</MenuItem>
            </Select>
          </FormControl>
          
          <IconButton onClick={loadAlerts}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No alerts found
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <List>
          {alerts.map(alert => (
            <ListItem
              key={alert.id}
              divider
              sx={{
                backgroundColor: alert.acknowledged ? 'transparent' : 'rgba(244, 67, 54, 0.1)',
              }}
            >
              <ListItemIcon>
                {getAlertIcon(alert.type)}
              </ListItemIcon>
              
              <ListItemText
                primary={alert.message}
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(alert.created_at)}
                    </Typography>
                    {alert.stream_id && (
                      <Typography variant="body2" color="text.secondary">
                        Stream: {alert.stream_id}
                      </Typography>
                    )}
                    {alert.acknowledged && (
                      <Typography variant="body2" color="text.secondary">
                        Acknowledged by: {alert.acknowledged_by} at {formatDate(alert.acknowledged_at!)}
                      </Typography>
                    )}
                  </Box>
                }
              />
              
              <Box display="flex" alignItems="center" gap={1}>
                <Chip
                  label={alert.type.toUpperCase()}
                  color={getAlertColor(alert.type) as any}
                  size="small"
                />
                <Chip
                  label={alert.severity.toUpperCase()}
                  color={getSeverityColor(alert.severity) as any}
                  size="small"
                />
                
                {!alert.acknowledged && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                  >
                    Acknowledge
                  </Button>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      )}
      
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
          />
        </Box>
      )}
    </Box>
  );

  const renderDetectionsTab = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Detection History</Typography>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={detectionType}
              onChange={(e) => setDetectionType(e.target.value)}
              label="Type"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Violence</MenuItem>
              <MenuItem value="false">No Violence</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            size="small"
            label="Stream ID"
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          />
          
          <IconButton onClick={loadDetections}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : detections.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No detections found
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <List>
          {detections.map(detection => (
            <ListItem
              key={detection.id}
              divider
              sx={{
                backgroundColor: detection.is_violence ? 'rgba(244, 67, 54, 0.1)' : 'transparent',
              }}
            >
              <ListItemIcon>
                {detection.is_violence ? (
                  <ErrorIcon color="error" />
                ) : (
                  <CheckCircleIcon color="success" />
                )}
              </ListItemIcon>
              
              <ListItemText
                primary={`Detection in stream ${detection.stream_id}`}
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(detection.timestamp)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Confidence: {(detection.confidence * 100).toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Status: {detection.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
                    </Typography>
                  </Box>
                }
              />
              
              <Box display="flex" alignItems="center" gap={1}>
                <Chip
                  label={detection.is_violence ? 'VIOLENCE' : 'SAFE'}
                  color={detection.is_violence ? 'error' : 'success'}
                  size="small"
                />
                
                {detection.frame_data && (
                  <Tooltip title="View frame">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelectedDetection(detection);
                        setImageDialogOpen(true);
                      }}
                    >
                      <VisibilityIcon />
                    </IconButton>
                  </Tooltip>
                )}
                
                {!detection.acknowledged && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleAcknowledgeDetection(detection.id)}
                  >
                    Acknowledge
                  </Button>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      )}
      
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
          />
        </Box>
      )}
    </Box>
  );

  const renderStatisticsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>Statistics (Last 7 Days)</Typography>
      
      {statistics ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Overall Statistics</Typography>
              <Box>
                <Typography variant="body1">
                  Total Detections: {statistics.total_detections}
                </Typography>
                <Typography variant="body1">
                  Violence Detections: {statistics.violence_detections}
                </Typography>
                <Typography variant="body1">
                  Violence Percentage: {statistics.violence_percentage.toFixed(1)}%
                </Typography>
                <Typography variant="body1">
                  Total Alerts: {statistics.total_alerts}
                </Typography>
                <Typography variant="body1">
                  Unacknowledged Alerts: {statistics.unacknowledged_alerts}
                </Typography>
                <Typography variant="body1" sx={{ mt: 2, fontWeight: 'bold' }}>
                  Current Confidence Threshold: {(settings.confidenceThreshold * 100).toFixed(0)}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Stream Statistics</Typography>
              {statistics.stream_statistics.map(stream => (
                <Box key={stream.stream_id} mb={2}>
                  <Typography variant="subtitle1">{stream.name || stream.stream_id}</Typography>
                  <Typography variant="body2">
                    Total: {stream.total_detections} | Violence: {stream.violence_detections}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Alerts & History</Typography>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </Button>
      </Box>

      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
        <Tab label="Alerts" />
        <Tab label="Detection History" />
        <Tab label="Statistics" />
      </Tabs>

      {activeTab === 0 && renderAlertsTab()}
      {activeTab === 1 && renderDetectionsTab()}
      {activeTab === 2 && renderStatisticsTab()}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Alert Settings</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={
              <Switch
                checked={settings.soundEnabled}
                onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
              />
            }
            label="Sound Notifications"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={settings.pushEnabled}
                onChange={(e) => setSettings({ ...settings, pushEnabled: e.target.checked })}
              />
            }
            label="Push Notifications"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={settings.emailEnabled}
                onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
              />
            }
            label="Email Notifications"
          />
          
          <TextField
            fullWidth
            label="Confidence Threshold"
            type="number"
            value={settings.confidenceThreshold}
            onChange={(e) => setSettings({ 
              ...settings, 
              confidenceThreshold: parseFloat(e.target.value) 
            })}
            margin="normal"
            inputProps={{ min: 0, max: 1, step: 0.1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              saveSystemSettings();
              setSettingsOpen(false);
            }} 
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Dialog */}
      <Dialog 
        open={imageDialogOpen} 
        onClose={() => setImageDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Detection Frame</DialogTitle>
        <DialogContent>
          {selectedDetection?.frame_data && (
            <Box display="flex" justifyContent="center">
              <img
                src={`data:image/jpeg;base64,${selectedDetection.frame_data}`}
                alt="Detection frame"
                style={{ maxWidth: '100%', maxHeight: '400px' }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Alerts; 