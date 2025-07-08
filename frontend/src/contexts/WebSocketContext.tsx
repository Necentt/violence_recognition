import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (message: any) => void;
  lastMessage: any;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connectWebSocket = () => {
      const websocket = new WebSocket('ws://localhost:8003/ws');
      
      websocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Обработка различных типов сообщений
          if (data.type === 'detection_result') {
            console.log('Detection result:', data.data);
          } else if (data.type === 'streams_status') {
            console.log('Streams status update:', data.data);
          } else if (data.type === 'stream_update') {
            console.log('Stream update:', data.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Переподключение через 5 секунд, но только если нет активного таймаута
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectWebSocket();
          }, 5000);
        }
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      setWs(websocket);
    };
    
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (ws) {
        ws.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  const sendMessage = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };
  
  return (
    <WebSocketContext.Provider value={{ isConnected, sendMessage, lastMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 