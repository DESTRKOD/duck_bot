const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.RENDER_URL;
const API_SECRET = process.env.API_SECRET;
const PORT = process.env.PORT || 10000;

// =========== ИНИЦИАЛИЗАЦИЯ EXPRESS ===========
const app = express();

// Проверка обязательных переменных
console.log('🔧 =========== НАСТРОЙКИ БОТА ===========');
console.log(`🤖 TG_TOKEN: ${TOKEN ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ!'}`);
console.log(`👑 ADMIN_CHAT_ID: ${ADMIN_ID ? '✅ ' + ADMIN_ID : '❌ Не установлен'}`);
console.log(`🌐 SERVER_URL: ${SERVER_URL ? '✅ ' + SERVER_URL : '❌ Не установлен'}`);
console.log(`🔐 API_SECRET: ${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}`);
console.log(`📡 PORT: ${PORT}`);
console.log(`=========================================`);

if (!TOKEN) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: TG_TOKEN не установлен!');
  console.error('Добавьте TG_TOKEN в переменные окружения Render');
  process.exit(1);
}

if (!ADMIN_ID) {
  console.error('⚠️ ВНИМАНИЕ: ADMIN_CHAT_ID не установлен');
  console.error('Бот будет работать, но уведомления никому не придут!');
}

if (!SERVER_URL) {
  console.error('⚠️ ВНИМАНИЕ: RENDER_URL не установлен');
  console.error('Работа с магазином будет недоступна');
}

if (!API_SECRET) {
  console.error('⚠️ ВНИМАНИЕ: API_SECRET не установлен');
  console.error('Уведомления от сервера НЕ БУДУТ работать!');
}

console.log('✅ Настройки загружены из переменных окружения');

// =========== ФУНКЦИИ ЭКРАНИРОВАНИЯ ===========
function escapeMarkdown(text) {
  if (!text) return '';
  return text.toString()
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

// =========== ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК ===========
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  console.log('🔄 Продолжаю работу...');
});

// =========== НАСТРОЙКА EXPRESS ===========
app.use(express.json());

// Разрешаем CORS для всех
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// =========== ХРАНИЛИЩЕ ДАННЫХ ===========
// Хранилище активных заказов
const activeOrders = {};
// Хранилище состояний пользователей
const userStates = {};

// =========== ЭНДПОИНТЫ ===========

