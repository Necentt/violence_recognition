import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Fullscreen as FullscreenIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

interface VideoStreamProps {
  streamId: string;
  streamName: string;
  isRunning: boolean;
  detectionResult?: {
    is_violence: boolean;
    confidence: number;
    timestamp: number;
  };
  onToggleStream: (streamId: string) => void;
}

interface StreamDetection {
  is_violence: boolean;
  confidence: number;
  timestamp: number;
}

const VideoStream: React.FC<VideoStreamProps> = ({
  streamId,
  streamName,
  isRunning,
  detectionResult,
  onToggleStream,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [currentDetection, setCurrentDetection] = useState<StreamDetection | null>(null);
  const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Генерируем URL для видеопотока
  useEffect(() => {
    if (isRunning) {
      // Используем WebSocket для получения кадров или RTSP прокси
      const wsUrl = `ws://localhost:8003/stream/${streamId}`;
      setStreamUrl(wsUrl);
      setIsLoading(true);
      setError(null);
    } else {
      setStreamUrl('');
      setIsLoading(false);
      // Сбрасываем состояние детекции при остановке стрима
      setCurrentDetection(null);
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = null;
      }
    }
  }, [streamId, isRunning]);

  // Обработка WebSocket для получения кадров
  useEffect(() => {
    if (!isRunning || !streamUrl) return;

    const ws = new WebSocket(streamUrl);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    ws.onopen = () => {
      console.log(`WebSocket connected for stream ${streamId}`);
      setIsLoading(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'frame' && canvas && ctx) {
          // Обновляем результат детекции из потока
          if (data.detection) {
            setCurrentDetection(data.detection);
            
            // Устанавливаем таймер для автоматического сброса детекции через 3 секунды
            if (detectionTimeoutRef.current) {
              clearTimeout(detectionTimeoutRef.current);
            }
            detectionTimeoutRef.current = setTimeout(() => {
              setCurrentDetection(null);
            }, 3000);
          } else {
            // Если нет детекции, сбрасываем состояние
            setCurrentDetection(null);
            if (detectionTimeoutRef.current) {
              clearTimeout(detectionTimeoutRef.current);
              detectionTimeoutRef.current = null;
            }
          }
          
          // Создаем изображение из base64 данных
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // Если есть результат детекции из потока и это насилие, рисуем рамку
            if (data.detection && data.detection.is_violence) {
              ctx.strokeStyle = '#ff0000';
              ctx.lineWidth = 4;
              ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
              
              // Добавляем фон для лучшей читаемости
              ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
              ctx.fillRect(15, 15, canvas.width - 30, 50);
              
              // Добавляем текст с результатом
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 28px Arial';
              ctx.fillText(
                `VIOLENCE DETECTED: ${(data.detection.confidence * 100).toFixed(1)}%`,
                20,
                50
              );
            }
            // Если нет детекции насилия, canvas остается чистым (только изображение)
          };
          img.src = `data:image/jpeg;base64,${data.frame}`;
        }
      } catch (error) {
        console.error('Error processing frame:', error);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for stream ${streamId}:`, error);
      setError('Failed to connect to video stream');
      setIsLoading(false);
    };

    ws.onclose = () => {
      console.log(`WebSocket disconnected for stream ${streamId}`);
    };

    return () => {
      ws.close();
      // Очищаем таймер при размонтировании
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = null;
      }
    };
  }, [streamUrl, streamId, isRunning, detectionResult]);

  const handleFullscreen = () => {
    if (canvasRef.current) {
      if (!isFullscreen) {
        canvasRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const getDetectionColor = () => {
    if (!currentDetection) return 'default';
    return currentDetection.is_violence ? 'error' : 'success';
  };

  const getDetectionLabel = () => {
    if (!currentDetection) return 'No Detection';
    return currentDetection.is_violence ? 'Violence' : 'Normal';
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, p: 0, position: 'relative' }}>
        {/* Заголовок с информацией о потоке */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
            p: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle2" color="white" fontWeight={600}>
            {streamName}
          </Typography>
          
          <Box display="flex" gap={1}>
            <Chip
              label={getDetectionLabel()}
              color={getDetectionColor() as any}
              size="small"
              variant="filled"
            />
            {currentDetection && (
              <Chip
                label={`${(currentDetection.confidence * 100).toFixed(1)}%`}
                color={getDetectionColor() as any}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </Box>

        {/* Видео контейнер */}
        <Box
          sx={{
            width: '100%',
            height: '100%',
            minHeight: 300,
            position: 'relative',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLoading && (
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <CircularProgress />
              <Typography color="white">Connecting to stream...</Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ position: 'absolute', top: 50, left: 10, right: 10 }}>
              {error}
            </Alert>
          )}

          {!isRunning && !isLoading && (
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <Typography color="white" variant="h6">
                Stream Stopped
              </Typography>
              <Typography color="white" variant="body2">
                Click Start to begin monitoring
              </Typography>
            </Box>
          )}

          {/* Canvas для отображения видео */}
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: isRunning && !isLoading ? 'block' : 'none',
            }}
          />
        </Box>

        {/* Панель управления */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
            p: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box display="flex" gap={1}>
            <Tooltip title={isRunning ? "Stop Stream" : "Start Stream"}>
              <IconButton
                onClick={() => onToggleStream(streamId)}
                sx={{ color: 'white' }}
                size="small"
              >
                {isRunning ? <StopIcon /> : <PlayIcon />}
              </IconButton>
            </Tooltip>
          </Box>

          <Box display="flex" gap={1}>
            <Tooltip title="Fullscreen">
              <IconButton
                onClick={handleFullscreen}
                sx={{ color: 'white' }}
                size="small"
              >
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Stream Settings">
              <IconButton
                sx={{ color: 'white' }}
                size="small"
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default VideoStream; 