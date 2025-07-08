import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Speed as SpeedIcon,
  ViewList as ViewListIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useStreams } from '../contexts/StreamsContext';
import StatusIndicator from '../components/StatusIndicator';
import VideoStream from '../components/VideoStream';

const Dashboard: React.FC = () => {
  const { isConnected, lastMessage } = useWebSocket();
  const { streams, systemStatus, loading, refreshStreams, refreshStatus, toggleStream } = useStreams();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [activeTab, setActiveTab] = useState(0);
  const isMountedRef = useRef(true);

  const activeStreams = streams.filter(stream => stream.is_running);
  const totalDetections = streams.reduce((sum, stream) => sum + stream.detection_count, 0);
  const totalFrames = streams.reduce((sum, stream) => sum + stream.total_frames, 0);
  const avgFps = streams.length > 0 
    ? streams.reduce((sum, stream) => sum + stream.fps, 0) / streams.length 
    : 0;

  // Автоматическое обновление при получении WebSocket сообщений
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'detection_result' && isMountedRef.current) {
      // Добавляем небольшую задержку для предотвращения множественных обновлений
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          refreshStreams();
          refreshStatus();
          setLastUpdate(new Date());
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [lastMessage, refreshStreams, refreshStatus]);

  // Управление монтированием компонента
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Периодическое обновление статуса только если есть активные потоки
  useEffect(() => {
    if (activeStreams.length > 0) {
      const interval = setInterval(() => {
        if (isMountedRef.current) {
          refreshStatus();
          refreshStreams();
          setLastUpdate(new Date());
        }
      }, 5000); // Обновление каждые 5 секунд только при активных потоках

      return () => clearInterval(interval);
    }
  }, [refreshStatus, refreshStreams, activeStreams.length]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Violence Detection Dashboard
      </Typography>
      
      {/* Connection Status */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Alert 
          severity={isConnected ? "success" : "error"} 
          sx={{ flex: 1 }}
        >
          {isConnected ? "Connected to backend server - Real-time updates enabled" : "Disconnected from backend server"}
        </Alert>
        <StatusIndicator lastUpdate={lastUpdate} isConnected={isConnected} />
      </Box>
      
      {/* System Overview Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <VideocamIcon color="primary" sx={{ mr: 2 }} />
              <Box>
                <Typography variant="h6">{activeStreams.length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Streams
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <WarningIcon color="warning" sx={{ mr: 2 }} />
              <Box>
                <Typography variant="h6">{totalDetections}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Detections
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <CheckCircleIcon color="success" sx={{ mr: 2 }} />
              <Box>
                <Typography variant="h6">
                  {systemStatus.triton_server ? "Online" : "Offline"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Triton Server
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <SpeedIcon color="info" sx={{ mr: 2 }} />
              <Box>
                <Typography variant="h6">{avgFps.toFixed(1)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Avg FPS
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
      
      {/* Tabs for different views */}
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<ViewListIcon />} 
            label="Status Overview" 
            iconPosition="start"
          />
          <Tab 
            icon={<VisibilityIcon />} 
            label="Live Streams" 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Stream Status
              </Typography>
              {loading ? (
                <Box display="flex" justifyContent="center" p={3}>
                  <CircularProgress />
                </Box>
              ) : streams.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No streams configured
                </Typography>
              ) : (
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, 
                  gap: 2,
                  '& .MuiCard-root': {
                    transition: 'all 0.3s ease-in-out',
                  }
                }}>
                  {streams.map(stream => (
                    <Card variant="outlined" key={`${stream.id}-${stream.is_running}-${stream.detection_count}`}>
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {stream.name}
                          </Typography>
                          <Chip
                            label={stream.is_running ? "Running" : "Stopped"}
                            color={stream.is_running ? "success" : "default"}
                            size="small"
                          />
                        </Box>
                        
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          ID: {stream.id}
                        </Typography>
                        
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="body2">FPS: {stream.fps.toFixed(1)}</Typography>
                          <Typography variant="body2">Frames: {stream.total_frames}</Typography>
                        </Box>
                        
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2">Detections: {stream.detection_count}</Typography>
                          {stream.last_detection && (
                            <Chip
                              label={stream.last_detection.is_violence ? "Violence" : "Normal"}
                              color={stream.last_detection.is_violence ? "error" : "success"}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Statistics
              </Typography>
              
              <Box mb={3}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Frames Processed
                </Typography>
                <Typography variant="h4" color="primary">
                  {totalFrames.toLocaleString()}
                </Typography>
              </Box>
              
              <Box mb={3}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  System Uptime
                </Typography>
                <Typography variant="h6">
                  {Math.floor(systemStatus.uptime / 3600)}h {Math.floor((systemStatus.uptime % 3600) / 60)}m
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Streams
                </Typography>
                <Typography variant="h6">
                  {systemStatus.total_streams}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Live Video Streams
          </Typography>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : streams.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No streams configured. Add streams in the Streams Manager to view live video.
            </Typography>
          ) : (
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, 
              gap: 3,
              '& .MuiCard-root': {
                transition: 'all 0.3s ease-in-out',
              }
            }}>
              {streams.map(stream => (
                <VideoStream
                  key={stream.id}
                  streamId={stream.id}
                  streamName={stream.name}
                  isRunning={stream.is_running}
                  detectionResult={stream.last_detection}
                  onToggleStream={toggleStream}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Dashboard; 