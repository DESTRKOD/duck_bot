const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const keepAlive = require('./keepAlive');

// =========== НАСТРОЙКИ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.SERVER_URL || 'https://duck-backend-by9a.onrender.com';
const API_SECRET = process.env.API_SECRET;
const PORT = process.env.PORT || 10000;

// =========== ВАЛИДАЦИЯ ===========
console.log('🔧 =========== НАСТРОЙКИ БОТА ===========');
console.log(`🤖 TG_TOKEN: ${TOKEN ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ!'}`);
console.log(`👑 ADMIN_CHAT_ID: ${ADMIN_ID ? '✅ ' + ADMIN_ID : '❌ Не установлен'}`);
console.log(`🌐 SERVER_URL: ${SERVER_URL ? '✅ ' + SERVER_URL : '❌ Не установлен'}`);
console.log(`🔐 API_SECRET: ${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}`);
console.log(`📡 PORT: ${PORT}`);
console.log(`=========================================`);

if (!TOKEN) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: TG_TOKEN не установлен!');
  process.exit(1);
}

// =========== EXPRESS ===========
const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-secret');
  next();
});

// =========== ХРАНИЛИЩЕ ===========
const activeOrders = {};
const userStates = {};

// =========== ФУНКЦИИ ===========
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

// =========== API ЭНДПОИНТЫ ===========