// Главный эндпоинт для уведомлений о заказах от сервера магазина
app.post('/api/order-notify', async (req, res) => {
  try {
    const { order_id, email, items, amount, code, secret, stage } = req.body;
    
    console.log(`📦 =========== ПОЛУЧЕНО УВЕДОМЛЕНИЕ О ЗАКАЗЕ ===========`);
    console.log(`🆔 Order ID: ${order_id}`);
    console.log(`📧 Email: ${email}`);
    console.log(`💰 Amount: ${amount}`);
    console.log(`🔢 Code: ${code || 'null'}`);
    console.log(`📊 Stage: ${stage || 'unknown'}`);
    console.log(`🔐 Secret provided: ${secret ? 'Да' : 'Нет'}`);
    console.log(`🔑 Expected secret: ${API_SECRET}`);
    console.log(`📦 Items:`, items);
    console.log(`=======================================================`);
    
    // Проверка секрета
    if (!API_SECRET) {
      console.log('❌ ОШИБКА: API_SECRET не установлен на боте!');
      return res.status(500).json({ 
        success: false, 
        error: 'API_SECRET not configured',
        message: 'Бот не настроен, проверьте переменные окружения' 
      });
    }
    
    if (secret !== API_SECRET) {
      console.log('❌ ОШИБКА: Неверный секрет от сервера магазина');
      console.log(`Предоставлено: ${secret}`);
      console.log(`Ожидалось: ${API_SECRET}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized',
        message: 'Invalid secret' 
      });
    }
    
    if (!order_id || !email) {
      console.log('❌ ОШИБКА: Отсутствуют обязательные поля');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    if (!ADMIN_ID) {
      console.log('❌ ОШИБКА: ADMIN_CHAT_ID не установлен, некому отправить уведомление');
      return res.status(500).json({ 
        success: false, 
        error: 'No admin configured',
        message: 'ADMIN_CHAT_ID not set' 
      });
    }
    
    console.log(`✅ Секрет проверен, отправляю уведомление администратору ${ADMIN_ID}...`);
    
    // Отправляем уведомление администратору
    const notificationSent = await sendOrderNotification(order_id, email, items, amount, code, stage);
    
    if (notificationSent) {
      console.log(`✅ Уведомление отправлено администратору ${ADMIN_ID}`);
      res.json({ 
        success: true, 
        message: 'Notification sent',
        admin_id: ADMIN_ID,
        order_id: order_id,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`❌ Не удалось отправить уведомление администратору`);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send notification',
        admin_id: ADMIN_ID
      });
    }
    
  } catch (error) {
    console.error('💥 ОШИБКА обработки уведомления:', error.message);
    console.error(error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Эндпоинт для обновления статуса заказа
app.post('/api/order-update', async (req, res) => {
  try {
    const { order_id, status, admin_comment, secret } = req.body;
    
    // Проверка секрета
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    console.log(`📝 Обновление статуса заказа ${order_id}: ${status}`);
    
    // Отправляем запрос на сервер магазина
    if (SERVER_URL) {
      await axios.post(`${SERVER_URL}/api/order-status-update`, {
        order_id,
        status,
        admin_comment,
        secret: API_SECRET
      }, { timeout: 10000 });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Проверка связи с сервером магазина
app.post('/api/test-connection', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!SERVER_URL) {
      return res.status(400).json({
        success: false,
        error: 'SERVER_URL не установлен'
      });
    }
    
    console.log(`🔍 Проверяю соединение с сервером магазина: ${SERVER_URL}`);
    
    // Проверяем доступность сервера
    const healthResponse = await axios.get(`${SERVER_URL}/check`, { timeout: 10000 });
    console.log('✅ Сервер доступен:', healthResponse.data);
    
    // Проверяем API_SECRET
    const testResponse = await axios.post(`${SERVER_URL}/api/test-notification`, {
      secret: API_SECRET
    }, { timeout: 15000 });
    
    console.log('✅ API_SECRET проверен:', testResponse.data);
    
    res.json({
      success: true,
      server_available: true,
      api_secret_valid: true,
      server_response: healthResponse.data,
      test_response: testResponse.data,
      bot_settings: {
        admin_id: ADMIN_ID,
        api_secret_set: !!API_SECRET,
        server_url: SERVER_URL
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка проверки соединения:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      server_url: SERVER_URL
    });
  }
});

// Главная страница
app.get('/', (req, res) => {
  const externalUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  const notificationsStatus = API_SECRET && ADMIN_ID ? 
    '<div class="success">🔔 Уведомления: ✅ АКТИВНЫ</div>' : 
    '<div class="warning">🔔 Уведомления: ❌ НЕ АКТИВНЫ</div>';
  
  const adminStatus = ADMIN_ID ? 
    `<div class="success">👑 Админ: ✅ ${ADMIN_ID}</div>` : 
    '<div class="error">👑 Админ: ❌ НЕ НАСТРОЕН</div>';
  
  const serverStatus = SERVER_URL ? 
    `<div class="success">🌐 Сервер магазина: ✅ ${SERVER_URL}</div>` : 
    '<div class="warning">🌐 Сервер магазина: ❌ НЕ НАСТРОЕН</div>';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 Duck Shop Bot</title>
      <style>
        body { font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto; }
        .status { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 5px; }
        .info { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .warning { background: #ff9800; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .success { background: #4CAF50; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .error { background: #f44336; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .stat { display: flex; justify-content: space-between; margin: 5px 0; padding: 5px 0; border-bottom: 1px solid #eee; }
        .stat-name { font-weight: bold; }
        .stat-value { color: #2196F3; font-weight: bold; }
        .orders-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .order-item { padding: 8px; margin: 5px 0; background: #e8f5e8; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>🤖 Duck Shop Bot</h1>
      <div class="status">✅ Статус: Работает</div>
      
      ${adminStatus}
      ${serverStatus}
      ${notificationsStatus}
      
      ${!TOKEN ? '<div class="error">⚠️ TG_TOKEN не установлен!</div>' : ''}
      ${!API_SECRET ? '<div class="error">⚠️ API_SECRET не установлен!</div>' : ''}
      
      ${TOKEN && ADMIN_ID && SERVER_URL && API_SECRET ? '<div class="success">✅ Все настройки корректны, уведомления работают!</div>' : ''}
      
      <div class="info">
        <h3>📊 Статистика:</h3>
        <div class="stat">
          <span class="stat-name">Активных заказов:</span>
          <span class="stat-value">${Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length}</span>
        </div>
        <div class="stat">
          <span class="stat-name">Всего заказов:</span>
          <span class="stat-value">${Object.keys(activeOrders).length}</span>
        </div>
        <div class="stat">
          <span class="stat-name">Активных сессий:</span>
          <span class="stat-value">${Object.keys(userStates).length}</span>
        </div>
        <div class="stat">
          <span class="stat-name">Время работы:</span>
          <span class="stat-value">${Math.floor(process.uptime() / 3600)}ч ${Math.floor((process.uptime() % 3600) / 60)}м</span>
        </div>
        <div class="stat">
          <span class="stat-name">Внешний URL:</span>
          <span class="stat-value"><a href="${externalUrl}">${externalUrl}</a></span>
        </div>
        <div class="stat">
          <span class="stat-name">Сервер магазина:</span>
          <span class="stat-value">${SERVER_URL ? `<a href="${SERVER_URL}">${SERVER_URL}</a>` : 'Не настроен'}</span>
        </div>
        <div class="stat">
          <span class="stat-name">Текущее время:</span>
          <span class="stat-value">${new Date().toLocaleString()}</span>
        </div>
      </div>
      
      <div class="info">
        <h3>📋 Активные заказы (ожидают проверки):</h3>
        ${Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length > 0 ? 
          `<div class="orders-list">
            ${Object.entries(activeOrders)
              .filter(([id, order]) => order.status === 'pending')
              .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp))
              .map(([id, order]) => `
                <div class="order-item">
                  <strong>🆔 ${id}</strong><br>
                  📧 ${order.email}<br>
                  ${order.code ? `🔢 Код: ${order.code}<br>` : '🔢 Код: ожидается<br>'}
                  💰 ${order.amount}₽<br>
                  ⏰ ${new Date(order.timestamp).toLocaleTimeString()}
                </div>
              `).join('')}
          </div>` : 
          '<p>Нет активных заказов</p>'}
      </div>
      
      <h3>📡 API Endpoints:</h3>
      <ul>
        <li><a href="/status">/status</a> - Статус бота (JSON)</li>
        <li><a href="/health">/health</a> - Проверка здоровья</li>
        <li><a href="/connections">/connections</a> - Статус подключений</li>
        <li><a href="/orders">/orders</a> - Активные заказы (JSON)</li>
        <li>POST /api/order-notify - <strong>Уведомления о заказах</strong></li>
        <li>POST /api/order-update - Обновление статусов</li>
        <li>POST /api/test-connection - Тест связи с сервером</li>
        ${SERVER_URL ? `<li><a href="${SERVER_URL}">Сервер магазина</a></li>` : ''}
      </ul>
      
      <h3>🔧 Переменные окружения:</h3>
      <pre style="background: #eee; padding: 10px; border-radius: 5px; overflow-x: auto;">
TG_TOKEN: ${TOKEN ? '✅ Установлен' : '❌ Отсутствует'}
ADMIN_CHAT_ID: ${ADMIN_ID ? '✅ Установлен' : '❌ Отсутствует'}
RENDER_URL: ${SERVER_URL ? '✅ Установлен' : '❌ Отсутствует'}
API_SECRET: ${API_SECRET ? '✅ Установлен' : '❌ Отсутствует'}
PORT: ${PORT}
NODE_ENV: ${process.env.NODE_ENV || 'Не установлен'}
RENDER: ${process.env.RENDER ? '✅ Да' : '❌ Нет'}
RENDER_EXTERNAL_URL: ${process.env.RENDER_EXTERNAL_URL || 'Не установлен'}
      </pre>
      
      <div class="info">
        <h3>🔔 Инструкция по настройке уведомлений:</h3>
        <ol>
          <li>Убедитесь что <strong>API_SECRET</strong> совпадает на сервере и боте</li>
          <li>Установите <strong>ADMIN_CHAT_ID</strong> (ваш Telegram ID)</li>
          <li>Установите <strong>RENDER_URL</strong> (адрес сервера магазина)</li>
          <li>Перезапустите оба сервиса на Render</li>
          <li>Используйте команду <code>/testconnection</code> в боте для проверки</li>
        </ol>
      </div>
      
      <p style="margin-top: 40px; color: #666;">
        🤖 Бот работает 24/7 на Render.com<br>
        🔄 Для получения уведомлений убедитесь что API_SECRET совпадает с сервером магазина
      </p>
    </body>
    </html>
  `);
});

