#!/usr/bin/env python3
"""
Скрипт для инициализации базы данных PostgreSQL
"""

import os
import sys
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

def check_database_connection():
    """Проверка подключения к базе данных"""
    try:
        from database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Подключение к базе данных успешно")
            return True
    except Exception as e:
        print(f"❌ Ошибка подключения к базе данных: {e}")
        return False

def create_tables():
    """Создание таблиц"""
    try:
        from database import create_tables
        create_tables()
        print("✅ Таблицы созданы успешно")
        return True
    except Exception as e:
        print(f"❌ Ошибка создания таблиц: {e}")
        return False

def create_indexes():
    """Создание индексов для оптимизации"""
    try:
        from database import engine
        from sqlalchemy import text
        
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_detections_stream_id ON detections(stream_id);",
            "CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_detections_is_violence ON detections(is_violence);",
            "CREATE INDEX IF NOT EXISTS idx_detections_acknowledged ON detections(acknowledged);",
            "CREATE INDEX IF NOT EXISTS idx_alerts_stream_id ON alerts(stream_id);",
            "CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);",
            "CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);",
            "CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);",
            "CREATE INDEX IF NOT EXISTS idx_streams_stream_id ON streams(stream_id);",
            "CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events(event_type);",
            "CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);"
        ]
        
        with engine.connect() as conn:
            for index_sql in indexes:
                conn.execute(text(index_sql))
            conn.commit()
        
        print("✅ Индексы созданы успешно")
        return True
    except Exception as e:
        print(f"❌ Ошибка создания индексов: {e}")
        return False

def insert_sample_data():
    """Вставка тестовых данных"""
    try:
        from database import SessionLocal, Stream, Detection, Alert, SystemEvent
        from datetime import datetime, timedelta
        import random
        
        db = SessionLocal()
        
        # Создаем тестовый поток
        test_stream = Stream(
            stream_id="test_stream_1",
            name="Test Camera 1",
            url="rtsp://test.com/stream1",
            is_active=True
        )
        db.add(test_stream)
        db.commit()
        db.refresh(test_stream)
        
        # Создаем тестовые детекции
        for i in range(10):
            detection = Detection(
                stream_id=test_stream.id,
                timestamp=datetime.now() - timedelta(hours=i),
                is_violence=random.choice([True, False]),
                confidence=random.uniform(0.5, 0.95),
                processed=False,
                acknowledged=False
            )
            db.add(detection)
            db.commit()
            db.refresh(detection)
            
            # Создаем алерт для случаев насилия
            if detection.is_violence:
                alert = Alert(
                    stream_id=test_stream.id,
                    detection_id=detection.id,
                    type='violence',
                    message=f'Violence detected in stream {test_stream.stream_id}',
                    severity='high',
                    acknowledged=False
                )
                db.add(alert)
        
        # Создаем системные события
        system_events = [
            SystemEvent(
                event_type='system_start',
                message='Violence detection system started',
                details='{"version": "1.0.0", "model": "violence_model"}'
            ),
            SystemEvent(
                event_type='stream_added',
                message='Test stream added',
                details='{"stream_id": "test_stream_1"}'
            )
        ]
        
        for event in system_events:
            db.add(event)
        
        db.commit()
        print("✅ Тестовые данные добавлены успешно")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка добавления тестовых данных: {e}")
        return False
    finally:
        if 'db' in locals():
            db.close()

def main():
    """Основная функция"""
    print("🚀 Инициализация базы данных PostgreSQL")
    print("=" * 50)
    
    # Проверяем переменные окружения
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL не установлен в переменных окружения")
        print("Создайте файл .env на основе env.example")
        sys.exit(1)
    
    print(f"📊 База данных: {database_url}")
    
    # Проверяем подключение
    if not check_database_connection():
        sys.exit(1)
    
    # Создаем таблицы
    if not create_tables():
        sys.exit(1)
    
    # Создаем индексы
    if not create_indexes():
        sys.exit(1)
    
    # Спрашиваем о добавлении тестовых данных
    response = input("\n🤔 Добавить тестовые данные? (y/N): ").strip().lower()
    if response in ['y', 'yes']:
        if not insert_sample_data():
            print("⚠️  Тестовые данные не добавлены, но система готова к работе")
    
    print("\n✅ Инициализация завершена успешно!")
    print("\n📋 Следующие шаги:")
    print("1. Запустите сервер: python main.py")
    print("2. Откройте веб-интерфейс: http://localhost:3000")
    print("3. Перейдите на вкладку Alerts для просмотра данных")

if __name__ == "__main__":
    main() 