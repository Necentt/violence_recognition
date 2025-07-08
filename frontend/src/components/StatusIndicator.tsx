import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { AccessTime as AccessTimeIcon } from '@mui/icons-material';

interface StatusIndicatorProps {
  lastUpdate: Date;
  isConnected: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ lastUpdate, isConnected }) => {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const updateTimeAgo = () => {
      const now = new Date();
      const diff = now.getTime() - lastUpdate.getTime();
      const seconds = Math.floor(diff / 1000);
      
      if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`);
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(seconds / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);
    
    return () => clearInterval(interval);
  }, [lastUpdate]);

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <AccessTimeIcon fontSize="small" />
      <Typography variant="caption" color="text.secondary">
        Last update: {timeAgo}
      </Typography>
      <Chip
        label={isConnected ? "Live" : "Offline"}
        size="small"
        color={isConnected ? "success" : "error"}
        variant="outlined"
      />
    </Box>
  );
};

export default StatusIndicator; 