const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL;
const API_SECRET = process.env.API_SECRET;
const PORT = process.env.PORT || 10000;

console.log('🔧 =========== НАСТРОЙКИ БОТА ===========');
console.log(`🤖 TG_TOKEN: ${TOKEN ? '✅' : '❌'}`);
console.log(`👑 ADMIN_CHAT_ID: ${ADMIN_ID ? '✅' : '❌'}`);
console.log(`🌐 SERVER_URL: ${SERVER_URL ? '✅' : '❌'}`);
console.log(`🔐 API_SECRET: ${API_SECRET ? '✅' : '❌'}`);
console.log(`📡 PORT: ${PORT}`);
console.log(`=========================================`);

// =========== EXPRESS ===========
const app = express();
app.use(express.json());

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
app.post('/api/order-notify', async (req, res) => {
  try {
    const { order_id, email, items, amount, code, secret, stage } = req.body;
    
    console.log(`📦 Уведомление: ${order_id} (${stage})`);
    
    if (!API_SECRET || secret !== API_SECRET) {
      console.log('❌ Неверный секрет');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!ADMIN_ID) {
      console.log('❌ Нет ADMIN_CHAT_ID');
      return res.status(500).json({ success: false, error: 'No admin' });
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
    
    // Отправляем в Telegram ТОЛЬКО для email_submitted
    if (stage === 'email_submitted') {
      await sendOrderNotification(order_id, email, items, amount, code, stage);
    } else {
      console.log(`⚠️ Уведомление для stage "${stage}" не отправлено (только email_submitted)`);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Ошибка уведомления:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Эндпоинт для получения заказов (для опроса)
app.get('/api/pending-orders', (req, res) => {
  const secret = req.headers['x-api-secret'] || req.query.secret;
  
  if (!API_SECRET || secret !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  const pending = Object.entries(activeOrders)
    .filter(([id, order]) => order.status === 'pending')
    .map(([id, order]) => ({
      id,
      email: order.email,
      items: order.items,
      amount: order.amount,
      code: order.code,
      stage: order.stage,
      timestamp: order.timestamp
    }));
  
  res.json({ success: true, orders: pending, count: pending.length });
});

// Эндпоинт для обновления статуса заказа
app.post('/api/order-status-update', async (req, res) => {
  try {
    const { order_id, status, secret } = req.body;
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!order_id || !status) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }
    
    if (activeOrders[order_id]) {
      activeOrders[order_id].status = status;
      activeOrders[order_id].updated_at = new Date().toISOString();
      console.log(`✅ Статус заказа ${order_id} обновлен на: ${status}`);
      res.json({ success: true, order_id, status });
    } else {
      res.status(404).json({ success: false, error: 'Order not found' });
    }
  } catch (error) {
    console.error('❌ Ошибка обновления статуса:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  res.json({ 
    status: 'healthy',
    bot: 'running',
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    orders: Object.keys(activeOrders).length,
    pending: Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length,
    time: new Date().toISOString(),
    server_url: SERVER_URL || 'not set',
    admin_id: ADMIN_ID || 'not set'
  });
});

app.get('/', (req, res) => {
  const pendingCount = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  const totalCount = Object.keys(activeOrders).length;
  
  res.send(`
    <html>
      <head>
        <title>🤖 Duck Shop Bot</title>
        <meta http-equiv="refresh" content="30">
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
          .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
          .healthy { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
          .stat-box { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; border-left: 4px solid #4CAF50; }
          .stat-number { font-size: 24px; font-weight: bold; color: #333; }
          .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
          .time { color: #666; font-size: 14px; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 Duck Shop Bot</h1>
          <div class="status healthy">✅ Бот работает нормально</div>
          
          <div class="stats">
            <div class="stat-box">
              <div class="stat-number">${totalCount}</div>
              <div class="stat-label">Всего заказов</div>
            </div>
            <div class="stat-box">
              <div class="stat-number">${pendingCount}</div>
              <div class="stat-label">Ожидают обработки</div>
            </div>
            <div class="stat-box">
              <div class="stat-number">${ADMIN_ID ? '✅' : '❌'}</div>
              <div class="stat-label">Админ настроен</div>
            </div>
            <div class="stat-box">
              <div class="stat-number">${SERVER_URL ? '✅' : '❌'}</div>
              <div class="stat-label">Сервер настроен</div>
            </div>
          </div>
          
          <div style="margin-top: 30px; padding: 20px; background: #e8f4fd; border-radius: 5px;">
            <h3>📊 Статистика</h3>
            <p>• Заказов в работе: <strong>${pendingCount}</strong></p>
            <p>• Всего обработано: <strong>${totalCount - pendingCount}</strong></p>
            <p>• URL сервера: <code>${SERVER_URL || 'Не настроен'}</code></p>
            <p>• ID админа: <code>${ADMIN_ID || 'Не настроен'}</code></p>
          </div>
          
          <div class="time">
            Последнее обновление: ${new Date().toLocaleString('ru-RU')}
          </div>
        </div>
      </body>
    </html>
  `);
});

// =========== ЗАПУСК СЕРВЕРА ===========
const server = app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
  console.log(`📡 URL: http://0.0.0.0:${PORT}`);
  console.log(`🔄 Проверка работоспособности: http://0.0.0.0:${PORT}/health`);
});

// =========== ТЕЛЕГРАМ БОТ ===========
let bot;
let isPolling = false;

const initBot = async () => {
  try {
    if (bot && isPolling) {
      console.log('🛑 Останавливаю предыдущий polling...');
      await bot.stopPolling();
    }
    
    bot = new TelegramBot(TOKEN, {
      polling: {
        interval: 1000,
        params: {
          timeout: 10,
          limit: 100
        },
        autoStart: false
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
    
    // Запускаем polling
    await bot.startPolling();
    isPolling = true;
    console.log('✅ Polling запущен');
    
  } catch (error) {
    console.error('❌ Ошибка инициализации бота:', error.message);
    
    // Перезапуск через 10 секунд при 409 ошибке
    if (error.message.includes('409') || error.message.includes('Conflict')) {
      console.log('🔄 409 Conflict - перезапуск через 10 секунд...');
      setTimeout(initBot, 10000);
    } else {
      // Для других ошибок - перезапуск через 5 секунд
      console.log('🔄 Перезапуск через 5 секунд...');
      setTimeout(initBot, 5000);
    }
  }
};

// =========== ОБРАБОТЧИКИ БОТА ===========
function setupBotHandlers() {
  
  // Команда /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '👋 Привет! Я бот для магазина Duck Shop.');
      return;
    }
    
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['📋 Товары', '📦 Заказы'],
          ['📊 Статус', '➕ Добавить товар']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    bot.sendMessage(chatId, '👑 Привет, администратор! Выберите действие:', keyboard);
  });
  
  // Команда /status
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
    
    const status = `🤖 *Статус бота:*\n\n` +
      `✅ *Работает:* Да\n` +
      `⏰ *Аптайм:* ${hours}ч ${minutes}м ${seconds}с\n` +
      `📦 *Заказы:* ${pendingOrders} ожидают / ${totalOrders} всего\n` +
      `🌐 *Сервер:* ${SERVER_URL ? '✅ Настроен' : '❌ Не настроен'}\n` +
      `🔐 *API секрет:* ${API_SECRET ? '✅ Настроен' : '❌ Не настроен'}\n` +
      `👑 *Админ ID:* ${ADMIN_ID || '❌ Не настроен'}\n` +
      `📡 *Веб-сервер:* http://0.0.0.0:${PORT}\n\n` +
      `_Последняя проверка: ${new Date().toLocaleTimeString('ru-RU')}_`;
    
    bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  });
  
  // Команда /products - получение списка товаров
  bot.onText(/\/products|📋 Товары/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    if (!SERVER_URL) {
      return bot.sendMessage(chatId, '❌ SERVER_URL не настроен в переменных окружения');
    }
    
    try {
      bot.sendMessage(chatId, '🔄 Получаю список товаров...');
      
      const response = await axios.get(`${SERVER_URL}/api/products`, { 
        timeout: 15000 
      });
      
      const products = response.data?.products || [];
      
      if (products.length === 0) {
        return bot.sendMessage(chatId, '📭 Товаров нет в базе данных');
      }
      
      let message = `📋 *Товары (${products.length}):*\n\n`;
      products.forEach((p, i) => {
        message += `*${i+1}. ${escapeMarkdown(p.name)}*\n`;
        message += `   💰 ${p.price}₽\n`;
        message += `   🆔 \`${escapeMarkdown(p.id)}\`\n`;
        message += `   🎁 ${p.gift ? 'Подарок' : 'Обычный'}\n`;
        message += `   📅 ${new Date(p.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить список', callback_data: 'refresh_products' }],
            [{ text: '🗑️ Удалить товар', callback_data: 'delete_product_menu' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка получения товаров:', error.message);
      let errorMsg = `❌ Ошибка при получении товаров: ${error.message}`;
      
      if (error.code === 'ECONNREFUSED') {
        errorMsg = `❌ Не могу подключиться к серверу\nПроверьте SERVER_URL: ${SERVER_URL}`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMsg = '❌ Таймаут при подключении к серверу';
      }
      
      bot.sendMessage(chatId, errorMsg);
    }
  });
  
  // Команда /orders - просмотр заказов
  bot.onText(/\/orders|📦 Заказы/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    const pendingOrders = Object.entries(activeOrders)
      .filter(([id, order]) => order.status === 'pending');
    
    if (pendingOrders.length === 0) {
      return bot.sendMessage(chatId, '📭 Нет активных заказов, ожидающих обработки');
    }
    
    let message = `📊 *Заказы (${pendingOrders.length}):*\n\n`;
    pendingOrders.forEach(([orderId, order], index) => {
      const timeAgo = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
      message += `*${index+1}. Заказ:* \`${orderId}\`\n`;
      message += `   📧 *Почта:* ${escapeMarkdown(order.email)}\n`;
      if (order.code) {
        message += `   🔢 *Код:* \`${order.code}\`\n`;
      }
      message += `   💰 *Сумма:* ${order.amount || 0}₽\n`;
      message += `   📊 *Стадия:* ${order.stage === 'email_submitted' ? '📧 Email' : '🔢 Код'}\n`;
      message += `   ⏰ *Принят:* ${timeAgo} мин. назад\n\n`;
    });
    
    bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить список', callback_data: 'refresh_orders' }],
          [{ text: '✅ Подтвердить все', callback_data: 'approve_all' }]
        ]
      }
    });
  });
  
  // Команда /addproduct - добавление товара
  bot.onText(/\/addproduct|\+ Добавить товар/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    userStates[chatId] = { 
      step: 'awaiting_name',
      data: {} 
    };
    
    bot.sendMessage(chatId, 
      '📝 *Добавление нового товара*\n\n' +
      'Введите название товара:',
      { parse_mode: 'Markdown' }
    );
  });
  
  // Обработка сообщений для добавления товара
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    if (text.startsWith('/')) return;
    
    const state = userStates[chatId];
    
    if (!state) return;
    
    try {
      if (state.step === 'awaiting_name') {
        if (text.length < 2 || text.length > 100) {
          return bot.sendMessage(chatId, '❌ Название должно быть от 2 до 100 символов');
        }
        
        state.data.name = text.trim();
        state.step = 'awaiting_price';
        
        bot.sendMessage(chatId, 
          `✅ Название: *${escapeMarkdown(state.data.name)}*\n\n` +
          'Теперь введите цену товара (только число, в рублях):',
          { parse_mode: 'Markdown' }
        );
        
      } else if (state.step === 'awaiting_price') {
        const price = parseInt(text);
        
        if (isNaN(price) || price <= 0 || price > 1000000) {
          return bot.sendMessage(chatId, '❌ Введите корректную цену (от 1 до 1,000,000 рублей)');
        }
        
        state.data.price = price;
        state.step = 'awaiting_image';
        
        bot.sendMessage(chatId,
          `✅ Цена: *${price}₽*\n\n` +
          'Теперь введите URL картинки для товара:\n\n' +
          '_Пример: https://i.imgur.com/example.png_',
          { parse_mode: 'Markdown' }
        );
        
      } else if (state.step === 'awaiting_image') {
        const imageUrl = text.trim();
        
        // Простая валидация URL
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          return bot.sendMessage(chatId, '❌ Введите корректный URL (начинающийся с http:// или https://)');
        }
        
        state.data.image = imageUrl;
        state.step = 'awaiting_id';
        
        bot.sendMessage(chatId,
          `✅ Картинка: ${imageUrl}\n\n` +
          'Теперь введите ID товара (латинские буквы и цифры, можно с нижним подчеркиванием):\n\n' +
          '_Пример: crystal_30, vip_pass, premium_boost_',
          { parse_mode: 'Markdown' }
        );
        
      } else if (state.step === 'awaiting_id') {
        const productId = text.trim();
        
        if (!/^[a-z0-9_]+$/i.test(productId)) {
          return bot.sendMessage(chatId, '❌ ID должен содержать только латинские буквы, цифры и нижнее подчеркивание');
        }
        
        if (productId.length < 2 || productId.length > 50) {
          return bot.sendMessage(chatId, '❌ ID должен быть от 2 до 50 символов');
        }
        
        state.data.id = productId;
        state.step = 'confirming';
        
        const confirmKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Да, добавить товар', callback_data: `confirm_add_${chatId}` }],
              [{ text: '❌ Нет, отменить', callback_data: `cancel_add_${chatId}` }]
            ]
          }
        };
        
        bot.sendMessage(chatId,
          `📦 *Подтвердите добавление товара:*\n\n` +
          `*Название:* ${escapeMarkdown(state.data.name)}\n` +
          `*Цена:* ${state.data.price}₽\n` +
          `*ID:* \`${state.data.id}\`\n` +
          `*Картинка:* ${state.data.image}\n\n` +
          `Добавить этот товар?`,
          { parse_mode: 'Markdown', ...confirmKeyboard }
        );
      }
    } catch (error) {
      console.error('Ошибка в процессе добавления товара:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте снова.');
      delete userStates[chatId];
    }
  });
  
  // Обработка callback кнопок
  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Доступ запрещен' });
      return;
    }
    
    try {
      // Обновление списка товаров
      if (data === 'refresh_products') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🔄 Обновляю...' });
        await bot.deleteMessage(chatId, msg.message_id);
        
        const response = await axios.get(`${SERVER_URL}/api/products`, { timeout: 10000 });
        const products = response.data?.products || [];
        
        if (products.length === 0) {
          await bot.sendMessage(chatId, '📭 Товаров нет');
          return;
        }
        
        let message = `📋 *Товары (${products.length}):*\n\n`;
        products.forEach((p, i) => {
          message += `*${i+1}. ${escapeMarkdown(p.name)}*\n`;
          message += `   💰 ${p.price}₽ | 🆔 \`${escapeMarkdown(p.id)}\`\n\n`;
        });
        
        await bot.sendMessage(chatId, message, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Обновить список', callback_data: 'refresh_products' }],
              [{ text: '🗑️ Удалить товар', callback_data: 'delete_product_menu' }]
            ]
          }
        });
      }
      
      // Обновление списка заказов
      else if (data === 'refresh_orders') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🔄 Обновляю...' });
        await bot.deleteMessage(chatId, msg.message_id);
        
        const pendingOrders = Object.entries(activeOrders)
          .filter(([id, order]) => order.status === 'pending');
        
        if (pendingOrders.length === 0) {
          await bot.sendMessage(chatId, '📭 Нет активных заказов');
          return;
        }
        
        let message = `📊 *Заказы (${pendingOrders.length}):*\n\n`;
        pendingOrders.forEach(([orderId, order], index) => {
          message += `*${index+1}. Заказ:* \`${orderId}\`\n`;
          message += `   📧 ${escapeMarkdown(order.email)}\n`;
          if (order.code) message += `   🔢 ${order.code}\n`;
          message += `   💰 ${order.amount || 0}₽\n\n`;
        });
        
        await bot.sendMessage(chatId, message, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Обновить список', callback_data: 'refresh_orders' }]
            ]
          }
        });
      }
      
      // Подтверждение добавления товара
      else if (data.startsWith('confirm_add_')) {
        const targetChatId = data.replace('confirm_add_', '');
        const state = userStates[targetChatId];
        
        if (!state || !state.data) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Данные не найдены' });
          return;
        }
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🔄 Добавляю товар...' });
        
        try {
          if (!SERVER_URL || !API_SECRET) {
            throw new Error('SERVER_URL или API_SECRET не настроены');
          }
          
          const response = await axios.post(`${SERVER_URL}/api/add-product`, {
            id: state.data.id,
            name: state.data.name,
            price: state.data.price,
            image: state.data.image,
            gift: false,
            secret: API_SECRET
          }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.data.success) {
            await bot.editMessageText(
              `✅ Товар "*${escapeMarkdown(state.data.name)}*" успешно добавлен!\n` +
              `💰 Цена: ${state.data.price}₽\n` +
              `🆔 ID: \`${state.data.id}\``,
              {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
              }
            );
          } else {
            throw new Error(response.data.error || 'Неизвестная ошибка');
          }
          
        } catch (error) {
          console.error('Ошибка добавления товара:', error.message);
          await bot.editMessageText(
            `❌ Ошибка при добавлении товара:\n${error.message}`,
            {
              chat_id: chatId,
              message_id: msg.message_id,
              parse_mode: 'Markdown'
            }
          );
        }
        
        delete userStates[targetChatId];
      }
      
      // Отмена добавления товара
      else if (data.startsWith('cancel_add_')) {
        const targetChatId = data.replace('cancel_add_', '');
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Добавление отменено' });
        await bot.editMessageText('❌ Добавление товара отменено.', {
          chat_id: chatId,
          message_id: msg.message_id
        });
        
        delete userStates[targetChatId];
      }
      
      // Меню удаления товара
      else if (data === 'delete_product_menu') {
        await bot.answerCallbackQuery(callbackQuery.id);
        
        try {
          const response = await axios.get(`${SERVER_URL}/api/products`, { timeout: 10000 });
          const products = response.data?.products || [];
          
          if (products.length === 0) {
            await bot.sendMessage(chatId, '📭 Нет товаров для удаления');
            return;
          }
          
          const keyboard = {
            inline_keyboard: products.slice(0, 10).map(p => [
              { 
                text: `🗑️ ${p.name} (${p.price}₽)`, 
                callback_data: `delete_product_${p.id}` 
              }
            ])
          };
          
          if (products.length > 10) {
            keyboard.inline_keyboard.push([
              { text: '📄 Показать ещё...', callback_data: 'delete_product_page_2' }
            ]);
          }
          
          keyboard.inline_keyboard.push([
            { text: '↩️ Назад', callback_data: 'back_to_products' }
          ]);
          
          await bot.sendMessage(chatId, 'Выберите товар для удаления:', { reply_markup: keyboard });
        } catch (error) {
          await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        }
      }
      
      // Удаление конкретного товара
      else if (data.startsWith('delete_product_')) {
        const productId = data.replace('delete_product_', '');
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🔄 Удаляю...' });
        
        try {
          if (!SERVER_URL || !API_SECRET) {
            throw new Error('SERVER_URL или API_SECRET не настроены');
          }
          
          const response = await axios.post(`${SERVER_URL}/api/delete-product`, {
            id: productId,
            secret: API_SECRET
          }, {
            timeout: 10000,
            headers: { 
              'Content-Type': 'application/json',
              'x-api-secret': API_SECRET 
            }
          });
          
          if (response.data.success) {
            await bot.editMessageText(
              `✅ Товар с ID \`${productId}\` успешно удален!`,
              {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
              }
            );
          }
        } catch (error) {
          await bot.editMessageText(
            `❌ Ошибка при удалении товара:\n${error.message}`,
            {
              chat_id: chatId,
              message_id: msg.message_id
            }
          );
        }
      }
      
      // Возврат к списку товаров
      else if (data === 'back_to_products') {
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.deleteMessage(chatId, msg.message_id);
        bot.emit('text', { 
          chat: { id: chatId }, 
          text: '/products',
          from: { id: userId }
        });
      }
      
    } catch (error) {
      console.error('Ошибка обработки callback:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
  
  // Обработка ошибок polling
  bot.on('polling_error', (error) => {
    console.log('🔄 Polling error:', error.message);
    
    if (error.message.includes('409') || error.message.includes('Conflict')) {
      console.log('⚠️ Обнаружен конфликт polling');
      console.log('🔄 Перезапуск через 30 секунд...');
      
      bot.stopPolling();
      isPolling = false;
      
      setTimeout(() => {
        console.log('🔄 Перезапускаю бота...');
        initBot();
      }, 30000);
    }
  });
  
  bot.on('webhook_error', (error) => {
    console.error('❌ Webhook error:', error);
  });
  
  console.log('✅ Обработчики бота настроены');
}

// =========== ФУНКЦИЯ УВЕДОМЛЕНИЙ ===========
async function sendOrderNotification(orderId, email, items, amount, code, stage) {
  try {
    if (!ADMIN_ID) {
      console.log('⚠️ ADMIN_CHAT_ID не настроен');
      return;
    }
    
    let itemsText = '';
    if (items && typeof items === 'object') {
      for (const [itemId, quantity] of Object.entries(items)) {
        itemsText += `  • ${itemId}: ${quantity} шт.\n`;
      }
    }
    
    const stageText = stage === 'email_submitted' ? '📧 ПОЛУЧЕН EMAIL' : '📦 НОВЫЙ ЗАКАЗ';
    
    const message = 
      `${stageText}\n\n` +
      `📦 *Заказ:* \`${orderId}\`\n` +
      `📧 *Почта:* ${escapeMarkdown(email)}\n` +
      `${code ? `🔢 *Код:* \`${code}\`\n` : ''}` +
      `💰 *Сумма:* ${amount || 0}₽\n` +
      `🛒 *Товары:*\n${itemsText}\n` +
      `⏰ *Время:* ${new Date().toLocaleTimeString('ru-RU')}`;
    
    await bot.sendMessage(ADMIN_ID, message, {
      parse_mode: 'Markdown'
    });
    
    console.log(`✅ Уведомление отправлено: ${orderId}`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления:', error.message);
  }
}

// =========== ЗАПУСК БОТА ===========
initBot();

// =========== KEEP-ALIVE И САМОКОНТРОЛЬ ===========
// Регулярный keep-alive
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  const totalOrders = Object.keys(activeOrders).length;
  
  console.log(`[${new Date().toLocaleTimeString('ru-RU')}] 🤖 Бот: ${hours}ч ${minutes}м | 📦 Заказы: ${pendingOrders}/${totalOrders}`);
  
  // Проверяем состояние бота
  if (!isPolling) {
    console.log('⚠️ Бот не в режиме polling, перезапускаю...');
    initBot();
  }
}, 5 * 60 * 1000); // Каждые 5 минут

// Проверка здоровья сервера
setInterval(async () => {
  try {
    if (SERVER_URL) {
      await axios.get(`${SERVER_URL}/api/products`, { timeout: 5000 });
      console.log('✅ Связь с сервером: OK');
    }
  } catch (error) {
    console.log('⚠️ Связь с сервером: проблемы', error.message);
  }
}, 10 * 60 * 1000); // Каждые 10 минут

console.log('🚀 Бот запущен и готов к работе!');