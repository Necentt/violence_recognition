-- Инициализация базы данных для системы детекции насилия

-- Создание расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Создание таблиц
CREATE TABLE IF NOT EXISTS streams (
    id SERIAL PRIMARY KEY,
    stream_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    is_violence BOOLEAN NOT NULL,
    confidence FLOAT NOT NULL,
    frame_data TEXT,
    processed BOOLEAN DEFAULT FALSE,
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER REFERENCES streams(id) ON DELETE CASCADE,
    detection_id INTEGER REFERENCES detections(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_streams_stream_id ON streams(stream_id);
CREATE INDEX IF NOT EXISTS idx_detections_stream_id ON detections(stream_id);
CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_is_violence ON detections(is_violence);
CREATE INDEX IF NOT EXISTS idx_detections_acknowledged ON detections(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_stream_id ON alerts(stream_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);

-- Создание триггера для обновления updated_at в streams
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_streams_updated_at 
    BEFORE UPDATE ON streams 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Вставка тестовых данных
INSERT INTO streams (stream_id, name, url, is_active) VALUES
('test_stream_1', 'Test Camera 1', 'rtsp://test.com/stream1', true),
('test_stream_2', 'Test Camera 2', 'rtsp://test.com/stream2', true)
ON CONFLICT (stream_id) DO NOTHING;

-- Создание системного события о запуске
INSERT INTO system_events (event_type, message, details) VALUES
('system_start', 'PostgreSQL database initialized', '{"version": "14", "database": "violence_detection"}');

-- Предоставление прав пользователю
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO violence_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO violence_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO violence_user; 