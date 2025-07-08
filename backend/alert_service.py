from sqlalchemy.orm import Session
from database import SessionLocal, Stream, Detection, Alert, SystemEvent
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import json

class AlertService:
    def __init__(self):
        self.db = SessionLocal()
    
    def __del__(self):
        if self.db:
            self.db.close()
    
    def create_stream(self, stream_id: str, name: str, url: str) -> Stream:
        """Создание нового потока в базе данных"""
        stream = Stream(
            stream_id=stream_id,
            name=name,
            url=url,
            is_active=True
        )
        self.db.add(stream)
        self.db.commit()
        self.db.refresh(stream)
        return stream
    
    def get_or_create_stream(self, stream_id: str, name: str, url: str) -> Stream:
        """Получение существующего потока или создание нового"""
        stream = self.db.query(Stream).filter(Stream.stream_id == stream_id).first()
        if not stream:
            stream = self.create_stream(stream_id, name, url)
        return stream
    
    def save_detection(self, stream_id: str, is_violence: bool, confidence: float, 
                      frame_data: str = None) -> Detection:
        """Сохранение результата детекции"""
        # Получаем или создаем поток
        stream = self.get_or_create_stream(stream_id, stream_id, f"rtsp://{stream_id}")
        
        detection = Detection(
            stream_id=stream.id,
            timestamp=datetime.now(),
            is_violence=is_violence,
            confidence=confidence,
            frame_data=frame_data,
            processed=False,
            acknowledged=False
        )
        
        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)
        
        # Если обнаружено насилие, создаем алерт
        if is_violence:
            self.create_violence_alert(detection)
        
        return detection
    
    def create_violence_alert(self, detection: Detection) -> Alert:
        """Создание алерта о насилии"""
        alert = Alert(
            stream_id=detection.stream_id,
            detection_id=detection.id,
            type='violence',
            message=f"Violence detected in stream {detection.stream.stream_id}",
            severity='high',
            acknowledged=False
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert
    
    def create_system_alert(self, alert_type: str, message: str, 
                           severity: str = 'medium', stream_id: str = None) -> Alert:
        """Создание системного алерта"""
        stream = None
        if stream_id:
            stream = self.db.query(Stream).filter(Stream.stream_id == stream_id).first()
        
        alert = Alert(
            stream_id=stream.id if stream else None,
            type=alert_type,
            message=message,
            severity=severity,
            acknowledged=False
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert
    
    def create_system_event(self, event_type: str, message: str, details: Dict = None) -> SystemEvent:
        """Создание системного события"""
        event = SystemEvent(
            event_type=event_type,
            message=message,
            details=json.dumps(details) if details else None
        )
        
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event
    
    def get_detections(self, limit: int = 100, offset: int = 0, 
                      stream_id: str = None, is_violence: bool = None) -> List[Detection]:
        """Получение списка детекций"""
        query = self.db.query(Detection).join(Stream)
        
        if stream_id:
            query = query.filter(Stream.stream_id == stream_id)
        
        if is_violence is not None:
            query = query.filter(Detection.is_violence == is_violence)
        
        return query.order_by(Detection.timestamp.desc()).offset(offset).limit(limit).all()
    
    def get_alerts(self, limit: int = 100, offset: int = 0, 
                   alert_type: str = None, acknowledged: bool = None) -> List[Alert]:
        """Получение списка алертов"""
        query = self.db.query(Alert)
        
        if alert_type:
            query = query.filter(Alert.type == alert_type)
        
        if acknowledged is not None:
            query = query.filter(Alert.acknowledged == acknowledged)
        
        return query.order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()
    
    def acknowledge_alert(self, alert_id: int, acknowledged_by: str = "system") -> bool:
        """Подтверждение алерта"""
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.acknowledged = True
            alert.acknowledged_by = acknowledged_by
            alert.acknowledged_at = datetime.now()
            self.db.commit()
            return True
        return False
    
    def acknowledge_detection(self, detection_id: int) -> bool:
        """Подтверждение детекции"""
        detection = self.db.query(Detection).filter(Detection.id == detection_id).first()
        if detection:
            detection.acknowledged = True
            self.db.commit()
            return True
        return False
    
    def get_statistics(self, days: int = 7) -> Dict[str, Any]:
        """Получение статистики за указанное количество дней"""
        start_date = datetime.now() - timedelta(days=days)
        
        # Общая статистика детекций
        total_detections = self.db.query(Detection).filter(
            Detection.created_at >= start_date
        ).count()
        
        violence_detections = self.db.query(Detection).filter(
            Detection.created_at >= start_date,
            Detection.is_violence == True
        ).count()
        
        # Статистика по потокам
        stream_stats = self.db.query(
            Stream.stream_id,
            Stream.name,
            self.db.func.count(Detection.id).label('total_detections'),
            self.db.func.count(self.db.case([(Detection.is_violence == True, 1)])).label('violence_detections')
        ).outerjoin(Detection).filter(
            Detection.created_at >= start_date
        ).group_by(Stream.id).all()
        
        # Статистика алертов
        total_alerts = self.db.query(Alert).filter(
            Alert.created_at >= start_date
        ).count()
        
        unacknowledged_alerts = self.db.query(Alert).filter(
            Alert.created_at >= start_date,
            Alert.acknowledged == False
        ).count()
        
        return {
            'period_days': days,
            'total_detections': total_detections,
            'violence_detections': violence_detections,
            'violence_percentage': (violence_detections / total_detections * 100) if total_detections > 0 else 0,
            'stream_statistics': [
                {
                    'stream_id': stat.stream_id,
                    'name': stat.name,
                    'total_detections': stat.total_detections,
                    'violence_detections': stat.violence_detections
                }
                for stat in stream_stats
            ],
            'total_alerts': total_alerts,
            'unacknowledged_alerts': unacknowledged_alerts
        }
    
    def cleanup_old_data(self, days: int = 30) -> Dict[str, int]:
        """Очистка старых данных"""
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Удаляем старые детекции
        old_detections = self.db.query(Detection).filter(
            Detection.created_at < cutoff_date
        ).delete()
        
        # Удаляем старые алерты
        old_alerts = self.db.query(Alert).filter(
            Alert.created_at < cutoff_date
        ).delete()
        
        # Удаляем старые системные события
        old_events = self.db.query(SystemEvent).filter(
            SystemEvent.created_at < cutoff_date
        ).delete()
        
        self.db.commit()
        
        return {
            'deleted_detections': old_detections,
            'deleted_alerts': old_alerts,
            'deleted_events': old_events
        } 