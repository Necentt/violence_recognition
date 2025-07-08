import cv2
import numpy as np
import tritonclient.http as http
import os
import asyncio
import json
import time
import base64
import signal
import sys
import requests
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
from dataclasses import dataclass
import threading
import queue
import aiohttp
from datetime import datetime
from database import create_tables, get_db, SessionLocal
from alert_service import AlertService

# Настройка OpenCV для RTSP
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

# Глобальные экземпляры
rtsp_manager = None
connection_manager = None
telegram_service = None
alert_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global rtsp_manager, connection_manager, telegram_service, alert_service
    
    # Создаем таблицы базы данных
    create_tables()
    
    rtsp_manager = RTSPManager()
    connection_manager = ConnectionManager()
    telegram_service = TelegramService()
    alert_service = AlertService()
    
    # Запускаем фоновую задачу
    asyncio.create_task(broadcast_detection_results())
    
    yield
    
    # Shutdown
    print("Shutting down...")
    if rtsp_manager:
        # Останавливаем все потоки
        for stream_id in list(rtsp_manager.streams.keys()):
            try:
                rtsp_manager.stop_detection(stream_id)
            except:
                pass

app = FastAPI(title="RTSP Violence Detection API", version="1.0.0", lifespan=lifespan)

# CORS настройки для frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic модели
class RTSPStream(BaseModel):
    id: str
    url: str
    name: str = ""
    enabled: bool = True

class DetectionResult(BaseModel):
    stream_id: str
    timestamp: float
    is_violence: bool
    confidence: float
    frame_data: str = ""  # base64 encoded thumbnail

class StreamStatus(BaseModel):
    id: str
    url: str
    name: str
    enabled: bool
    is_running: bool
    fps: float
    total_frames: int
    detection_count: int
    last_detection: Optional[DetectionResult] = None

class TelegramSettings(BaseModel):
    bot_token: str = ""
    chat_id: str = ""
    enabled: bool = False
    notification_interval: int = 300  # seconds between notifications during ongoing events
    max_notifications: int = 5  # maximum notifications per event
    send_thumbnails: bool = True

class SystemSettings(BaseModel):
    # Triton Server Settings
    triton_url: str = "http://localhost:8000"
    model_name: str = "violence_model"
    model_version: str = "1"
    
    # Stream Settings
    max_streams: int = 10
    frame_skip: int = 3
    confidence_threshold: float = 0.7
    
    # Performance Settings
    max_fps: int = 30
    buffer_size: int = 16
    enable_gpu: bool = True
    
    # Security Settings
    enable_auth: bool = False
    enable_ssl: bool = False
    allowed_origins: List[str] = ["http://localhost:3000"]
    
    # Storage Settings
    enable_recording: bool = False
    max_storage_gb: int = 10
    retention_days: int = 30
    
    # Telegram Settings
    telegram: TelegramSettings = TelegramSettings()

# Triton клиент
class TritonClient:
    def __init__(self, url: str = "localhost:8000"):
        self.url = url
        self.client = None
        self.connect()
    
    def connect(self):
        """Подключение к Triton серверу"""
        try:
            self.client = http.InferenceServerClient(self.url)
            # Проверка подключения
            self.client.is_server_ready()
            print(f"Connected to Triton server at {self.url}")
            return True
        except Exception as e:
            print(f"Failed to connect to Triton server: {e}")
            self.client = None
            return False
    
    def is_healthy(self) -> bool:
        """Проверка здоровья Triton сервера"""
        try:
            if self.client:
                return self.client.is_server_ready()
            return False
        except:
            return False
    
    def predict(self, frame_sequence: np.ndarray) -> tuple[bool, float]:
        """Предсказание насилия в последовательности кадров"""
        try:
            if not self.client:
                if not self.connect():
                    raise RuntimeError("Triton client not available")
            
            # Подготовка данных для нашей модели violence_model
            # frame_sequence имеет формат (16, 3, 224, 224)
            x = np.expand_dims(frame_sequence, 0)  # (1, 16, 3, 224, 224)
            
            # Создание входных данных для нашей модели
            inp = http.InferInput("input", x.shape, "FP32")
            inp.set_data_from_numpy(x)
            
            # Выполнение предсказания
            result = self.client.infer("violence_model", [inp],
                                     outputs=[http.InferRequestedOutput("output")])
            
            # Получение результата
            prediction = result.as_numpy("output")  # (1, 2)
            
            # Применение softmax для получения вероятностей
            probs = np.exp(prediction) / np.sum(np.exp(prediction), axis=1, keepdims=True)
            
            # Интерпретация результата [no_violence, violence]
            violence_prob = probs[0][1]  # вероятность насилия
            
            # Используем настраиваемый порог из настроек системы
            threshold = system_settings.confidence_threshold
            is_violence = violence_prob > threshold
            
            return is_violence, float(violence_prob)
            
        except Exception as e:
            print(f"Prediction error: {e}")
            return False, 0.0

