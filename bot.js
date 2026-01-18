const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_URL;
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
  return text ? text.toString()
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`') : '';
}

// =========== API ЭНДПОИНТЫ ===========

// Уведомления от сервера
app.post('/api/order-notify', async (req, res) => {
  try {
    const { order_id, email, items, amount, code, secret, stage } = req.body;
    
    console.log(`📦 Уведомление: ${order_id}`);
    
    if (!API_SECRET || secret !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!ADMIN_ID) {
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
    
    // Отправляем в Telegram
    await sendOrderNotification(order_id, email, items, amount, code, stage);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Ошибка уведомления:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    bot: 'running',
    orders: Object.keys(activeOrders).length,
    time: new Date().toISOString() 
  });
});

app.get('/', (req, res) => {
  res.send(`
    <html><body>
      <h1>🤖 Duck Shop Bot</h1>
      <p>✅ Бот работает</p>
      <p>📦 Активных заказов: ${Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length}</p>
      <p>👑 Админ: ${ADMIN_ID || 'Не настроен'}</p>
      <p>🌐 Сервер: ${SERVER_URL || 'Не настроен'}</p>
    </body></html>
  `);
});

// =========== ЗАПУСК СЕРВЕРА ===========
const server = app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер: порт ${PORT}`);
});

// =========== ТЕЛЕГРАМ БОТ ===========
let bot;

const initBot = () => {
  try {
    bot = new TelegramBot(TOKEN, {
      polling: {
        interval: 1000,
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
    
    // Перезапуск через 10 секунд при 409 ошибке
    if (error.message.includes('409')) {
      console.log('🔄 409 Conflict - перезапуск через 10 секунд...');
      setTimeout(initBot, 10000);
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
        resize_keyboard: true
      }
    };
    
    bot.sendMessage(chatId, '👑 Привет, администратор!', keyboard);
  });
  
  // Команда /status
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const pendingOrders = Object.keys(activeOrders).filter(id => activeOrders[id].status === 'pending').length;
    
    const status = `🤖 *Статус бота:*\n\n` +
      `✅ Работает\n` +
      `⏰ ${hours}ч ${minutes}м\n` +
      `📦 Заказов: ${pendingPending = 0} / ${Object.keys(activeOrders).length}\n` +
      `🌐 Сервер: ${SERVER_URL ? '✅' : '❌'}\n` +
      `🔐 API: ${API_SECRET ? '✅' : '❌'}\n` +
      `👑 Админ: ${ADMIN_ID || '❌'}`;
    
    bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  });
  
  // Команда /products
  bot.onText(/\/products/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!SERVER_URL) {
      return bot.sendMessage(chatId, '❌ SERVER_URL не настроен');
    }
    
    try {
      const response = await axios.get(`${SERVER_URL}/api/products`, { timeout: 10000 });
      const products = response.data?.products || [];
      
      if (products.length === 0) {
        return bot.sendMessage(chatId, '📭 Товаров нет');
      }
      
      let message = `📋 *Товары (${products.length}):*\n\n`;
      products.forEach((p, i) => {
        message += `${i+1}. *${escapeMarkdown(p.name)}*\n`;
        message += `   💰 ${p.price}₽ | 🆔 ${escapeMarkdown(p.id)}\n\n`;
      });
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
  });
  
  // Команда /orders
  bot.onText(/\/orders/, (msg) => {
    const chatId = msg.chat.id;
    
    const pendingOrders = Object.entries(activeOrders)
      .filter(([id, order]) => order.status === 'pending');
    
    if (pendingOrders.length === 0) {
      return bot.sendMessage(chatId, '📭 Нет активных заказов');
    }
    
    let message = `📊 *Заказы (${pendingOrders.length}):*\n\n`;
    pendingOrders.forEach(([orderId, order], index) => {
      message += `${index+1}. *${orderId}*\n`;
      message += `   📧 ${escapeMarkdown(order.email)}\n`;
      message += `   ${order.code ? `🔢 ${order.code}\n` : ''}`;
      message += `   💰 ${order.amount || 0}₽\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });
  
  // Команда /addproduct
  bot.onText(/\/addproduct/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    
    userStates[chatId] = { step: 'name' };
    bot.sendMessage(chatId, '📝 Введите название товара:');
  });
  
  // Обработка сообщений
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    
    if (ADMIN_ID && userId !== ADMIN_ID) return;
    if (text.startsWith('/')) return;
    
    const state = userStates[chatId];
    
    if (state?.step === 'name') {
      state.name = text;
      state.step = 'price';
      bot.sendMessage(chatId, '💰 Введите цену:');
    }
    else if (state?.step === 'price') {
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) {
        return bot.sendMessage(chatId, '❌ Введите число больше 0');
      }
      
      state.price = price;
      state.step = 'image';
      bot.sendMessage(chatId, '🖼️ Введите URL картинки:');
    }
    else if (state?.step === 'image') {
      const imageUrl = text.trim();
      
      if (!SERVER_URL || !API_SECRET) {
        bot.sendMessage(chatId, '❌ SERVER_URL или API_SECRET не настроены');
        delete userStates[chatId];
        return;
      }
      
      try {
        const productId = `prod_${Date.now()}`;
        
        const response = await axios.post(`${SERVER_URL}/api/add-product`, {
          id: productId,
          name: state.name,
          price: state.price,
          image: imageUrl,
          gift: false,
          secret: API_SECRET
        }, {
          timeout: 15000,
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data.success) {
          bot.sendMessage(chatId, `✅ Товар "${state.name}" добавлен!`);
        }
        
      } catch (error) {
        console.error('Ошибка добавления:', error.message);
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
      
      delete userStates[chatId];
    }
  });
  
  // Обработка callback (кнопки)
  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
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
          console.error('Ошибка обновления:', error.message);
        }
      }
      
      // Обновляем локально
      if (activeOrders[orderId]) {
        activeOrders[orderId].status = 'approved';
      }
      
      bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Заказ подтверждён' });
    }
  });
  
  // Обработка ошибок polling
  bot.on('polling_error', (error) => {
    console.log('🔄 Polling error:', error.message);
    
    if (error.message.includes('409')) {
      console.log('⚠️ Обнаружен конфликт polling');
      console.log('🔄 Перезапуск через 30 секунд...');
      
      bot.stopPolling();
      
      setTimeout(() => {
        console.log('🔄 Перезапускаю бота...');
        initBot();
      }, 30000);
    }
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
    
    const stageText = stage === 'email_submitted' ? '📧 EMAIL' : 
                     stage === 'code_submitted' ? '🔢 КОД' : '📦 ЗАКАЗ';
    
    const message = 
      `${stageText}\n\n` +
      `📦 *Заказ:* \`${orderId}\`\n` +
      `📧 *Почта:* ${escapeMarkdown(email)}\n` +
      `${code ? `🔢 *Код:* \`${code}\`\n` : ''}` +
      `💰 *Сумма:* ${amount || 0}₽\n` +
      `🛒 *Товары:*\n${itemsText}`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить', callback_data: `approve_${orderId}` },
            { text: '❌ Отклонить', callback_data: `reject_${orderId}` }
          ]
        ]
      }
    };
    
    await bot.sendMessage(ADMIN_ID, message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    console.log(`✅ Уведомление отправлено: ${orderId}`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки:', error.message);
  }
}

// =========== ЗАПУСК ===========
initBot();

// Keep-alive
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  console.log(`[${new Date().toLocaleTimeString()}] Бот: ${hours}ч ${minutes}м`);
}, 5 * 60 * 1000);

console.log('🚀 Бот запущен и готов к работе!');
