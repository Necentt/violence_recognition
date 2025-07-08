#!/usr/bin/env python3
"""
Скрипт для мониторинга производительности системы распознавания насилия
"""

import time
import psutil
import requests
import json
from datetime import datetime

def get_system_info():
    """Получение информации о системе"""
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    return {
        'cpu_percent': cpu_percent,
        'memory_percent': memory.percent,
        'memory_used_gb': memory.used / (1024**3),
        'memory_total_gb': memory.total / (1024**3),
        'disk_percent': disk.percent,
        'disk_free_gb': disk.free / (1024**3)
    }

def get_backend_status():
    """Получение статуса backend"""
    try:
        response = requests.get('http://localhost:8003/api/status', timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return None
    except Exception as e:
        print(f"Ошибка подключения к backend: {e}")
        return None

def get_streams_info():
    """Получение информации о потоках"""
    try:
        response = requests.get('http://localhost:8003/api/streams', timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return []
    except Exception as e:
        print(f"Ошибка получения потоков: {e}")
        return []

def monitor_performance():
    """Основной цикл мониторинга"""
    print("🔍 Мониторинг производительности системы распознавания насилия")
    print("=" * 80)
    
    while True:
        try:
            # Получение системной информации
            system_info = get_system_info()
            
            # Получение статуса backend
            backend_status = get_backend_status()
            
            # Получение информации о потоках
            streams = get_streams_info()
            
            # Очистка экрана (работает в терминале)
            print("\033[2J\033[H")  # Очистка экрана
            
            # Вывод текущего времени
            print(f"🕐 Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 80)
            
            # Системная информация
            print("💻 СИСТЕМНЫЕ РЕСУРСЫ:")
            print(f"   CPU: {system_info['cpu_percent']:.1f}%")
            print(f"   RAM: {system_info['memory_percent']:.1f}% ({system_info['memory_used_gb']:.1f}GB / {system_info['memory_total_gb']:.1f}GB)")
            print(f"   Диск: {system_info['disk_percent']:.1f}% (свободно: {system_info['disk_free_gb']:.1f}GB)")
            
            # Статус backend
            print("\n🔧 BACKEND СТАТУС:")
            if backend_status:
                print(f"   Triton Server: {'🟢 Онлайн' if backend_status.get('triton_server') else '🔴 Офлайн'}")
                print(f"   Активные потоки: {backend_status.get('active_streams', 0)}")
                print(f"   Всего потоков: {backend_status.get('total_streams', 0)}")
                uptime = backend_status.get('uptime', 0)
                hours = int(uptime // 3600)
                minutes = int((uptime % 3600) // 60)
                print(f"   Время работы: {hours}ч {minutes}м")
            else:
                print("   🔴 Backend недоступен")
            
            # Информация о потоках
            print("\n📹 ПОТОКИ:")
            if streams:
                total_fps = 0
                total_frames = 0
                total_detections = 0
                
                for stream in streams:
                    status = "🟢" if stream.get('is_running') else "🔴"
                    fps = stream.get('fps', 0)
                    frames = stream.get('total_frames', 0)
                    detections = stream.get('detection_count', 0)
                    
                    print(f"   {status} {stream.get('name', stream.get('id'))}: {fps:.1f} FPS, {frames} кадров, {detections} детекций")
                    
                    total_fps += fps
                    total_frames += frames
                    total_detections += detections
                
                print(f"\n📊 ОБЩАЯ СТАТИСТИКА:")
                print(f"   Средний FPS: {total_fps/len(streams):.1f}")
                print(f"   Всего кадров: {total_frames}")
                print(f"   Всего детекций: {total_detections}")
            else:
                print("   Нет активных потоков")
            
            # Рекомендации по оптимизации
            print("\n💡 РЕКОМЕНДАЦИИ:")
            if system_info['cpu_percent'] > 80:
                print("   ⚠️  Высокая загрузка CPU - рассмотрите увеличение frame_skip")
            if system_info['memory_percent'] > 80:
                print("   ⚠️  Высокое потребление RAM - проверьте утечки памяти")
            if streams:
                avg_fps = sum(s.get('fps', 0) for s in streams) / len(streams)
                if avg_fps < 15:
                    print("   ⚠️  Низкий FPS - проверьте настройки производительности")
                if avg_fps > 25:
                    print("   ✅ Хорошая производительность")
            
            print("\n" + "=" * 80)
            print("Нажмите Ctrl+C для выхода")
            
            # Пауза перед следующим обновлением
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("\n\n👋 Мониторинг завершен")
            break
        except Exception as e:
            print(f"\n❌ Ошибка мониторинга: {e}")
            time.sleep(5)

if __name__ == "__main__":
    monitor_performance() 