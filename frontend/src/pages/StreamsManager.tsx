import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useStreams } from '../contexts/StreamsContext';
import { useWebSocket } from '../contexts/WebSocketContext';

const StreamsManager: React.FC = () => {
  const { streams, loading, error, addStream, removeStream, startStream, stopStream, refreshStreams } = useStreams();
  const { lastMessage } = useWebSocket();
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    url: '',
    name: '',
  });

  // Автоматическое обновление при получении WebSocket сообщений
  useEffect(() => {
    if (lastMessage && (lastMessage.type === 'detection_result' || lastMessage.type === 'streams_status')) {
      refreshStreams();
    }
  }, [lastMessage, refreshStreams]);

  // Периодическое обновление статуса потоков только если есть потоки
  useEffect(() => {
    if (streams.length > 0) {
      const interval = setInterval(() => {
        refreshStreams();
      }, 8000); // Обновление каждые 8 секунд только при наличии потоков

      return () => clearInterval(interval);
    }
  }, [refreshStreams, streams.length]);

  const handleAddStream = async () => {
    if (formData.id && formData.url) {
      try {
        await addStream({
          id: formData.id,
          url: formData.url,
          name: formData.name,
          enabled: true,
        });
        setFormData({ id: '', url: '', name: '' });
        setOpenDialog(false);
      } catch (err) {
        console.error('Failed to add stream:', err);
      }
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Streams Manager</Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refreshStreams}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Add Stream
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {streams.map(stream => (
            <Card key={stream.id}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">{stream.name}</Typography>
                  <Chip
                    label={stream.is_running ? "Running" : "Stopped"}
                    color={stream.is_running ? "success" : "default"}
                    size="small"
                  />
                </Box>
                
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  ID: {stream.id}
                </Typography>
                
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  URL: {stream.url}
                </Typography>
                
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <Typography variant="body2">FPS: {stream.fps.toFixed(1)}</Typography>
                  <Typography variant="body2">Frames: {stream.total_frames}</Typography>
                  <Typography variant="body2">Detections: {stream.detection_count}</Typography>
                </Box>
              </CardContent>
              
              <CardActions>
                {stream.is_running ? (
                  <Button
                    size="small"
                    startIcon={<StopIcon />}
                    onClick={() => stopStream(stream.id)}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="small"
                    startIcon={<PlayIcon />}
                    onClick={() => startStream(stream.id)}
                  >
                    Start
                  </Button>
                )}
                
                <IconButton
                  size="small"
                  onClick={() => {/* Edit stream */}}
                >
                  <EditIcon />
                </IconButton>
                
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeStream(stream.id)}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      {/* Add Stream Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Stream</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Stream ID"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="RTSP URL"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            margin="normal"
            required
            placeholder="rtsp://username:password@ip:port/stream"
          />
          <TextField
            fullWidth
            label="Display Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleAddStream} variant="contained">Add Stream</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StreamsManager; 