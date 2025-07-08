import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface Stream {
  id: string;
  url: string;
  name: string;
  enabled: boolean;
  is_running: boolean;
  fps: number;
  total_frames: number;
  detection_count: number;
  last_detection?: DetectionResult;
}

interface DetectionResult {
  stream_id: string;
  timestamp: number;
  is_violence: boolean;
  confidence: number;
  frame_data: string;
}

interface SystemStatus {
  triton_server: boolean;
  active_streams: number;
  total_streams: number;
  uptime: number;
}

interface StreamsContextType {
  streams: Stream[];
  systemStatus: SystemStatus;
  loading: boolean;
  error: string | null;
  addStream: (stream: Omit<Stream, 'fps' | 'total_frames' | 'detection_count' | 'is_running'>) => Promise<void>;
  removeStream: (streamId: string) => Promise<void>;
  startStream: (streamId: string) => Promise<void>;
  stopStream: (streamId: string) => Promise<void>;
  toggleStream: (streamId: string) => Promise<void>;
  refreshStreams: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const StreamsContext = createContext<StreamsContextType | undefined>(undefined);

export const useStreams = () => {
  const context = useContext(StreamsContext);
  if (!context) {
    throw new Error('useStreams must be used within a StreamsProvider');
  }
  return context;
};

const API_BASE_URL = 'http://localhost:8003';

export const StreamsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    triton_server: false,
    active_streams: 0,
    total_streams: 0,
    uptime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStreams = useCallback(async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/api/streams`);
      // Обновляем только если данные изменились
      setStreams(prevStreams => {
        const newStreams = response.data;
        // Сравниваем только ключевые поля для оптимизации
        const hasChanged = prevStreams.length !== newStreams.length ||
          prevStreams.some((prev, index) => {
            const curr = newStreams[index];
            return !curr || 
              prev.is_running !== curr.is_running ||
              prev.detection_count !== curr.detection_count ||
              prev.fps !== curr.fps ||
              prev.total_frames !== curr.total_frames;
          });
        
        if (hasChanged) {
          return newStreams;
        }
        return prevStreams;
      });
    } catch (err) {
      setError('Failed to load streams');
      console.error('Error loading streams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/status`);
      // Обновляем только если данные изменились
      setSystemStatus(prevStatus => {
        const newStatus = response.data;
        if (prevStatus.triton_server !== newStatus.triton_server ||
            prevStatus.active_streams !== newStatus.active_streams ||
            prevStatus.total_streams !== newStatus.total_streams ||
            prevStatus.uptime !== newStatus.uptime) {
          return newStatus;
        }
        return prevStatus;
      });
    } catch (err) {
      console.error('Error loading system status:', err);
    }
  }, []);

  const addStream = async (stream: Omit<Stream, 'fps' | 'total_frames' | 'detection_count' | 'is_running'>) => {
    try {
      setError(null);
      await axios.post(`${API_BASE_URL}/api/streams`, stream);
      await refreshStreams();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add stream');
      throw err;
    }
  };

  const removeStream = async (streamId: string) => {
    try {
      setError(null);
      await axios.delete(`${API_BASE_URL}/api/streams/${streamId}`);
      await refreshStreams();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove stream');
      throw err;
    }
  };

  const startStream = async (streamId: string) => {
    try {
      setError(null);
      await axios.post(`${API_BASE_URL}/api/streams/${streamId}/start`);
      await refreshStreams();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start stream');
      throw err;
    }
  };

  const stopStream = async (streamId: string) => {
    try {
      setError(null);
      await axios.post(`${API_BASE_URL}/api/streams/${streamId}/stop`);
      await refreshStreams();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to stop stream');
      throw err;
    }
  };

  const toggleStream = async (streamId: string) => {
    try {
      setError(null);
      const stream = streams.find(s => s.id === streamId);
      if (stream) {
        if (stream.is_running) {
          await stopStream(streamId);
        } else {
          await startStream(streamId);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle stream');
      throw err;
    }
  };

  useEffect(() => {
    refreshStreams();
    refreshStatus();
    
    // Обновление статуса каждые 10 секунд
    const statusInterval = setInterval(refreshStatus, 10000);
    // Обновление потоков каждые 8 секунд
    const streamsInterval = setInterval(refreshStreams, 8000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(streamsInterval);
    };
  }, [refreshStreams, refreshStatus]);

  return (
    <StreamsContext.Provider value={{
      streams,
      systemStatus,
      loading,
      error,
      addStream,
      removeStream,
      startStream,
      stopStream,
      toggleStream,
      refreshStreams,
      refreshStatus,
    }}>
      {children}
    </StreamsContext.Provider>
  );
}; 