# RTSP процессор
class RTSPProcessor:
    def __init__(self, stream_id: str, rtsp_url: str, name: str = "", 
                 triton_url: str = "localhost:8000"):
        self.stream_id = stream_id
        self.rtsp_url = rtsp_url
        self.name = name or stream_id
        self.triton_url = triton_url
        self.triton_client = None  # Будет создан в потоке детекции
        
        self.cap = None
        self.is_running = False
        self.frame_buffer = []
        # Используем настройки из глобальной переменной
        self.buffer_size = system_settings.buffer_size
        
        # Статистика
        self.fps = 0.0
        self.total_frames = 0
        self.detection_count = 0
        self.last_detection = None
        self.start_time = time.time()
        
        # Очередь результатов
        self.results_queue = queue.Queue()
        
        # Поток для детекции (отдельный от основного потока чтения)
        self.detection_thread = None
        self.detection_running = False
        
        # Блокировка для синхронизации доступа к буферу
        self.buffer_lock = threading.Lock()
        
        # Флаги для безопасного завершения
        self._shutdown_event = threading.Event()
        self._frame_thread = None
    
    def connect(self) -> bool:
        """Подключение к RTSP потоку"""
        try:
            # Освобождаем старые ресурсы
            self._safe_release_capture()
            
            self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            if not self.cap.isOpened():
                raise RuntimeError(f"Failed to connect to {self.rtsp_url}")
            print(f"Connected to RTSP stream: {self.rtsp_url}")
            return True
        except Exception as e:
            print(f"RTSP connection error: {e}")
            return False
    
    def _safe_release_capture(self):
        """Безопасное освобождение OpenCV capture"""
        try:
            if self.cap is not None:
                self.cap.release()
                self.cap = None
        except Exception as e:
            print(f"Error releasing capture: {e}")
    
    def process_frame(self, frame: np.ndarray):
        """Обработка одного кадра"""
        try:
            # Изменение размера и нормализация для нашей модели
            frame = cv2.resize(frame, (224, 224))
            frame = frame.astype(np.float32) / 255.0
            
            # Преобразование в формат CHW (3, 224, 224)
            frame = np.transpose(frame, (2, 0, 1))  # (C, H, W)
            
            # Безопасное добавление в буфер
            with self.buffer_lock:
                self.frame_buffer.append(frame)
                
                # Используем актуальный размер буфера из настроек
                current_buffer_size = system_settings.buffer_size
                # Удаление старых кадров (оптимизированно)
                if len(self.frame_buffer) > current_buffer_size:
                    self.frame_buffer = self.frame_buffer[-current_buffer_size:]
        except Exception as e:
            print(f"Error processing frame: {e}")
    
    def detect_violence(self) -> Optional[DetectionResult]:
        """Детекция насилия в буфере кадров"""
        try:
            # Получаем актуальный размер буфера из настроек
            current_buffer_size = system_settings.buffer_size
            
            # Безопасное получение копии буфера
            with self.buffer_lock:
                if len(self.frame_buffer) < current_buffer_size:
                    return None
                # Создаем копию буфера для обработки
                frame_buffer_copy = self.frame_buffer.copy()
            
            # Подготовка данных для модели
            frame_sequence = np.stack(frame_buffer_copy, axis=0)  # (16, 3, 224, 224)
            
            # Создание Triton клиента в потоке детекции
            if self.triton_client is None:
                self.triton_client = TritonClient(self.triton_url)
            
            # Предсказание через Triton
            is_violence, confidence = self.triton_client.predict(frame_sequence)
            
            # Создание thumbnail последнего кадра
            last_frame = frame_buffer_copy[-1]
            # Конвертация обратно в HWC формат для кодирования
            thumbnail = np.transpose(last_frame, (1, 2, 0))  # (H, W, C)
            thumbnail = (thumbnail * 255).astype(np.uint8)
            thumbnail = cv2.resize(thumbnail, (128, 128))  # Уменьшаем для передачи
            _, buffer = cv2.imencode('.jpg', thumbnail)
            frame_data = base64.b64encode(buffer).decode('utf-8')
            
            result = DetectionResult(
                stream_id=self.stream_id,
                timestamp=time.time(),
                is_violence=is_violence,
                confidence=confidence,
                frame_data=frame_data
            )
            
            if is_violence:
                self.detection_count += 1
                self.last_detection = result
                
                # Сохраняем в базу данных
                try:
                    if alert_service:
                        alert_service.save_detection(
                            stream_id=self.stream_id,
                            is_violence=is_violence,
                            confidence=confidence,
                            frame_data=frame_data
                        )
                except Exception as e:
                    print(f"Error saving detection to database: {e}")
                
                # Отправляем уведомление в Telegram
                try:
                    if telegram_service:
                        telegram_service.handle_detection(result)
                except Exception as e:
                    print(f"Error sending Telegram notification: {e}")
            
            return result
            
        except Exception as e:
            print(f"Detection error for {self.stream_id}: {e}")
            # Сбрасываем клиент при ошибке для переподключения
            self.triton_client = None
            return None
    
    def detection_loop(self):
        """Отдельный поток для детекции"""
        try:
            # Создаем Triton клиент в этом потоке
            self.triton_client = TritonClient(self.triton_url)
            
            while self.detection_running and not self._shutdown_event.is_set():
                try:
                    # Получаем актуальный размер буфера из настроек
                    current_buffer_size = system_settings.buffer_size
                    
                    # Проверяем размер буфера
                    with self.buffer_lock:
                        buffer_size = len(self.frame_buffer)
                    
                    # Детекция насилия только если буфер полный
                    if buffer_size >= current_buffer_size:
                        result = self.detect_violence()
                        if result:
                            self.results_queue.put(result)
                    
                    # Небольшая задержка для детекции
                    time.sleep(0.1)  # 10 FPS для детекции
                    
                except Exception as e:
                    print(f"Detection loop error for {self.stream_id}: {e}")
                    time.sleep(1)
        except Exception as e:
            print(f"Detection thread error for {self.stream_id}: {e}")
        finally:
            # Освобождаем Triton клиент при завершении
            try:
                if self.triton_client:
                    self.triton_client = None
            except:
                pass
    
    def run_detection_loop(self):
        """Основной цикл чтения кадров"""
        if not self.connect():
            return
        
        last_time = time.time()
        
        try:
            while self.is_running and not self._shutdown_event.is_set():
                try:
                    if self.cap is None or not self.cap.isOpened():
                        print(f"Capture not available for {self.stream_id}")
                        break
                    
                    ret, frame = self.cap.read()
                    if not ret:
                        print(f"Failed to read frame from {self.stream_id}")
                        break
                    
                    # Обновление FPS
                    current_time = time.time()
                    if current_time - last_time > 0:
                        self.fps = 1.0 / (current_time - last_time)
                    last_time = current_time
                    
                    # Используем frame_skip из настроек
                    current_frame_skip = system_settings.frame_skip
                    
                    # Обрабатываем только каждый N-й кадр
                    if self.total_frames % current_frame_skip == 0:
                        self.process_frame(frame)
                    
                    self.total_frames += 1
                    
                    # Минимальная задержка для контроля FPS
                    time.sleep(0.001)  # 1ms задержка
                    
                except Exception as e:
                    print(f"Frame reading error for {self.stream_id}: {e}")
                    break
                    
        except Exception as e:
            print(f"Frame reading loop error for {self.stream_id}: {e}")
        finally:
            self._safe_release_capture()
            self.is_running = False
    
    def start(self):
        """Запуск детекции"""
        if not self.is_running:
            # Сбрасываем состояние
            self._shutdown_event.clear()
            with self.buffer_lock:
                self.frame_buffer = []
            self.fps = 0.0
            self.total_frames = 0
            self.detection_count = 0
            self.last_detection = None
            self.start_time = time.time()
            
            self.is_running = True
            self.detection_running = True
            
            # Запускаем поток чтения кадров
            self._frame_thread = threading.Thread(target=self.run_detection_loop, daemon=True)
            self._frame_thread.start()
            
            # Запускаем поток детекции
            self.detection_thread = threading.Thread(target=self.detection_loop, daemon=True)
            self.detection_thread.start()
            
            print(f"Started detection for stream: {self.stream_id}")
    
    def stop(self):
        """Остановка детекции"""
        print(f"Stopping detection for stream: {self.stream_id}")
        
        # Устанавливаем флаг завершения
        self._shutdown_event.set()
        
        # Останавливаем потоки
        self.is_running = False
        self.detection_running = False
        
        # Ждем завершения потоков с таймаутом
        try:
            if self._frame_thread and self._frame_thread.is_alive():
                self._frame_thread.join(timeout=3)
            if self.detection_thread and self.detection_thread.is_alive():
                self.detection_thread.join(timeout=3)
        except Exception as e:
            print(f"Error waiting for threads: {e}")
        
        # Освобождаем ресурсы
        self._safe_release_capture()
        
        # Сбрасываем Triton клиент
        try:
            self.triton_client = None
        except:
            pass
        
        print(f"Stopped detection for stream: {self.stream_id}")
    
    def get_status(self) -> StreamStatus:
        """Получение статуса потока"""
        return StreamStatus(
            id=self.stream_id,
            url=self.rtsp_url,
            name=self.name,
            enabled=True,
            is_running=self.is_running,
            fps=round(self.fps, 2),
            total_frames=self.total_frames,
            detection_count=self.detection_count,
            last_detection=self.last_detection
        )
    
    def get_latest_results(self, max_results: int = 10) -> List[DetectionResult]:
        """Получение последних результатов детекции"""
        results = []
        while not self.results_queue.empty() and len(results) < max_results:
            try:
                result = self.results_queue.get_nowait()
                results.append(result)
            except queue.Empty:
                break
        return results

