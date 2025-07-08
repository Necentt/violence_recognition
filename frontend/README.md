# Violence Detection Frontend

Современный веб-интерфейс для системы детекции насилия на RTSP потоках.

## Технологии

- **React 18** с TypeScript
- **Material-UI (MUI)** для UI компонентов
- **React Router** для навигации
- **Axios** для HTTP запросов
- **WebSocket** для real-time обновлений

## Структура проекта

```
src/
├── components/          # Переиспользуемые компоненты
│   └── Navigation.tsx   # Боковая навигация
├── contexts/           # React контексты
│   ├── WebSocketContext.tsx  # WebSocket соединение
│   └── StreamsContext.tsx    # Управление потоками
├── pages/              # Страницы приложения
│   ├── Dashboard.tsx   # Главная страница
│   ├── StreamsManager.tsx  # Управление потоками
│   ├── Alerts.tsx      # Алерты и уведомления
│   └── Settings.tsx    # Настройки системы
└── App.tsx             # Главный компонент
```

## Функциональность

### Dashboard
- Обзор системы в реальном времени
- Статистика активных потоков
- Статус Triton сервера
- Количество детекций

### Streams Manager
- Добавление/удаление RTSP потоков
- Запуск/остановка потоков
- Мониторинг производительности
- Статистика детекций

### Alerts
- Просмотр алертов о насилии
- Настройка уведомлений
- История детекций

### Settings
- Настройки Triton сервера
- Параметры потоков
- Настройки производительности
- Безопасность

## Запуск

1. Установите зависимости:
```bash
npm install
```

2. Запустите development сервер:
```bash
npm start
```

3. Откройте http://localhost:3000

## Требования

- Backend сервер должен быть запущен на http://localhost:8003
- Triton Inference Server должен быть доступен
- Node.js 16+ и npm

## API Endpoints

Frontend взаимодействует с backend через следующие endpoints:

- `GET /api/streams` - список потоков
- `POST /api/streams` - добавление потока
- `DELETE /api/streams/{id}` - удаление потока
- `POST /api/streams/{id}/start` - запуск потока
- `POST /api/streams/{id}/stop` - остановка потока
- `GET /api/status` - статус системы
- `WS /ws` - WebSocket для real-time обновлений