// Статус бота (JSON)
app.get('/status', (req, res) => {
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending');
  
  res.json({
    success: true,
    service: 'Duck Shop Bot',
    status: 'running',
    uptime: process.uptime(),
    admin_id: ADMIN_ID,
    active_users: Object.keys(userStates).length,
    active_orders: pendingOrders.length,
    total_orders: Object.keys(activeOrders).length,
    server_url: SERVER_URL,
    api_secret_set: !!API_SECRET,
    bot_configured: !!(TOKEN && ADMIN_ID && SERVER_URL && API_SECRET),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    node_version: process.version
  });
});

// Проверка здоровья
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Bot is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot_token: TOKEN ? 'configured' : 'not_configured',
    admin_id: ADMIN_ID ? 'configured' : 'not_configured',
    notifications: API_SECRET ? 'enabled' : 'disabled'
  });
});

// Статус подключений
app.get('/connections', (req, res) => {
  res.json({
    success: true,
    connections: {
      telegram: {
        token: TOKEN ? 'configured' : 'not_configured',
        admin_id: ADMIN_ID || 'not_configured'
      },
      server: {
        url: SERVER_URL || 'not_configured',
        api_secret: API_SECRET ? 'configured' : 'not_configured'
      },
      notifications: {
        active_orders: Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length,
        total_orders: Object.keys(activeOrders).length,
        last_notification: Object.keys(activeOrders).length > 0 ? 
          new Date(Math.max(...Object.values(activeOrders).map(o => new Date(o.timestamp).getTime()))).toISOString() : 
          null
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Список активных заказов (JSON)
app.get('/orders', (req, res) => {
  const pendingOrders = Object.entries(activeOrders)
    .filter(([id, order]) => order.status === 'pending')
    .map(([id, order]) => ({
      id,
      email: order.email,
      code: order.code,
      amount: order.amount,
      items: order.items,
      timestamp: order.timestamp,
      status: order.status,
      stage: order.stage
    }));
  
  res.json({
    success: true,
    orders: pendingOrders,
    count: pendingOrders.length,
    total_orders: Object.keys(activeOrders).length
  });
});

// Keep-alive для Render (предотвращает сон)
app.get('/keep-alive', (req, res) => {
  res.json({
    success: true,
    message: 'Keep-alive request received',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// =========== ЗАПУСК ВЕБ-СЕРВЕРА ===========
const server = app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
  console.log(`🔗 Внутренний URL: http://localhost:${PORT}`);
  
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌍 Внешний URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
});

// =========== ТЕЛЕГРАМ БОТ ===========
let bot;
try {
  bot = new TelegramBot(TOKEN, { 
    polling: true,
    request: {
      timeout: 60000,
      agentOptions: { keepAlive: true }
    }
  });
  console.log('🤖 Duck Shop Bot запущен');
} catch (error) {
  console.error('❌ Не удалось запустить бота:', error.message);
  console.error('Проверьте TG_TOKEN в переменных окружения Render');
  process.exit(1);
}

console.log(`👑 Администратор: ${ADMIN_ID || 'Не установлен'}`);
console.log(`🌐 Сервер магазина: ${SERVER_URL || 'Не установлен'}`);
console.log(`🔐 API Secret: ${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}`);
console.log(`📡 Веб-порт: ${PORT}`);
console.log(`🔄 Уведомления о заказах: ${API_SECRET && ADMIN_ID ? '✅ Активны' : '❌ Не активны'}`);

// =========== ФУНКЦИИ УВЕДОМЛЕНИЙ ===========

// Отправка уведомления о новом заказе
async function sendOrderNotification(orderId, email, items, amount, code, stage) {
  try {
    if (!ADMIN_ID) {
      console.log('⚠️ ADMIN_CHAT_ID не установлен, уведомление не отправлено');
      return false;
    }

    console.log(`📤 Отправляю уведомление о заказе ${orderId} администратору ${ADMIN_ID}`);

    // Форматируем список товаров
    let itemsText = '';
    if (items && typeof items === 'object') {
      for (const [itemId, quantity] of Object.entries(items)) {
        itemsText += `  • ${itemId}: ${quantity} шт.\n`;
      }
    } else {
      itemsText = '  • Информация о товарах отсутствует\n';
    }

    const stageText = stage === 'email_submitted' ? '📧 EMAIL ВВЕДЁН' : 
                     stage === 'code_submitted' ? '🔢 КОД ОТПРАВЛЕН' : 
                     '📦 НОВЫЙ ЗАКАЗ';
    const stageEmoji = stage === 'email_submitted' ? '📧' : 
                      stage === 'code_submitted' ? '🔢' : '📦';
    
    const message = 
      `${stageEmoji} *${stageText}*\n\n` +
      `📦 *Заказ:* \`${orderId}\`\n` +
      `📧 *Почта:* ${escapeMarkdown(email)}\n` +
      `${code ? `🔢 *Код:* \`${code}\`\n` : '🔢 *Код:* Ожидается ввод\n'}` +
      `💰 *Сумма:* ${amount || 0}₽\n\n` +
      `🛒 *Состав заказа:*\n${itemsText}\n` +
      `⏰ *Время:* ${new Date().toLocaleTimeString()}`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Всё ок, подтвердить', callback_data: `approve_${orderId}` },
            { text: '❌ Отклонить', callback_data: `reject_${orderId}` }
          ],
          [
            { text: '📋 Подробнее', callback_data: `details_${orderId}` }
          ]
        ]
      }
    };

    // Отправляем сообщение
    const sentMessage = await bot.sendMessage(ADMIN_ID, message, { 
      parse_mode: 'Markdown',
      ...keyboard 
    });

    console.log(`✅ Уведомление о заказе ${orderId} отправлено администратору`);
    
    // Сохраняем информацию о заказе
    activeOrders[orderId] = {
      email,
      items,
      amount,
      code,
      status: 'pending',
      timestamp: new Date().toISOString(),
      message_id: sentMessage.message_id,
      stage: stage || 'unknown'
    };

    return true;

  } catch (error) {
    console.error('❌ Ошибка отправки уведомления:', error.message);
    console.error('Детали ошибки:', error);
    return false;
  }
}

// Отправка уведомления о подтверждении/отклонении
async function sendStatusUpdate(orderId, status, adminComment = '') {
  try {
    const order = activeOrders[orderId];
    if (!order) {
      console.log(`⚠️ Заказ ${orderId} не найден в activeOrders`);
      return;
    }

    const statusText = status === 'approved' ? '✅ ПОДТВЕРЖДЁН' : '❌ ОТКЛОНЁН';
    
    const message = 
      `${status === 'approved' ? '✅' : '❌'} *СТАТУС ЗАКАЗА ОБНОВЛЁН*\n\n` +
      `📦 *Заказ:* \`${orderId}\`\n` +
      `📧 *Почта:* ${escapeMarkdown(order.email)}\n` +
      `${order.code ? `🔢 *Код:* \`${order.code}\`\n` : ''}` +
      `📊 *Статус:* ${statusText}\n` +
      `${adminComment ? `💬 *Комментарий:* ${escapeMarkdown(adminComment)}\n` : ''}` +
      `⏰ *Время:* ${new Date().toLocaleTimeString()}`;

    await bot.sendMessage(ADMIN_ID, message, { 
      parse_mode: 'Markdown' 
    });

    console.log(`📤 Уведомление о статусе заказа ${orderId} отправлено`);

    // Обновляем статус заказа
    if (activeOrders[orderId]) {
      activeOrders[orderId].status = status;
      activeOrders[orderId].updated = new Date().toISOString();
    }

  } catch (error) {
    console.error('❌ Ошибка отправки обновления статуса:', error.message);
  }
}

// =========== КОМАНДЫ ТЕЛЕГРАМ ===========

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, 
      '👋 Привет! Я бот для управления магазином Duck Shop.\n' +
      '⚙️ Только администратор может управлять товарами и заказами.'
    );
  }
  
  if (!ADMIN_ID) {
    console.warn(`⚠️ ADMIN_CHAT_ID не установлен. Пользователь ${userId} получил доступ к админ-панели`);
  }
  
  showMainMenu(chatId, `👑 ${ADMIN_ID && userId === ADMIN_ID ? 'Администратор' : 'Пользователь'} ${msg.from.first_name}!`);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  
  bot.sendMessage(chatId,
    '📋 **Доступные команды:**\n\n' +
    '`/start` - Главное меню\n' +
    '`/products` - Список товаров\n' +
    '`/orders` - Активные заказы\n' +
    '`/server` - Проверить сервер\n' +
    '`/status` - Статус бота\n' +
    '`/testconnection` - Проверить связь с сервером\n' +
    '`/cancel` - Отменить действие\n\n' +
    '**Кнопки меню:**\n' +
    '📦 Добавить товар - Добавить новый товар\n' +
    '📋 Список товаров - Показать все товары\n' +
    '📊 Активные заказы - Заказы на проверке\n' +
    '❌ Удалить товар - Удалить товар\n' +
    '🔄 Проверить сервер - Статус сервера',
    { parse_mode: 'Markdown' }
  );
});

// Команда для теста соединения с сервером
bot.onText(/\/testconnection/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  
  if (!API_SECRET) {
    return bot.sendMessage(chatId, 
      '❌ API_SECRET не установлен!\n' +
      'Добавьте API_SECRET в переменные окружения Render.'
    );
  }
  
  try {
    bot.sendMessage(chatId, '🔍 Проверяю соединение с сервером магазина...');
    
    const response = await axios.post(`${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/test-connection`, {
      secret: API_SECRET
    }, {
      timeout: 15000
    });
    
    const data = response.data;
    
    if (data.success) {
      let message = '✅ *Соединение с сервером установлено!*\n\n';
      message += `🤖 Бот: ${data.bot_settings.api_secret_set ? '✅' : '❌'}\n`;
      message += `🌐 Сервер: ${data.server_available ? '✅' : '❌'}\n`;
      message += `🔐 API_SECRET: ${data.api_secret_valid ? '✅' : '❌'}\n\n`;
      
      if (data.server_available && data.api_secret_valid) {
        message += '🎉 *Уведомления будут работать корректно!*\n';
        message += 'Теперь при оформлении заказов на сайте вы будете получать уведомления.';
      } else {
        message += '⚠️ *Есть проблемы с настройками!*\n';
        message += 'Уведомления могут не работать. Проверьте переменные окружения.';
      }
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, 
        `❌ Ошибка проверки соединения:\n${data.error || 'Неизвестная ошибка'}`
      );
    }
    
  } catch (error) {
    bot.sendMessage(chatId, 
      `💥 Ошибка проверки соединения:\n${error.message}\n\n` +
      'Проверьте:\n' +
      '1. Сервер магазина запущен\n' +
      '2. API_SECRET совпадает на сервере и боте\n' +
      '3. RENDER_URL правильно указан в боте'
    );
  }
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  await listProducts(chatId);
});

bot.onText(/\/orders/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  
  await listActiveOrders(chatId);
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  
  let statusMessage = `🤖 **Статус бота:**\n\n` +
    `✅ Работает\n` +
    `⏰ Время работы: ${hours}ч ${minutes}м ${seconds}с\n` +
    `👥 Активных сессий: ${Object.keys(userStates).length}\n` +
    `📦 Активных заказов: ${pendingOrders}\n` +
    `📊 Всего заказов: ${Object.keys(activeOrders).length}\n` +
    `🌐 Веб-сервер: ${process.env.RENDER_EXTERNAL_URL || `Порт ${PORT}`}\n`;
  
  if (SERVER_URL) {
    statusMessage += `🛒 Сервер магазина: ${SERVER_URL}\n`;
  } else {
    statusMessage += `⚠️ RENDER_URL: Не установлен\n`;
  }
  
  statusMessage += `🔑 Админ ID: ${ADMIN_ID || 'Не установлен'}\n`;
  statusMessage += `🔐 API Secret: ${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}`;
  
  bot.sendMessage(chatId, escapeMarkdown(statusMessage), { parse_mode: 'Markdown' });
});

bot.onText(/\/server/, async (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  await checkServer(chatId);
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  delete userStates[chatId];
  bot.sendMessage(chatId, '❌ Действие отменено', getMainKeyboard());
});

// =========== ГЛАВНОЕ МЕНЮ ===========
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ['📦 Добавить товар', '📋 Список товаров'],
        ['📊 Активные заказы', '❌ Удалить товар'],
        ['🔄 Проверить сервер', '📊 Статус бота'],
        ['🔧 Тест соединения', '❓ Помощь']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

function showMainMenu(chatId, text = 'Выберите действие:') {
  bot.sendMessage(chatId, text, getMainKeyboard());
}

// =========== ОБРАБОТКА КНОПОК ===========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  if (text.startsWith('/')) return;
  
  if (text === '📦 Добавить товар') {
    if (!SERVER_URL) {
      return bot.sendMessage(chatId, '❌ RENDER_URL не установлен.\nДобавьте переменную RENDER_URL в настройки Render.');
    }
    userStates[chatId] = { step: 'name' };
    bot.sendMessage(chatId, '📝 Введите название товара:\n\nПример: "50 кристаллов" или "Brawl Pass"');
  }
  else if (text === '📋 Список товаров') {
    await listProducts(chatId);
  }
  else if (text === '📊 Активные заказы') {
    await listActiveOrders(chatId);
  }
  else if (text === '❌ Удалить товар') {
    if (!SERVER_URL) {
      return bot.sendMessage(chatId, '❌ RENDER_URL не установлен.');
    }
    await showDeleteMenu(chatId);
  }
  else if (text === '🔄 Проверить сервер') {
    await checkServer(chatId);
  }
  else if (text === '📊 Статус бота') {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
    
    let statusMessage = `🤖 **Статус бота:**\n\n` +
      `✅ Работает\n` +
      `⏰ Время работы: ${hours}ч ${minutes}м ${seconds}с\n` +
      `👥 Активных сессий: ${Object.keys(userStates).length}\n` +
      `📦 Активных заказов: ${pendingOrders}\n` +
      `🌐 Веб-сервер: ${process.env.RENDER_EXTERNAL_URL || `Порт ${PORT}`}\n`;
    
    statusMessage += `🔑 Админ ID: ${ADMIN_ID || 'Не установлен'}`;
    
    bot.sendMessage(chatId, escapeMarkdown(statusMessage), { parse_mode: 'Markdown' });
  }
  else if (text === '🔧 Тест соединения') {
    if (!API_SECRET) {
      return bot.sendMessage(chatId, 
        '❌ API_SECRET не установлен!\n' +
        'Добавьте API_SECRET в переменные окружения Render.'
      );
    }
    
    try {
      bot.sendMessage(chatId, '🔍 Проверяю соединение с сервером магазина...');
      
      const response = await axios.post(`${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/test-connection`, {
        secret: API_SECRET
      }, {
        timeout: 15000
      });
      
      const data = response.data;
      
      if (data.success) {
        let message = '✅ *Соединение с сервером установлено!*\n\n';
        message += `🤖 Бот: ${data.bot_settings.api_secret_set ? '✅' : '❌'}\n`;
        message += `🌐 Сервер: ${data.server_available ? '✅' : '❌'}\n`;
        message += `🔐 API_SECRET: ${data.api_secret_valid ? '✅' : '❌'}\n\n`;
        
        if (data.server_available && data.api_secret_valid) {
          message += '🎉 *Уведомления будут работать корректно!*\n';
          message += 'Теперь при оформлении заказов на сайте вы будете получать уведомления.';
        } else {
          message += '⚠️ *Есть проблемы с настройками!*\n';
          message += 'Уведомления могут не работать. Проверьте переменные окружения.';
        }
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, 
          `❌ Ошибка проверки соединения:\n${data.error || 'Неизвестная ошибка'}`
        );
      }
      
    } catch (error) {
      bot.sendMessage(chatId, 
        `💥 Ошибка проверки соединения:\n${error.message}\n\n` +
        'Проверьте:\n' +
        '1. Сервер магазина запущен\n' +
        '2. API_SECRET совпадает на сервере и боте\n' +
        '3. RENDER_URL правильно указан в боте'
      );
    }
  }
  else if (text === '❓ Помощь') {
    bot.sendMessage(chatId, 'Напишите /help для списка команд');
  }
  else if (userStates[chatId]) {
    await handleProductStep(chatId, text);
  }
});

// =========== ОСНОВНЫЕ ФУНКЦИИ БОТА ===========

// 1. Получить список товаров
async function listProducts(chatId) {
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ RENDER_URL не установлен.\nНе могу подключиться к серверу магазина.');
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Загружаю товары...');
    
    const response = await axios.get(`${SERVER_URL}/api/products`, {
      timeout: 10000
    });
    
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Товаров в магазине нет');
    }
    
    let message = `📋 *Товаров в магазине:* ${products.length}\\n\\n`;
    products.forEach((p, i) => {
      const safeName = escapeMarkdown(p.name || '');
      const safeId = escapeMarkdown(p.id || '');
      
      message += `${i+1}\\. *${safeName}*\\n`;
      message += `   💰 ${p.price}₽ \\| 🆔 ${safeId}\\n`;
      if (p.gift) message += `   🎁 Подарочный товар\\n`;
      message += '\\n';
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка получения товаров:', error.message);
    bot.sendMessage(chatId, 
      '❌ Не удалось получить товары\\n' +
      `Ошибка: ${escapeMarkdown(error.message || 'Сервер недоступен')}`,
      { parse_mode: 'Markdown' }
    );
  }
}

// 2. Список активных заказов
async function listActiveOrders(chatId) {
  const pendingOrders = Object.entries(activeOrders)
    .filter(([id, order]) => order.status === 'pending')
    .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
  
  if (pendingOrders.length === 0) {
    return bot.sendMessage(chatId, '📭 Нет активных заказов, ожидающих проверки');
  }
  
  let message = `📊 *Активные заказы:* ${pendingOrders.length}\\n\\n`;
  
  pendingOrders.forEach(([orderId, order], index) => {
    message += `${index+1}\\. *Заказ:* \`${orderId}\`\\n`;
    message += `   📧 ${escapeMarkdown(order.email)}\\n`;
    message += `   ${order.code ? `🔢 Код: \`${order.code}\`\\n` : '🔢 Код: Ожидается\\n'}`;
    message += `   💰 ${order.amount || 0}₽\\n`;
    
    // Подсчет товаров
    let itemsCount = 0;
    if (order.items && typeof order.items === 'object') {
      itemsCount = Object.values(order.items).reduce((sum, qty) => sum + qty, 0);
    }
    message += `   🛒 Товаров: ${itemsCount} шт\\n`;
    
    const timeDiff = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    message += `   ⏰ ${timeDiff} мин назад\\n\\n`;
  });
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Обновить', callback_data: 'refresh_orders' }],
        [{ text: '📋 Все заказы (подробно)', callback_data: 'all_orders_details' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    ...keyboard 
  });
}

// 3. Проверить сервер
async function checkServer(chatId) {
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ RENDER_URL не установлен.');
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Проверяю сервер магазина...');
    
    const response = await axios.get(`${SERVER_URL}/check`, {
      timeout: 10000
    });
    
    const data = response.data;
    const message = 
      `✅ *Сервер магазина работает*\\n\\n` +
      `📦 Товаров: ${data.products_count || 0}\\n` +
      `📊 Заказов всего: ${data.orders_count || 0}\\n` +
      `⏳ Ожидают проверки: ${data.pending_orders || 0}\\n` +
      `🛒 Shop ID: ${data.shop_id || 'Не указан'}\\n` +
      `🌐 URL: ${escapeMarkdown(SERVER_URL)}\\n` +
      `⏰ Время сервера: ${new Date(data.time).toLocaleTimeString()}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, 
      `❌ *Сервер недоступен*\\n` +
      `Ошибка: ${escapeMarkdown(error.message)}\\n` +
      `URL: ${escapeMarkdown(SERVER_URL)}`,
      { parse_mode: 'Markdown' }
    );
  }
}

// 4. Добавление товара (по шагам)
async function handleProductStep(chatId, text) {
  const state = userStates[chatId];
  
  if (state.step === 'name') {
    state.name = text;
    state.step = 'price';
    bot.sendMessage(chatId, '💰 Введите цену товара (только цифры):\n\nПример: 500 или 1250');
  }
  else if (state.step === 'price') {
    const price = parseInt(text);
    if (isNaN(price) || price <= 0) {
      return bot.sendMessage(chatId, '❌ Введите корректную цену!\nТолько цифры, больше 0\nПример: 500');
    }
    
    state.price = price;
    state.step = 'image';
    bot.sendMessage(chatId, 
      '🖼️ Введите URL картинки:\n\n' +
      'Пример: https://i.imgur.com/ваша_картинка.png\n' +
      '📌 Загрузите картинку на imgur.com и скопируйте ссылку'
    );
  }
  else if (state.step === 'image') {
    const imageUrl = text.trim();
    
    if (!imageUrl.startsWith('http')) {
      return bot.sendMessage(chatId, '❌ Некорректный URL!\nДолжен начинаться с http:// или https://');
    }
    
    state.image = imageUrl;
    state.step = 'confirm';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Обычный товар', callback_data: 'confirm_normal' },
            { text: '🎁 Подарочный', callback_data: 'confirm_gift' }
          ],
          [
            { text: '❌ Отмена', callback_data: 'cancel_add' }
          ]
        ]
      }
    };
    
    bot.sendMessage(chatId,
      `📝 *Проверьте данные товара:*\\n\\n` +
      `📦 *Название:* ${escapeMarkdown(state.name)}\\n` +
      `💰 *Цена:* ${state.price}₽\\n` +
      `🖼️ *Картинка:* ${escapeMarkdown(state.image.substring(0, 50))}\\.\\.\\.\\n\\n` +
      `Выберите тип товара:`,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }
}

// 5. Меню удаления товара
async function showDeleteMenu(chatId) {
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ RENDER_URL не установлен.');
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Загружаю список товаров...');
    
    const response = await axios.get(`${SERVER_URL}/api/products`);
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Нет товаров для удаления');
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: products.map(p => [
          { text: `❌ ${escapeMarkdown(p.name)} - ${p.price}₽`, callback_data: `delete_${p.id}` }
        ]).concat([[{ text: '↩️ Назад в меню', callback_data: 'back_to_main' }]])
      }
    };
    
    bot.sendMessage(chatId, 'Выберите товар для удаления:', keyboard);
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Ошибка загрузки товаров: ${error.message}`);
  }
}

// =========== ОБРАБОТКА CALLBACK ===========
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  // Добавление товара
  if (data === 'confirm_normal' || data === 'confirm_gift') {
    const state = userStates[chatId];
    if (!state || state.step !== 'confirm') return;
    
    try {
      if (!SERVER_URL || !API_SECRET) {
        throw new Error('Не настроены SERVER_URL или API_SECRET');
      }
      
      // Генерируем ID товара
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const productData = {
        id: productId,
        name: state.name,
        price: state.price,
        image: state.image,
        gift: data === 'confirm_gift',
        secret: API_SECRET
      };
      
      console.log('📤 Отправка товара на сервер:', productData.name);
      
      // Отправляем на сервер магазина
      const response = await axios.post(`${SERVER_URL}/api/add-product`, productData, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data?.success) {
        bot.editMessageText(
          `✅ *Товар успешно добавлен\\!*\\n\\n` +
          `📦 ${escapeMarkdown(state.name)}\\n` +
          `💰 ${state.price}₽\\n` +
          `🆔 ${escapeMarkdown(productId)}\\n` +
          `${data === 'confirm_gift' ? '🎁 Подарочный товар' : '📦 Обычный товар'}\\n\\n` +
          `🔄 Теперь товар доступен в магазине\\!`,
          { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
        );
        
        // Очищаем состояние
        delete userStates[chatId];
        
        // Через 2 сек показываем главное меню
        setTimeout(() => showMainMenu(chatId, 'Товар добавлен! Что дальше?'), 2000);
      }
      
    } catch (error) {
      console.error('Ошибка добавления товара:', error.message);
      
      let errorMsg = '❌ *Ошибка добавления товара*\\n';
      if (error.response?.data?.error) {
        errorMsg += escapeMarkdown(error.response.data.error);
      } else if (error.code === 'ECONNREFUSED') {
        errorMsg += 'Сервер магазина недоступен';
      } else if (!SERVER_URL) {
        errorMsg += 'RENDER_URL не установен';
      } else if (!API_SECRET) {
        errorMsg += 'API_SECRET не установен';
      } else {
        errorMsg += escapeMarkdown(error.message);
      }
      
      bot.editMessageText(errorMsg, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown'
      });
    }
  }
  
  // Удаление товара
  else if (data.startsWith('delete_')) {
    const productId = data.replace('delete_', '');
    
    try {
      if (!SERVER_URL || !API_SECRET) {
        throw new Error('Не настроены SERVER_URL или API_SECRET');
      }
      
      const response = await axios.post(`${SERVER_URL}/api/delete-product`, {
        id: productId,
        secret: API_SECRET
      }, {
        timeout: 10000
      });
      
      if (response.data?.success) {
        bot.editMessageText(`✅ *Товар удален\\!*\\n\\n🆔 ID: ${escapeMarkdown(productId)}`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown'
        });
      }
    } catch (error) {
      bot.editMessageText(`❌ *Ошибка удаления товара*\\n${escapeMarkdown(error.message)}`, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown'
      });
    }
  }
  
  // Подтверждение заказа
  else if (data.startsWith('approve_')) {
    const orderId = data.replace('approve_', '');
    const order = activeOrders[orderId];
    
    if (!order) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ не найден', show_alert: true });
    }
    
    // Отправляем запрос на сервер магазина об успешном подтверждении
    if (SERVER_URL && API_SECRET) {
      try {
        await axios.post(`${SERVER_URL}/api/order-status-update`, {
          order_id: orderId,
          status: 'completed',
          secret: API_SECRET
        }, { timeout: 10000 });
        
        console.log(`✅ Заказ ${orderId} подтвержден на сервере`);
      } catch (error) {
        console.error(`Ошибка обновления статуса заказа ${orderId}:`, error.message);
      }
    }
    
    // Обновляем сообщение
    const newText = msg.text.replace('ОЖИДАЕТ ПРОВЕРКИ', '✅ ПОДТВЕРЖДЁН')
                          .replace('EMAIL ВВЕДЁН', '✅ ПОДТВЕРЖДЁН')
                          .replace('КОД ОТПРАВЛЕН', '✅ ПОДТВЕРЖДЁН');
    const newKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Подтверждён администратором', callback_data: 'already_approved' }]
        ]
      }
    };
    
    bot.editMessageText(newText, {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'Markdown',
      ...newKeyboard
    });
    
    // Отправляем уведомление о подтверждении
    await sendStatusUpdate(orderId, 'approved');
    
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ подтверждён!', show_alert: true });
  }
  
  // Отклонение заказа
  else if (data.startsWith('reject_')) {
    const orderId = data.replace('reject_', '');
    
    // Спрашиваем причину отклонения
    userStates[chatId] = {
      step: 'reject_reason',
      orderId: orderId
    };
    
    bot.sendMessage(chatId, '📝 Укажите причину отклонения заказа:');
  }
  
  // Детали заказа
  else if (data.startsWith('details_')) {
    const orderId = data.replace('details_', '');
    const order = activeOrders[orderId];
    
    if (!order) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ не найден', show_alert: true });
    }
    
    // Формируем подробную информацию
    let details = `📋 *Детали заказа ${orderId}*\n\n`;
    details += `📧 *Почта:* ${escapeMarkdown(order.email)}\n`;
    details += `🔢 *Код:* ${order.code ? `\`${order.code}\`` : 'Ожидается ввод'}\n`;
    details += `💰 *Сумма:* ${order.amount || 0}₽\n`;
    details += `📊 *Статус:* ${order.status === 'pending' ? '⏳ Ожидает' : order.status === 'approved' ? '✅ Подтверждён' : '❌ Отклонён'}\n`;
    details += `⏰ *Создан:* ${new Date(order.timestamp).toLocaleString()}\n`;
    details += `🔔 *Этап:* ${order.stage === 'email_submitted' ? 'Введен email' : 'Введен код'}\n\n`;
    
    // Детали товаров
    details += `🛒 *Состав заказа:*\n`;
    if (order.items && typeof order.items === 'object') {
      for (const [itemId, quantity] of Object.entries(order.items)) {
        details += `  • ${itemId}: ${quantity} шт.\n`;
      }
    } else {
      details += `  • Информация о товарах отсутствует\n`;
    }
    
    bot.sendMessage(chatId, details, { parse_mode: 'Markdown' });
  }
  
  // Обновить список заказов
  else if (data === 'refresh_orders') {
    await listActiveOrders(chatId);
    bot.deleteMessage(chatId, msg.message_id);
  }
  
  // Все заказы подробно
  else if (data === 'all_orders_details') {
    const allOrders = Object.entries(activeOrders)
      .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
    
    if (allOrders.length === 0) {
      return bot.sendMessage(chatId, '📭 Заказов ещё не было');
    }
    
    let message = `📊 *Все заказы:* ${allOrders.length}\\n\\n`;
    
    allOrders.forEach(([orderId, order], index) => {
      const statusEmoji = order.status === 'approved' ? '✅' : order.status === 'rejected' ? '❌' : '⏳';
      const statusText = order.status === 'approved' ? 'Подтверждён' : order.status === 'rejected' ? 'Отклонён' : 'Ожидает';
      
      message += `${statusEmoji} *Заказ:* \`${orderId}\`\\n`;
      message += `   📧 ${escapeMarkdown(order.email)}\\n`;
      message += `   🔢 Код: ${order.code ? `\`${order.code}\`` : 'Ожидается'}\\n`;
      message += `   💰 ${order.amount || 0}₽\\n`;
      message += `   📊 ${statusText}\\n`;
      message += `   ⏰ ${new Date(order.timestamp).toLocaleString()}\\n\\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // Отмена добавления
  else if (data === 'cancel_add') {
    delete userStates[chatId];
    bot.editMessageText('❌ Добавление товара отменено', {
      chat_id: chatId,
      message_id: msg.message_id
    });
    showMainMenu(chatId);
  }
  
  // Назад в меню
  else if (data === 'back_to_main') {
    showMainMenu(chatId);
  }
});