# Менеджер RTSP потоков
class RTSPManager:
    def __init__(self):
        self.streams: Dict[str, RTSPProcessor] = {}
        self.triton_client = TritonClient()
    
    def add_stream(self, stream_id: str, rtsp_url: str, name: str = "") -> bool:
        """Добавление нового RTSP потока"""
        try:
            if stream_id in self.streams:
                raise ValueError(f"Stream {stream_id} already exists")
            
            processor = RTSPProcessor(stream_id, rtsp_url, name)
            self.streams[stream_id] = processor
            print(f"Added stream: {stream_id} -> {rtsp_url}")
            return True
        except Exception as e:
            print(f"Error adding stream {stream_id}: {e}")
            return False
    
    def remove_stream(self, stream_id: str) -> bool:
        """Удаление RTSP потока"""
        if stream_id in self.streams:
            self.streams[stream_id].stop()
            del self.streams[stream_id]
            print(f"Removed stream: {stream_id}")
            return True
        return False
    
    def start_detection(self, stream_id: str) -> bool:
        """Запуск детекции для потока"""
        if stream_id in self.streams:
            self.streams[stream_id].start()
            return True
        return False
    
    def stop_detection(self, stream_id: str) -> bool:
        """Остановка детекции для потока"""
        if stream_id in self.streams:
            self.streams[stream_id].stop()
            return True
        return False
    
    def get_all_streams(self) -> List[StreamStatus]:
        """Получение статуса всех потоков"""
        return [stream.get_status() for stream in self.streams.values()]
    
    def get_active_streams(self) -> List[str]:
        """Получение списка активных потоков"""
        return [stream_id for stream_id, stream in self.streams.items() 
                if stream.is_running]
    
    def get_latest_detections(self) -> List[DetectionResult]:
        """Получение последних результатов детекции от всех потоков"""
        all_results = []
        for stream in self.streams.values():
            results = stream.get_latest_results()
            all_results.extend(results)
        
        # Сортировка по времени
        all_results.sort(key=lambda x: x.timestamp, reverse=True)
        return all_results

