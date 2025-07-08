from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# Настройки базы данных
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/violence_detection")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Stream(Base):
    """Модель для хранения информации о потоках"""
    __tablename__ = "streams"
    
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Связи
    detections = relationship("Detection", back_populates="stream")
    alerts = relationship("Alert", back_populates="stream")

class Detection(Base):
    """Модель для хранения результатов детекции"""
    __tablename__ = "detections"
    
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    is_violence = Column(Boolean, nullable=False)
    confidence = Column(Float, nullable=False)
    frame_data = Column(Text)  # base64 encoded thumbnail
    processed = Column(Boolean, default=False)
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    
    # Связи
    stream = relationship("Stream", back_populates="detections")
    alerts = relationship("Alert", back_populates="detection")

class Alert(Base):
    """Модель для хранения алертов"""
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), nullable=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=True)
    type = Column(String, nullable=False)  # 'violence', 'error', 'info', 'warning'
    message = Column(String, nullable=False)
    severity = Column(String, default='medium')  # 'low', 'medium', 'high', 'critical'
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    
    # Связи
    stream = relationship("Stream", back_populates="alerts")
    detection = relationship("Detection", back_populates="alerts")

class SystemEvent(Base):
    """Модель для хранения системных событий"""
    __tablename__ = "system_events"
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False)  # 'stream_start', 'stream_stop', 'error', 'warning'
    message = Column(String, nullable=False)
    details = Column(Text, nullable=True)  # JSON string with additional details
    created_at = Column(DateTime, default=func.now())

# Создание таблиц
def create_tables():
    Base.metadata.create_all(bind=engine)

# Dependency для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 