// Обработка ввода причины отклонения
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];
  
  if (state && state.step === 'reject_reason') {
    const orderId = state.orderId;
    const order = activeOrders[orderId];
    
    if (!order) {
      delete userStates[chatId];
      return bot.sendMessage(chatId, '❌ Заказ не найден', getMainKeyboard());
    }
    
    // Отправляем запрос на сервер магазина об отклонении
    if (SERVER_URL && API_SECRET) {
      try {
        await axios.post(`${SERVER_URL}/api/order-status-update`, {
          order_id: orderId,
          status: 'rejected',
          admin_comment: text,
          secret: API_SECRET
        }, { timeout: 10000 });
        
        console.log(`❌ Заказ ${orderId} отклонен на сервере`);
      } catch (error) {
        console.error(`Ошибка обновления статуса заказа ${orderId}:`, error.message);
      }
    }
    
    // Отправляем уведомление об отклонении
    await sendStatusUpdate(orderId, 'rejected', text);
    
    bot.sendMessage(chatId, `❌ Заказ ${orderId} отклонён.\nПричина: ${text}`, getMainKeyboard());
    
    // Очищаем состояние
    delete userStates[chatId];
  }
});

// =========== ОБРАБОТКА ОШИБОК БОТА ===========
bot.on('polling_error', (error) => {
  console.log('🔄 Polling error:', error.message);
  
  // Если ошибка 409 Conflict (два экземпляра бота)
  if (error.message.includes('409 Conflict')) {
    console.log('⚠️ Обнаружен конфликт polling. Проверьте дублирующие инстансы.');
  }
});