# WebSocket менеджер
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: str):
        """Отправка сообщения всем подключенным клиентам"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                disconnected.append(connection)
        
        # Удаление отключенных соединений
        for connection in disconnected:
            self.active_connections.remove(connection)

# Telegram сервис
class TelegramService:
    def __init__(self):
        self.bot_token = ""
        self.chat_id = ""
        self.enabled = False
        self.notification_interval = 300
        self.max_notifications = 5
        self.send_thumbnails = True
        self.last_notification_time = {}  # stream_id -> timestamp
        self.violence_events = {}  # stream_id -> event_info
    
    def update_settings(self, settings: TelegramSettings):
        """Обновление настроек Telegram"""
        self.bot_token = settings.bot_token
        self.chat_id = settings.chat_id
        self.enabled = settings.enabled
        self.notification_interval = settings.notification_interval
        self.max_notifications = settings.max_notifications
        self.send_thumbnails = settings.send_thumbnails
        print(f"Telegram settings updated: enabled={self.enabled}")
    
    async def test_connection(self) -> bool:
        """Тестирование подключения к Telegram"""
        if not self.enabled or not self.bot_token or not self.chat_id:
            return False
        
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/getMe"
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('ok', False)
                    return False
        except Exception as e:
            print(f"Telegram connection test failed: {e}")
            return False
    
    async def send_message(self, message: str, photo_data: str = None) -> bool:
        """Отправка сообщения в Telegram"""
        if not self.enabled or not self.bot_token or not self.chat_id:
            return False
        
        try:
            if photo_data and self.send_thumbnails:
                # Отправка фото с подписью
                url = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
                
                decoded_photo = base64.b64decode(photo_data)
                form = aiohttp.FormData()
                form.add_field('chat_id', self.chat_id)
                form.add_field('caption', message)
                form.add_field('parse_mode', 'HTML')
                form.add_field('photo', decoded_photo,
                            filename='frame.jpg',
                            content_type='image/jpeg')

                async with aiohttp.ClientSession() as session:
                    async with session.post(url, data=form) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            print(f"Telegram photo send error: {response.status} — {error_text}")
                        return response.status == 200
            else:
                # Отправка только текста
                url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
                data = {
                    'chat_id': self.chat_id,
                    'text': message,
                    'parse_mode': 'HTML'
                }
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=data) as response:
                        return response.status == 200
        except Exception as e:
            print(f"Failed to send Telegram message: {e}")
            return False
    
    def should_send_notification(self, stream_id: str, is_violence: bool) -> bool:
        """Определение, нужно ли отправлять уведомление"""
        current_time = time.time()
        
        if not is_violence:
            # Если насилия нет, отправляем финальное уведомление если было событие
            if stream_id in self.violence_events:
                event_info = self.violence_events[stream_id]
                duration = int(current_time - event_info['start_time'])
                
                # Отправляем финальное уведомление асинхронно
                asyncio.create_task(self.send_final_notification(stream_id, duration, event_info))
                
                # Очищаем событие
                del self.violence_events[stream_id]
            if stream_id in self.last_notification_time:
                del self.last_notification_time[stream_id]
            return False
        
        # Если насилие обнаружено
        if stream_id not in self.violence_events:
            # Новое событие насилия
            self.violence_events[stream_id] = {
                'start_time': current_time,
                'last_detection': current_time,
                'notification_count': 0,
                'max_confidence': 0.0
            }
            self.last_notification_time[stream_id] = current_time
            return True
        
        # Продолжающееся событие
        event_info = self.violence_events[stream_id]
        event_info['last_detection'] = current_time
        
        # Обновляем максимальную уверенность
        if hasattr(self, 'current_detection_confidence'):
            event_info['max_confidence'] = max(event_info['max_confidence'], self.current_detection_confidence)
        
        # Проверяем, прошло ли достаточно времени с последнего уведомления
        last_notification = self.last_notification_time.get(stream_id, 0)
        time_since_last = current_time - last_notification
        
        # Проверяем, не превышено ли максимальное количество уведомлений
        if event_info['notification_count'] >= self.max_notifications:
            return False
        
        # Адаптивный интервал: увеличиваем интервал с каждым уведомлением
        base_interval = self.notification_interval
        adaptive_interval = base_interval * (1 + event_info['notification_count'] * 0.5)  # Увеличиваем на 50% каждый раз
        
        # Максимальный интервал - 30 минут
        adaptive_interval = min(adaptive_interval, 1800)
        
        if time_since_last >= adaptive_interval:
            event_info['notification_count'] += 1
            self.last_notification_time[stream_id] = current_time
            return True
        
        return False
    
    async def handle_detection(self, detection: DetectionResult):
        """Обработка результата детекции"""
        if not self.enabled:
            return
        
        stream_id = detection.stream_id
        is_violence = detection.is_violence
        
        # Сохраняем текущую уверенность для использования в should_send_notification
        self.current_detection_confidence = detection.confidence
        
        if self.should_send_notification(stream_id, is_violence):
            # Формируем сообщение
            if stream_id in self.violence_events:
                event_info = self.violence_events[stream_id]
                duration = int(time.time() - event_info['start_time'])
                notification_count = event_info['notification_count']
                max_confidence = event_info['max_confidence']
                
                # Определяем тип сообщения
                if notification_count == 0:
                    message_type = "🚨 <b>Violence Detection Started</b>"
                elif notification_count == 1:
                    message_type = "⚠️ <b>Violence Continues</b>"
                else:
                    message_type = "🔄 <b>Violence Ongoing</b>"
                
                message = (
                    f"{message_type}\n\n"
                    f"📹 Stream: {stream_id}\n"
                    f"🎯 Current Confidence: {detection.confidence:.2%}\n"
                    f"📊 Max Confidence: {max_confidence:.2%}\n"
                    f"⏱️ Duration: {duration}s\n"
                    f"🔔 Notification #{notification_count + 1}\n"
                    f"🕐 Time: {time.strftime('%Y-%m-%d %H:%M:%S')}"
                )
            else:
                message = (
                    f"🚨 <b>Violence Detection Alert</b>\n\n"
                    f"📹 Stream: {stream_id}\n"
                    f"🎯 Confidence: {detection.confidence:.2%}\n"
                    f"🕐 Time: {time.strftime('%Y-%m-%d %H:%M:%S')}"
                )
            
            # Отправляем уведомление
            await self.send_message(message, detection.frame_data)
    
    async def send_final_notification(self, stream_id: str, duration: int, event_info: dict):
        """Отправка финального уведомления о завершении события"""
        if not self.enabled:
            return
        
        notification_count = event_info['notification_count']
        max_confidence = event_info['max_confidence']
        
        message = (
            f"✅ <b>Violence Event Ended</b>\n\n"
            f"📹 Stream: {stream_id}\n"
            f"⏱️ Total Duration: {duration}s\n"
            f"📊 Max Confidence: {max_confidence:.2%}\n"
            f"🔔 Total Notifications: {notification_count + 1}\n"
            f"🕐 Ended: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        )
        
        await self.send_message(message)

# Глобальные настройки системы
system_settings = SystemSettings()

# Файл для сохранения настроек
SETTINGS_FILE = "system_settings.json"

def load_settings():
    """Загрузка настроек из файла"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                data = json.load(f)
                global system_settings
                system_settings = SystemSettings(**data)
                print("Settings loaded successfully")
    except Exception as e:
        print(f"Error loading settings: {e}")