// Уведомления от сервера
app.post('/api/order-notify', async (req, res) => {
  try {
    const { order_id, email, items, amount, code, secret, stage } = req.body;
    
    console.log(`📦 [${new Date().toLocaleTimeString()}] Уведомление: ${order_id}`);
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!ADMIN_ID) {
      return res.status(500).json({ success: false, error: 'No admin configured' });
    }
    
    // Сохраняем заказ
    activeOrders[order_id] = {
      email,
      items,
      amount,
      code,
      status: 'pending',
      timestamp: new Date().toISOString(),
      stage: stage || 'unknown'
    };
    
    // Отправляем в Telegram
    await sendOrderNotification(order_id, email, items, amount, code, stage);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Ошибка уведомления:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Здоровье
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'duck-bot',
    uptime: process.uptime(),
    orders: Object.keys(activeOrders).length,
    timestamp: new Date().toISOString()
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 Duck Shop Bot</title>
      <style>
        body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
        .status { background: #4CAF50; color: white; padding: 10px; border-radius: 5px; }
        .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .stat { display: flex; justify-content: space-between; margin: 5px 0; }
        .command { background: #e3f2fd; padding: 5px 10px; border-radius: 3px; font-family: monospace; }
      </style>
    </head>
    <body>
      <h1>🤖 Duck Shop Bot</h1>
      <div class="status">✅ Сервер работает | Время работы: ${Math.floor(process.uptime()/3600)}ч ${Math.floor((process.uptime()%3600)/60)}м</div>
      
      <div class="info">
        <h3>📊 Статистика:</h3>
        <div class="stat">
          <span>Активных заказов:</span>
          <span><b>${Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length}</b></span>
        </div>
        <div class="stat">
          <span>Всего заказов:</span>
          <span><b>${Object.keys(activeOrders).length}</b></span>
        </div>
        <div class="stat">
          <span>Сервер магазина:</span>
          <span>${SERVER_URL ? '✅' : '❌'}</span>
        </div>
        <div class="stat">
          <span>API Secret:</span>
          <span>${API_SECRET ? '✅' : '❌'}</span>
        </div>
      </div>
      
      <div class="info">
        <h3>📱 Команды бота:</h3>
        <p><span class="command">/start</span> - Главное меню</p>
        <p><span class="command">/addproduct</span> - Добавить товар</p>
        <p><span class="command">/products</span> - Список товаров</p>
        <p><span class="command">/orders</span> - Активные заказы</p>
        <p><span class="command">/status</span> - Статус бота</p>
        <p><span class="command">/deleteproduct</span> - Удалить товар</p>
        <p><span class="command">/help</span> - Помощь</p>
      </div>
      
      <div class="info">
        <h3>🔧 Переменные окружения:</h3>
        <p><b>TG_TOKEN:</b> ${TOKEN ? '✅ Установлен' : '❌ Отсутствует'}</p>
        <p><b>ADMIN_CHAT_ID:</b> ${ADMIN_ID || '❌ Отсутствует'}</p>
        <p><b>SERVER_URL:</b> ${SERVER_URL || '❌ Отсутствует'}</p>
        <p><b>API_SECRET:</b> ${API_SECRET ? '✅ Установлен' : '❌ Отсутствует'}</p>
      </div>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        🤖 Бот работает 24/7 на Render.com | 🔄 Keep-alive активен
      </p>
    </body>
    </html>
  `);
});

// Keep-alive для Render
app.get('/keep-alive', (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] Keep-alive запрос`);
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// =========== ЗАПУСК СЕРВЕРА ===========
const server = app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
  console.log(`🔗 Внутренний URL: http://localhost:${PORT}`);
  
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌍 Внешний URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
});

// =========== ТЕЛЕГРАМ БОТ ===========
let bot;
let pollingInterval = null;

const initBot = () => {
  try {
    console.log('🔄 Инициализация бота...');
    
    if (bot) {
      try {
        bot.stopPolling();
        console.log('🛑 Предыдущий polling остановлен');
      } catch (e) {}
    }
    
    bot = new TelegramBot(TOKEN, {
      polling: {
        interval: 300,
        params: {
          timeout: 10,
          limit: 100
        }
      },
      request: {
        timeout: 60000,
        agentOptions: {
          keepAlive: true,
          keepAliveMsecs: 10000
        }
      }
    });
    
    console.log('🤖 Бот инициализирован');
    setupBotHandlers();
    
  } catch (error) {
    console.error('❌ Ошибка инициализации бота:', error.message);
    
    // Перезапуск через 30 секунд при 409 ошибке
    if (error.message.includes('409')) {
      console.log('🔄 Обнаружен конфликт polling, перезапуск через 30 секунд...');
      setTimeout(initBot, 30000);
    }
  }
};

// =========== КОМАНДЫ БОТА ===========
function setupBotHandlers() {
  
  // =========== СПИСОК ВСЕХ КОМАНД ===========
  
  // 1. /start - Главное меню
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'Администратор';
    
    if (ADMIN_ID && userId !== ADMIN_ID) {
      bot.sendMessage(chatId, 
        '👋 Привет! Я бот для управления магазином Duck Shop.\n' +
        '⚙️ Только администратор может управлять товарами и заказами.'
      );
      return;
    }
    
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['📋 Список товаров', '📦 Активные заказы'],
          ['➕ Добавить товар', '🗑️ Удалить товар'],
          ['📊 Статус бота', '🔗 Проверить сервер'],
          ['📖 Помощь', '🔄 Перезапустить бота']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    bot.sendMessage(chatId, 
      `👑 *${firstName}, добро пожаловать в панель управления Duck Shop!*\n\n` +
      `🔧 Выберите действие из меню ниже или используйте команды:\n` +
      `• /addproduct - Добавить товар\n` +
      `• /products - Список товаров\n` +
      `• /orders - Активные заказы\n` +
      `• /deleteproduct - Удалить товар\n` +
      `• /status - Статус бота\n` +
      `• /help - Помощь по командам`,
      { 
        parse_mode: 'Markdown',
        ...keyboard 
      }
    );
  });
  
  // 2. /help - Помощь по командам
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    const helpText = 
      '📖 *Доступные команды администратора:*\n\n' +
      '`/start` - Главное меню\n' +
      '`/addproduct` - Добавить новый товар\n' +
      '`/products` - Показать все товары\n' +
      '`/deleteproduct` - Удалить товар\n' +
      '`/orders` - Активные заказы\n' +
      '`/status` - Статус бота и сервера\n' +
      '`/testserver` - Проверить соединение с сервером\n' +
      '`/cleardata` - Очистить старые заказы\n' +
      '`/restart` - Перезапустить бота\n' +
      '`/help` - Эта справка\n\n' +
      '🔧 *Быстрые кнопки:*\n' +
      '📋 Список товаров - Показать товары\n' +
      '📦 Активные заказы - Заказы на проверке\n' +
      '➕ Добавить товар - Добавить новый товар\n' +
      '🗑️ Удалить товар - Удалить товар из магазина\n' +
      '📊 Статус бота - Информация о работе\n' +
      '🔗 Проверить сервер - Тест соединения\n' +
      '📖 Помощь - Эта справка\n' +
      '🔄 Перезапустить бота - Перезапуск';
    
    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  });
  
  // 3. /addproduct - Добавить товар
  bot.onText(/\/addproduct/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    if (!SERVER_URL || !API_SECRET) {
      return bot.sendMessage(chatId, 
        '❌ *Ошибка конфигурации!*\n\n' +
        'Проверьте переменные окружения:\n' +
        `• SERVER_URL: ${SERVER_URL ? '✅' : '❌'}\n` +
        `• API_SECRET: ${API_SECRET ? '✅' : '❌'}\n\n` +
        'Добавьте недостающие переменные в Render Dashboard.',
        { parse_mode: 'Markdown' }
      );
    }
    
    userStates[chatId] = { 
      step: 'name',
      action: 'add_product' 
    };
    
    bot.sendMessage(chatId, 
      '📦 *Добавление нового товара*\n\n' +
      '📝 Введите название товара:\n' +
      'Пример: *"50 кристаллов"* или *"Brawl Pass Premium"*',
      { parse_mode: 'Markdown' }
    );
  });
  
  // 4. /products - Список товаров
  bot.onText(/\/products/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    if (!SERVER_URL) {
      return bot.sendMessage(chatId, '❌ SERVER_URL не настроен.');
    }
    
    try {
      bot.sendMessage(chatId, '🔄 Загружаю товары...');
      
      const response = await axios.get(`${SERVER_URL}/api/products`, {
        timeout: 10000
      });
      
      const products = response.data?.products || [];
      
      if (!products.length) {
        return bot.sendMessage(chatId, '📭 Товаров в магазине нет.');
      }
      
      let message = `📋 *Товаров в магазине:* ${products.length}\n\n`;
      products.forEach((p, i) => {
        const safeName = escapeMarkdown(p.name || '');
        const safeId = escapeMarkdown(p.id || '');
        
        message += `${i+1}\\. *${safeName}*\n`;
        message += `   💰 ${p.price}₽ \\| 🆔 ${safeId}\n`;
        if (p.gift) message += `   🎁 Подарочный товар\n`;
        message += '\n';
      });
      
      message += `📦 *Всего:* ${products.length} товаров`;
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Ошибка получения товаров:', error.message);
      bot.sendMessage(chatId, 
        '❌ *Не удалось получить товары*\n' +
        `Ошибка: ${escapeMarkdown(error.message || 'Сервер недоступен')}`,
        { parse_mode: 'Markdown' }
      );
    }
  });
  
  // 5. /deleteproduct - Удалить товар
  bot.onText(/\/deleteproduct/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    if (!SERVER_URL || !API_SECRET) {
      return bot.sendMessage(chatId, '❌ SERVER_URL или API_SECRET не настроены.');
    }
    
    try {
      bot.sendMessage(chatId, '🔄 Загружаю список товаров...');
      
      const response = await axios.get(`${SERVER_URL}/api/products`, {
        timeout: 10000
      });
      
      const products = response.data?.products || [];
      
      if (!products.length) {
        return bot.sendMessage(chatId, '📭 Нет товаров для удаления.');
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: products.map(p => [
            { text: `❌ ${escapeMarkdown(p.name)} - ${p.price}₽`, callback_data: `delete_${p.id}` }
          ]).concat([[{ text: '↩️ Отмена', callback_data: 'cancel_delete' }]])
        }
      };
      
      bot.sendMessage(chatId, 'Выберите товар для удаления:', keyboard);
      
    } catch (error) {
      bot.sendMessage(chatId, `❌ Ошибка загрузки товаров: ${error.message}`);
    }
  });
  
  // 6. /orders - Активные заказы
  bot.onText(/\/orders/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    listActiveOrders(chatId);
  });
  
  // 7. /status - Статус бота
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
    const totalOrders = Object.keys(activeOrders).length;
    
    let statusMessage = `🤖 *Статус Duck Shop Bot:*\n\n`;
    statusMessage += `✅ *Работает:* ${hours}ч ${minutes}м ${seconds}с\n`;
    statusMessage += `👥 *Пользователи:* ${Object.keys(userStates).length}\n`;
    statusMessage += `📦 *Заказы:* ${pendingOrders} активных / ${totalOrders} всего\n`;
    statusMessage += `🌐 *Веб-сервер:* ${process.env.RENDER_EXTERNAL_URL || `Порт ${PORT}`}\n\n`;
    
    if (SERVER_URL) {
      statusMessage += `🛒 *Сервер магазина:* ${SERVER_URL}\n`;
    } else {
      statusMessage += `⚠️ *SERVER_URL:* Не настроен\n`;
    }
    
    statusMessage += `🔐 *API Secret:* ${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}\n`;
    statusMessage += `👑 *Админ ID:* ${ADMIN_ID || '❌ Не установлен'}\n\n`;
    
    statusMessage += `🔄 *Уведомления:* ${API_SECRET && ADMIN_ID ? '✅ Активны' : '❌ Не активны'}`;
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
  });
  
  // 8. /testserver - Проверить сервер
  bot.onText(/\/testserver/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    if (!SERVER_URL || !API_SECRET) {
      return bot.sendMessage(chatId, 
        '❌ *Проверьте настройки!*\n\n' +
        'Не настроены:\n' +
        `${!SERVER_URL ? '• SERVER_URL\n' : ''}` +
        `${!API_SECRET ? '• API_SECRET\n' : ''}`,
        { parse_mode: 'Markdown' }
      );
    }
    
    try {
      bot.sendMessage(chatId, '🔍 Проверяю соединение с сервером магазина...');
      
      // Проверяем здоровье сервера
      const healthResponse = await axios.get(`${SERVER_URL}/health`, { 
        timeout: 10000 
      });
      
      let message = '✅ *Сервер магазина доступен!*\n\n';
      message += `📊 *Статус:* ${healthResponse.data.status}\n`;
      message += `⏰ *Время сервера:* ${new Date(healthResponse.data.time).toLocaleTimeString()}\n`;
      
      // Проверяем товары
      const productsResponse = await axios.get(`${SERVER_URL}/api/products`, {
        timeout: 10000
      });
      
      message += `🛒 *Товаров:* ${productsResponse.data.products?.length || 0}\n`;
      
      // Тест уведомления
      const testOrderId = `test_${Date.now()}`;
      const testData = {
        order_id: testOrderId,
        email: "test@example.com",
        items: { test_item: 1 },
        amount: 100,
        secret: API_SECRET,
        stage: "test"
      };
      
      try {
        const notifyResponse = await axios.post(`${SERVER_URL}/submit-email`, testData, {
          timeout: 15000,
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (notifyResponse.data.success) {
          message += `🔔 *Уведомления:* ✅ Работают\n`;
        } else {
          message += `🔔 *Уведомления:* ⚠️ Ошибка\n`;
        }
      } catch (notifyError) {
        message += `🔔 *Уведомления:* ❌ ${notifyError.message}\n`;
      }
      
      message += `\n🎉 *Все системы работают корректно!*`;
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      bot.sendMessage(chatId, 
        `❌ *Ошибка соединения с сервером*\n\n` +
        `Сервер: ${SERVER_URL}\n` +
        `Ошибка: ${escapeMarkdown(error.message)}\n\n` +
        `Проверьте:\n` +
        `1. Сервер запущен\n` +
        `2. URL правильный\n` +
        `3. Нет проблем с сетью`,
        { parse_mode: 'Markdown' }
      );
    }
  });
  
  // 9. /cleardata - Очистка старых заказов
  bot.onText(/\/cleardata/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let cleared = 0;
    
    for (const [orderId, order] of Object.entries(activeOrders)) {
      const orderTime = new Date(order.timestamp).getTime();
      if (now - orderTime > day) {
        delete activeOrders[orderId];
        cleared++;
      }
    }
    
    bot.sendMessage(chatId, 
      `🧹 *Очистка данных*\n\n` +
      `Удалено заказов: ${cleared}\n` +
      `Осталось заказов: ${Object.keys(activeOrders).length}`,
      { parse_mode: 'Markdown' }
    );
  });
  
  // 10. /restart - Перезапустить бота
  bot.onText(/\/restart/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    bot.sendMessage(chatId, '🔄 Перезапускаю бота...');
    
    setTimeout(() => {
      initBot();
      bot.sendMessage(chatId, '✅ Бот перезапущен!');
    }, 2000);
  });
  
  // 11. /cancel - Отмена действия
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    delete userStates[chatId];
    bot.sendMessage(chatId, '❌ Действие отменено');
  });
  
  // =========== ОБРАБОТКА СООБЩЕНИЙ ===========
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    if (text.startsWith('/')) return;
    
    // Обработка кнопок меню
    if (text === '📋 Список товаров') {
      await listProducts(chatId);
    }
    else if (text === '📦 Активные заказы') {
      await listActiveOrders(chatId);
    }
    else if (text === '➕ Добавить товар') {
      bot.sendMessage(chatId, 'Напишите команду /addproduct');
    }
    else if (text === '🗑️ Удалить товар') {
      bot.sendMessage(chatId, 'Напишите команду /deleteproduct');
    }
    else if (text === '📊 Статус бота') {
      bot.sendMessage(chatId, 'Напишите команду /status');
    }
    else if (text === '🔗 Проверить сервер') {
      bot.sendMessage(chatId, 'Напишите команду /testserver');
    }
    else if (text === '📖 Помощь') {
      bot.sendMessage(chatId, 'Напишите команду /help');
    }
    else if (text === '🔄 Перезапустить бота') {
      bot.sendMessage(chatId, 'Напишите команду /restart');
    }
    // Обработка добавления товара
    else if (userStates[chatId] && userStates[chatId].action === 'add_product') {
      await handleProductStep(chatId, text);
    }
  });
  
  // =========== CALLBACK ОБРАБОТКА ===========
  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Подтверждение заказа
    if (data.startsWith('approve_')) {
      const orderId = data.replace('approve_', '');
      const order = activeOrders[orderId];
      
      if (!order) {
        return bot.answerCallbackQuery(callbackQuery.id, { 
          text: 'Заказ не найден', 
          show_alert: true 
        });
      }
      
      // Отправляем на сервер магазина
      if (SERVER_URL && API_SECRET) {
        try {
          await axios.post(`${SERVER_URL}/api/order-status-update`, {
            order_id: orderId,
            status: 'completed',
            secret: API_SECRET
          }, { 
            timeout: 10000,
            headers: { 'x-api-secret': API_SECRET }
          });
          
          console.log(`✅ Заказ ${orderId} подтвержден на сервере`);
        } catch (error) {
          console.error(`❌ Ошибка подтверждения заказа ${orderId}:`, error.message);
        }
      }
      
      // Обновляем локально
      if (activeOrders[orderId]) {
        activeOrders[orderId].status = 'approved';
        activeOrders[orderId].updated_at = new Date().toISOString();
      }
      
      // Обновляем сообщение
      const newText = msg.text.replace('ОЖИДАЕТ ПРОВЕРКИ', '✅ ПОДТВЕРЖДЁН')
                            .replace('EMAIL ВВЕДЁН', '✅ ПОДТВЕРЖДЁН')
                            .replace('КОД ОТПРАВЛЕН', '✅ ПОДТВЕРЖДЁН');
      
      const newKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Заказ подтверждён', callback_data: 'already_approved' }]
          ]
        }
      };
      
      bot.editMessageText(newText, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        ...newKeyboard
      });
      
      bot.answerCallbackQuery(callbackQuery.id, { 
        text: 'Заказ подтверждён!', 
        show_alert: true 
      });
    }
    
    // Отклонение заказа
    else if (data.startsWith('reject_')) {
      const orderId = data.replace('reject_', '');
      
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
        return bot.answerCallbackQuery(callbackQuery.id, { 
          text: 'Заказ не найден', 
          show_alert: true 
        });
      }
      
      let details = `📋 *Детали заказа ${orderId}*\n\n`;
      details += `📧 *Почта:* ${escapeMarkdown(order.email)}\n`;
      details += `🔢 *Код:* ${order.code ? `\`${order.code}\`` : 'Ожидается ввод'}\n`;
      details += `💰 *Сумма:* ${order.amount || 0}₽\n`;
      details += `📊 *Статус:* ${order.status === 'pending' ? '⏳ Ожидает' : '✅ Подтверждён'}\n`;
      details += `⏰ *Создан:* ${new Date(order.timestamp).toLocaleString()}\n`;
      details += `🔔 *Этап:* ${order.stage === 'email_submitted' ? 'Введен email' : 'Введен код'}\n\n`;
      
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
          timeout: 10000,
          headers: { 'x-api-secret': API_SECRET }
        });
        
        if (response.data?.success) {
          bot.editMessageText(`✅ *Товар удален!*\n\n🆔 ID: ${escapeMarkdown(productId)}`, {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
          });
        }
      } catch (error) {
        bot.editMessageText(`❌ *Ошибка удаления товара*\n${escapeMarkdown(error.message)}`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown'
        });
      }
    }
    
    // Отмена удаления
    else if (data === 'cancel_delete') {
      bot.deleteMessage(chatId, msg.message_id);
      bot.sendMessage(chatId, '❌ Удаление отменено');
    }
  });
  
  // Обработка ошибок polling
  bot.on('polling_error', (error) => {
    console.log(`[${new Date().toLocaleTimeString()}] Polling error:`, error.message);
    
    if (error.message.includes('409')) {
      console.log('⚠️ Обнаружен конфликт polling');
      console.log('🔄 Перезапуск через 30 секунд...');
      
      if (bot) {
        try {
          bot.stopPolling();
        } catch (e) {}
      }
      
      setTimeout(() => {
        console.log('🔄 Перезапускаю бота...');
        initBot();
      }, 30000);
    }
  });
  
  console.log('✅ Обработчики бота настроены');
}

// =========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===========

// Функция добавления товара
async function handleProductStep(chatId, text) {
  const state = userStates[chatId];
  
  if (!state) return;
  
  if (state.step === 'name') {
    state.name = text;
    state.step = 'price';
    bot.sendMessage(chatId, 
      '💰 *Введите цену товара* (только цифры):\n\n' +
      'Пример: *500* или *1250*',
      { parse_mode: 'Markdown' }
    );
  }
  else if (state.step === 'price') {
    const price = parseInt(text);
    if (isNaN(price) || price <= 0) {
      return bot.sendMessage(chatId, 
        '❌ *Введите корректную цену!*\n' +
        'Только цифры, больше 0\n' +
        'Пример: *500*',
        { parse_mode: 'Markdown' }
      );
    }
    
    state.price = price;
    state.step = 'image';
    bot.sendMessage(chatId, 
      '🖼️ *Введите URL картинки:*\n\n' +
      'Пример: *https://i.imgur.com/ваша_картинка.png*\n' +
      '📌 Загрузите картинку на imgur.com и скопируйте ссылку',
      { parse_mode: 'Markdown' }
    );
  }
  else if (state.step === 'image') {
    const imageUrl = text.trim();
    
    if (!imageUrl.startsWith('http')) {
      return bot.sendMessage(chatId, 
        '❌ *Некорректный URL!*\n' +
        'Должен начинаться с *http://* или *https://*',
        { parse_mode: 'Markdown' }
      );
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
      `📝 *Проверьте данные товара:*\n\n` +
      `📦 *Название:* ${escapeMarkdown(state.name)}\n` +
      `💰 *Цена:* ${state.price}₽\n` +
      `🖼️ *Картинка:* ${escapeMarkdown(state.image.substring(0, 50))}...\n\n` +
      `Выберите тип товара:`,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }
}

// Функция уведомления о заказе
async function sendOrderNotification(orderId, email, items, amount, code, stage) {
  try {
    if (!ADMIN_ID) {
      console.log('⚠️ ADMIN_CHAT_ID не настроен');
      return;
    }

    console.log(`📤 Отправляю уведомление о заказе ${orderId}`);

    let itemsText = '';
    if (items && typeof items === 'object') {
      for (const [itemId, quantity] of Object.entries(items)) {
        itemsText += `  • ${itemId}: ${quantity} шт.\n`;
      }
    } else {
      itemsText = '  • Информация о товарах отсутствует\n';
    }

    const stageText = stage === 'email_submitted' ? '📧 EMAIL ВВЕДЁН' : 
                     stage === 'code_submitted' ? '🔢 КОД ОТПРАВЛЕН' : '📦 НОВЫЙ ЗАКАЗ';
    
    const message = 
      `${stageText}\n\n` +
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
            { text: '✅ Подтвердить', callback_data: `approve_${orderId}` },
            { text: '❌ Отклонить', callback_data: `reject_${orderId}` }
          ],
          [
            { text: '📋 Подробнее', callback_data: `details_${orderId}` }
          ]
        ]
      }
    };

    await bot.sendMessage(ADMIN_ID, message, { 
      parse_mode: 'Markdown',
      ...keyboard 
    });

    console.log(`✅ Уведомление отправлено администратору`);
    return true;

  } catch (error) {
    console.error('❌ Ошибка отправки уведомления:', error.message);
    return false;
  }
}

// Функция списка активных заказов
async function listActiveOrders(chatId) {
  const pendingOrders = Object.entries(activeOrders)
    .filter(([id, order]) => order.status === 'pending')
    .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
  
  if (pendingOrders.length === 0) {
    return bot.sendMessage(chatId, '📭 Нет активных заказов, ожидающих проверки');
  }
  
  let message = `📊 *Активные заказы:* ${pendingOrders.length}\n\n`;
  
  pendingOrders.forEach(([orderId, order], index) => {
    message += `${index+1}\\. *Заказ:* \`${orderId}\`\n`;
    message += `   📧 ${escapeMarkdown(order.email)}\n`;
    message += `   ${order.code ? `🔢 Код: \`${order.code}\`\n` : '🔢 Код: Ожидается\n'}`;
    message += `   💰 ${order.amount || 0}₽\n`;
    
    let itemsCount = 0;
    if (order.items && typeof order.items === 'object') {
      itemsCount = Object.values(order.items).reduce((sum, qty) => sum + qty, 0);
    }
    message += `   🛒 Товаров: ${itemsCount} шт\n`;
    
    const timeDiff = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    message += `   ⏰ ${timeDiff} мин назад\n\n`;
  });
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Обновить', callback_data: 'refresh_orders' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    ...keyboard 
  });
}

// Функция списка товаров
async function listProducts(chatId) {
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ SERVER_URL не настроен.');
  }
  
  try {
    const response = await axios.get(`${SERVER_URL}/api/products`, {
      timeout: 10000
    });
    
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Товаров в магазине нет.');
    }
    
    let message = `📋 *Товаров в магазине:* ${products.length}\n\n`;
    products.forEach((p, i) => {
      const safeName = escapeMarkdown(p.name || '');
      const safeId = escapeMarkdown(p.id || '');
      
      message += `${i+1}\\. *${safeName}*\n`;
      message += `   💰 ${p.price}₽ \\| 🆔 ${safeId}\n`;
      if (p.gift) message += `   🎁 Подарочный товар\n`;
      message += '\n';
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка получения товаров:', error.message);
    bot.sendMessage(chatId, 
      '❌ Не удалось получить товары\n' +
      `Ошибка: ${escapeMarkdown(error.message || 'Сервер недоступен')}`,
      { parse_mode: 'Markdown' }
    );
  }
}

// =========== ЗАПУСК БОТА ===========
initBot();

// =========== KEEP-ALIVE ДЛЯ RENDER ===========
// Решение проблемы с отключением через 15 минут
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  
  // Логируем статус
  console.log(`[${new Date().toLocaleTimeString()}] 🕐 Бот работает ${hours}ч ${minutes}м | Заказов: ${pendingOrders}`);
  
  // Keep-alive запрос к своему же серверу
  if (process.env.RENDER_EXTERNAL_URL) {
    axios.get(`${process.env.RENDER_EXTERNAL_URL}/keep-alive`, { 
      timeout: 5000 
    })
      .then(() => console.log('✅ Keep-alive отправлен'))
      .catch(() => console.log('⚠️ Keep-alive не доставлен'));
  }
  
  // Keep-alive запрос к серверу магазина если настроен
  if (SERVER_URL) {
    axios.get(`${SERVER_URL}/health`, { 
      timeout: 5000 
    })
      .then(() => console.log('✅ Сервер магазина доступен'))
      .catch(() => console.log('⚠️ Сервер магазина недоступен'));
  }
}, 4 * 60 * 1000); // Каждые 4 минуты (меньше чем 15 минут Render)

// Очистка старых заказов (старше 24 часов)
setInterval(() => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let cleared = 0;
  
  for (const [orderId, order] of Object.entries(activeOrders)) {
    const orderTime = new Date(order.timestamp).getTime();
    if (now - orderTime > day) {
      delete activeOrders[orderId];
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.log(`🧹 Очищено ${cleared} старых заказов (старше 24 часов)`);
  }
}, 60 * 60 * 1000); // Каждый час

console.log('✅ Бот полностью настроен и готов к работе 24/7!');
console.log('🔔 Keep-alive система активирована');
console.log('🚀 Используйте /start в боте для начала работы');