// =========== KEEP-ALIVE ДЛЯ RENDER ===========
// Отправляем запросы каждые 5 минут чтобы сервер не засыпал
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  
  // Логируем статус
  console.log(`[${new Date().toLocaleTimeString()}] Бот работает ${hours}ч ${minutes}м | Активных заказов: ${pendingOrders}`);
  
  // Keep-alive запрос к своему же серверу
  if (process.env.RENDER_EXTERNAL_URL) {
    axios.get(`${process.env.RENDER_EXTERNAL_URL}/keep-alive`, { timeout: 5000 })
      .then(() => console.log('✅ Keep-alive отправлен'))
      .catch(() => console.log('⚠️ Keep-alive не доставлен'));
  }
  
  // Keep-alive запрос к серверу магазина если настроен
  if (SERVER_URL) {
    axios.get(`${SERVER_URL}/check`, { timeout: 5000 })
      .then(() => console.log('✅ Сервер магазина доступен'))
      .catch(() => console.log('⚠️ Сервер магазина недоступен'));
  }
}, 5 * 60 * 1000); // Каждые 5 минут

// Очистка старых заказов (старше 24 часов)
setInterval(() => {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  let cleared = 0;
  
  for (const [orderId, order] of Object.entries(activeOrders)) {
    const orderTime = new Date(order.timestamp).getTime();
    if (now - orderTime > twentyFourHours) {
      delete activeOrders[orderId];
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.log(`🧹 Очищено ${cleared} старых заказов (старше 24 часов)`);
  }
}, 60 * 60 * 1000); // Каждый час

// =========== ОБРАБОТКА ЗАВЕРШЕНИЯ ===========
// Изящное завершение при SIGTERM (от Render)
process.on('SIGTERM', () => {
  console.log('🔄 Получен SIGTERM, завершаю работу...');
  
  // Сохраняем статистику
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  console.log(`📊 Статистика: ${pendingOrders} заказов ожидают проверки`);
  
  // Останавливаем polling бота
  bot.stopPolling();
  
  // Закрываем веб-сервер
  server.close(() => {
    console.log('✅ Веб-сервер остановлен');
    process.exit(0);
  });
  
  // Таймаут на случай если сервер не закрывается
  setTimeout(() => {
    console.log('⚠️ Принудительное завершение');
    process.exit(0);
  }, 5000);
});

console.log('✅ Бот и веб-сервер готовы к работе 24/7!');
console.log(`📡 Веб-интерфейс будет доступен по внешнему URL от Render`);
console.log(`🔄 Система уведомлений о заказах: ${API_SECRET && ADMIN_ID ? '✅ АКТИВНА' : '❌ НЕ АКТИВНА'}`);
console.log(`🎉 Используйте команду /testconnection в боте для проверки настроек`);