def save_settings():
    """Сохранение настроек в файл"""
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(system_settings.model_dump(), f, indent=2)
        print("Settings saved successfully")
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False

# Загружаем настройки при запуске
load_settings()

# REST API endpoints
@app.get("/")
async def root():
    return {
        "message": "RTSP Violence Detection API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/api/streams")
async def get_streams():
    """Получить список всех RTSP потоков"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    return rtsp_manager.get_all_streams()

@app.post("/api/streams")
async def add_stream(stream: RTSPStream):
    """Добавить новый RTSP поток"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    try:
        success = rtsp_manager.add_stream(stream.id, stream.url, stream.name)
        if success:
            return {"message": f"Stream {stream.id} added successfully"}
        else:
            raise HTTPException(status_code=400, detail="Failed to add stream")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/streams/{stream_id}")
async def remove_stream(stream_id: str):
    """Удалить RTSP поток"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    try:
        success = rtsp_manager.remove_stream(stream_id)
        if success:
            return {"message": f"Stream {stream_id} removed successfully"}
        else:
            raise HTTPException(status_code=404, detail="Stream not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/streams/{stream_id}/start")
async def start_stream(stream_id: str):
    """Запустить детекцию для потока"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    try:
        success = rtsp_manager.start_detection(stream_id)
        if success:
            return {"message": f"Detection started for {stream_id}"}
        else:
            raise HTTPException(status_code=404, detail="Stream not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/streams/{stream_id}/stop")
async def stop_stream(stream_id: str):
    """Остановить детекцию для потока"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    try:
        success = rtsp_manager.stop_detection(stream_id)
        if success:
            return {"message": f"Detection stopped for {stream_id}"}
        else:
            raise HTTPException(status_code=404, detail="Stream not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/status")
async def get_status():
    """Получить статус системы"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    return {
        "triton_server": rtsp_manager.triton_client.is_healthy(),
        "active_streams": len(rtsp_manager.get_active_streams()),
        "total_streams": len(rtsp_manager.streams),
        "uptime": time.time() - rtsp_manager.triton_client.start_time if hasattr(rtsp_manager.triton_client, 'start_time') else 0
    }

@app.get("/api/detections")
async def get_detections(limit: int = 50):
    """Получить последние результаты детекции"""
    if rtsp_manager is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    detections = rtsp_manager.get_latest_detections()
    return detections[:limit]

@app.get("/api/settings")
async def get_settings():
    """Получить текущие настройки системы"""
    return system_settings

@app.post("/api/settings")
async def update_settings(settings: SystemSettings):
    """Обновить настройки системы"""
    try:
        global system_settings
        system_settings = settings
        if save_settings():
            # Перезапускаем активные потоки с новыми настройками
            if rtsp_manager:
                active_streams = rtsp_manager.get_active_streams()
                for stream_id in active_streams:
                    # Останавливаем и перезапускаем поток
                    rtsp_manager.stop_detection(stream_id)
                    await asyncio.sleep(0.1)  # Небольшая пауза
                    rtsp_manager.start_detection(stream_id)
            
            return {"message": "Settings updated successfully and active streams restarted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save settings")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/settings/telegram")
async def get_telegram_settings():
    """Получить настройки Telegram"""
    return system_settings.telegram

@app.post("/api/settings/telegram")
async def update_telegram_settings(telegram_settings: TelegramSettings):
    """Обновить настройки Telegram"""
    try:
        system_settings.telegram = telegram_settings
        if save_settings():
            # Обновляем Telegram сервис
            if telegram_service:
                telegram_service.update_settings(telegram_settings)
            return {"message": "Telegram settings updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save settings")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/settings/telegram/test")
async def test_telegram_connection():
    """Тестирование подключения к Telegram"""
    try:
        if not system_settings.telegram.enabled:
            raise HTTPException(status_code=400, detail="Telegram notifications are disabled")
        
        if not system_settings.telegram.bot_token or not system_settings.telegram.chat_id:
            raise HTTPException(status_code=400, detail="Bot token or chat ID not configured")
        
        # Обновляем настройки в сервисе
        if telegram_service:
            telegram_service.update_settings(system_settings.telegram)
            
            # Тестируем подключение
            success = await telegram_service.test_connection()
            if success:
                await telegram_service.send_message(f"Telegram connection test successful\nTime: {datetime.now()}")
                return {"message": "Telegram connection test successful"}
            else:
                raise HTTPException(status_code=400, detail="Failed to connect to Telegram API")
        else:
            raise HTTPException(status_code=503, detail="Telegram service not ready")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram test failed: {str(e)}")

# API endpoints для алертов
@app.get("/api/alerts")
async def get_alerts(limit: int = 100, offset: int = 0, 
                    alert_type: str = None, acknowledged: bool = None):
    """Получение списка алертов"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        alerts = alert_service.get_alerts(limit=limit, offset=offset, 
                                        alert_type=alert_type, acknowledged=acknowledged)
        return {
            "alerts": [
                {
                    "id": alert.id,
                    "type": alert.type,
                    "message": alert.message,
                    "severity": alert.severity,
                    "acknowledged": alert.acknowledged,
                    "acknowledged_by": alert.acknowledged_by,
                    "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
                    "created_at": alert.created_at.isoformat(),
                    "stream_id": alert.stream.stream_id if alert.stream else None,
                    "detection_id": alert.detection_id
                }
                for alert in alerts
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get alerts: {str(e)}")

@app.post("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, acknowledged_by: str = "system"):
    """Подтверждение алерта"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        success = alert_service.acknowledge_alert(alert_id, acknowledged_by)
        if success:
            return {"success": True, "message": "Alert acknowledged"}
        else:
            raise HTTPException(status_code=404, detail="Alert not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge alert: {str(e)}")

@app.get("/api/detections/history")
async def get_detection_history(limit: int = 100, offset: int = 0, 
                               stream_id: str = None, is_violence: bool = None):
    """Получение истории детекций"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        detections = alert_service.get_detections(limit=limit, offset=offset, 
                                                stream_id=stream_id, is_violence=is_violence)
        return {
            "detections": [
                {
                    "id": detection.id,
                    "stream_id": detection.stream.stream_id,
                    "timestamp": detection.timestamp.isoformat(),
                    "is_violence": detection.is_violence,
                    "confidence": detection.confidence,
                    "frame_data": detection.frame_data,
                    "processed": detection.processed,
                    "acknowledged": detection.acknowledged,
                    "created_at": detection.created_at.isoformat()
                }
                for detection in detections
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get detections: {str(e)}")

@app.post("/api/detections/{detection_id}/acknowledge")
async def acknowledge_detection(detection_id: int):
    """Подтверждение детекции"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        success = alert_service.acknowledge_detection(detection_id)
        if success:
            return {"success": True, "message": "Detection acknowledged"}
        else:
            raise HTTPException(status_code=404, detail="Detection not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge detection: {str(e)}")

@app.get("/api/statistics")
async def get_statistics(days: int = 7):
    """Получение статистики"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        stats = alert_service.get_statistics(days=days)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")

@app.post("/api/cleanup")
async def cleanup_old_data(days: int = 30):
    """Очистка старых данных"""
    if alert_service is None:
        raise HTTPException(status_code=503, detail="Alert service not available")
    
    try:
        result = alert_service.cleanup_old_data(days=days)
        return {
            "success": True,
            "message": f"Cleaned up data older than {days} days",
            "deleted": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cleanup data: {str(e)}")

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    if connection_manager is None:
        await websocket.close(code=503, reason="Service not ready")
        return
    
    await connection_manager.connect(websocket)
    try:
        while True:
            # Ожидание сообщений от клиента
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)

# WebSocket endpoint для видеопотоков
@app.websocket("/stream/{stream_id}")
async def stream_websocket(websocket: WebSocket, stream_id: str):
    await websocket.accept()
    
    # Проверяем, существует ли поток
    if rtsp_manager is None or stream_id not in rtsp_manager.streams:
        await websocket.close(code=4004, reason="Stream not found")
        return
    
    stream_processor = rtsp_manager.streams[stream_id]
    
    try:
        while True:
            # Проверяем, что поток активен
            if not stream_processor.is_running:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Stream is not running"
                }))
                break
            
            # Безопасно получаем последний кадр из буфера
            frame_data = None
            with stream_processor.buffer_lock:
                if stream_processor.frame_buffer:
                    # Берем последний кадр (формат CHW: 3, 224, 224)
                    last_frame = stream_processor.frame_buffer[-1]
                    
                    # Конвертируем обратно в HWC формат для OpenCV
                    frame_hwc = np.transpose(last_frame, (1, 2, 0))  # (H, W, C)
                    
                    # Конвертируем обратно в uint8 для кодирования
                    frame_uint8 = (frame_hwc * 255).astype(np.uint8)
                    
                    # Изменяем размер для передачи (лучшее качество)
                    frame_resized = cv2.resize(frame_uint8, (640, 480))
                    
                    # Кодируем в JPEG с высоким качеством
                    _, buffer = cv2.imencode('.jpg', frame_resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    frame_data = base64.b64encode(buffer).decode('utf-8')
                
            if frame_data:
                # Получаем последний результат детекции для этого потока
                last_detection = stream_processor.last_detection
                
                # Проверяем, не устарел ли результат детекции (больше 5 секунд)
                current_time = time.time()
                detection_data = None
                
                if last_detection and (current_time - last_detection.timestamp) < 5.0:
                    # Результат детекции актуален (не старше 5 секунд)
                    detection_data = {
                        "is_violence": last_detection.is_violence,
                        "confidence": last_detection.confidence,
                        "timestamp": last_detection.timestamp
                    }
                
                # Отправляем кадр с результатом детекции
                await websocket.send_text(json.dumps({
                    "type": "frame",
                    "stream_id": stream_id,
                    "timestamp": time.time(),
                    "frame": frame_data,
                    "detection": detection_data
                }))
            else:
                # Если буфер пуст, отправляем сообщение о загрузке
                await websocket.send_text(json.dumps({
                    "type": "loading",
                    "stream_id": stream_id,
                    "message": "Buffering frames..."
                }))
            
            # Ждем немного перед отправкой следующего кадра (25 FPS для баланса качества/производительности)
            await asyncio.sleep(0.04)  # 25 FPS для плавного видео
            
    except WebSocketDisconnect:
        print(f"Stream WebSocket disconnected for {stream_id}")
    except Exception as e:
        print(f"Stream WebSocket error for {stream_id}: {e}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e)
            }))
        except:
            pass

# Фоновая задача для отправки результатов детекции
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(broadcast_detection_results())

async def broadcast_detection_results():
    """Фоновая задача для отправки результатов детекции через WebSocket"""
    while True:
        try:
            if rtsp_manager is None or connection_manager is None:
                await asyncio.sleep(1)
                continue
                
            # Получение новых результатов
            detections = rtsp_manager.get_latest_detections()
            
            for detection in detections:
                message = {
                    "type": "detection_result",
                    "data": detection.model_dump()
                }
                await connection_manager.broadcast(json.dumps(message))
                
                # Обработка Telegram уведомлений
                if telegram_service:
                    await telegram_service.handle_detection(detection)
            
            # Отправка статуса потоков
            streams_status = rtsp_manager.get_all_streams()
            status_message = {
                "type": "streams_status",
                "data": [stream.model_dump() for stream in streams_status]
            }
            await connection_manager.broadcast(json.dumps(status_message))
            
            await asyncio.sleep(0.1)  # 10 FPS обновление
        except Exception as e:
            print(f"Error broadcasting results: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    import uvicorn
    
    # Обработка сигналов для graceful shutdown
    def signal_handler(signum, frame):
        print(f"\nReceived signal {signum}, shutting down gracefully...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    uvicorn.run(app, host="0.0.0.0", port=8003) 