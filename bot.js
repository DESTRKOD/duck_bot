const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ===========
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const SERVER_URL = process.env.RENDER_URL;
const API_SECRET = process.env.API_SECRET;
const PORT = process.env.PORT || 10000;

// Проверка обязательных переменных
if (!TOKEN) {
  console.error('❌ ОШИБКА: TG_TOKEN не установлен!');
  console.error('Добавьте TG_TOKEN в переменные окружения Render');
  process.exit(1);
}

if (!ADMIN_ID) {
  console.error('⚠️ ВНИМАНИЕ: ADMIN_CHAT_ID не установлен');
  console.error('Некоторые функции будут недоступны');
}

if (!SERVER_URL) {
  console.error('⚠️ ВНИМАНИЕ: RENDER_URL не установлен');
  console.error('Работа с магазином будет недоступна');
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

// =========== ВЕБ-СЕРВЕР ===========
const app = express();
app.use(express.json());

// Разрешаем CORS для всех
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
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
        body { font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto; }
        .status { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 5px; }
        .info { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .warning { background: #ff9800; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>🤖 Duck Shop Bot</h1>
      <div class="status">✅ Статус: Работает</div>
      
      ${!TOKEN ? '<div class="warning">⚠️ TG_TOKEN не установлен!</div>' : ''}
      ${!ADMIN_ID ? '<div class="warning">⚠️ ADMIN_CHAT_ID не установлен</div>' : ''}
      ${!SERVER_URL ? '<div class="warning">⚠️ RENDER_URL не установлен</div>' : ''}
      
      <div class="info">
        <p><strong>👑 Администратор:</strong> ${ADMIN_ID || 'Не установлен'}</p>
        <p><strong>🌐 Сервер магазина:</strong> ${SERVER_URL ? `<a href="${SERVER_URL}" target="_blank">${SERVER_URL}</a>` : 'Не установлен'}</p>
        <p><strong>🌍 Внешний URL:</strong> <a href="${externalUrl}" target="_blank">${externalUrl}</a></p>
        <p><strong>🕐 Время:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>📊 Состояние:</strong> ${Object.keys(userStates || {}).length} активных пользователей</p>
      </div>
      
      <h3>📡 API Endpoints:</h3>
      <ul>
        <li><a href="/status">/status</a> - Статус бота (JSON)</li>
        <li><a href="/health">/health</a> - Проверка здоровья</li>
        <li><a href="/products">/products</a> - Товары с сервера</li>
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
      
      <p style="margin-top: 40px; color: #666;">🤖 Бот работает 24/7 на Render.com</p>
    </body>
    </html>
  `);
});

// Статус бота (JSON)
app.get('/status', (req, res) => {
  res.json({
    success: true,
    service: 'Duck Shop Bot',
    status: 'running',
    uptime: process.uptime(),
    admin_id: ADMIN_ID,
    active_users: Object.keys(userStates || {}).length,
    server_url: SERVER_URL,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    node_version: process.version,
    env_vars: {
      has_token: !!TOKEN,
      has_admin_id: !!ADMIN_ID,
      has_server_url: !!SERVER_URL,
      has_api_secret: !!API_SECRET
    }
  });
});

// Проверка здоровья
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Bot is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Получить товары с сервера магазина
app.get('/products', async (req, res) => {
  if (!SERVER_URL) {
    return res.status(400).json({
      success: false,
      error: 'RENDER_URL не установлен в переменных окружения'
    });
  }
  
  try {
    const response = await axios.get(`${SERVER_URL}/api/products`, {
      timeout: 5000
    });
    res.json({
      success: true,
      source: 'duck-backend',
      products: response.data.products || [],
      count: response.data.products?.length || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      server_url: SERVER_URL,
      message: 'Не удалось получить товары с сервера'
    });
  }
});

// Keep-alive для Render (предотвращает сон)
app.get('/keep-alive', (req, res) => {
  res.json({
    success: true,
    message: 'Keep-alive request received',
    timestamp: new Date().toISOString()
  });
});

// Запускаем веб-сервер
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
console.log(`🔐 API Secret: ${API_SECRET ? 'Установлен' : 'Не установлен'}`);
console.log(`📡 Веб-порт: ${PORT}`);

// Хранилище состояний пользователей
const userStates = {};

// =========== КОМАНДЫ ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (ADMIN_ID && userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, 
      '👋 Привет! Я бот для управления магазином Duck Shop.\n' +
      '⚙️ Только администратор может управлять товарами.'
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
    '`/server` - Проверить сервер\n' +
    '`/cancel` - Отменить действие\n\n' +
    '**Кнопки меню:**\n' +
    '📦 Добавить товар - Добавить новый товар\n' +
    '📋 Список товаров - Показать все товары\n' +
    '❌ Удалить товар - Удалить товар\n' +
    '🔄 Проверить сервер - Статус сервера',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) return;
  
  await listProducts(chatId);
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
        ['❌ Удалить товар', '🔄 Проверить сервер'],
        ['📊 Статус бота', '❓ Помощь']
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
    
    let statusMessage = `🤖 **Статус бота:**\n\n` +
      `✅ Работает\n` +
      `⏰ Время работы: ${hours}ч ${minutes}м\n` +
      `👥 Активных сессий: ${Object.keys(userStates).length}\n` +
      `🌐 Веб-сервер: ${process.env.RENDER_EXTERNAL_URL || `Порт ${PORT}`}\n`;
    
    if (SERVER_URL) {
      statusMessage += `🛒 Сервер магазина: ${SERVER_URL}\n`;
    } else {
      statusMessage += `⚠️ RENDER_URL: Не установлен\n`;
    }
    
    statusMessage += `🔑 Админ ID: ${ADMIN_ID || 'Не установлен'}`;
    
    bot.sendMessage(chatId, escapeMarkdown(statusMessage), { parse_mode: 'Markdown' });
  }
  else if (text === '❓ Помощь') {
    bot.sendMessage(chatId, 'Напишите /help для списка команд');
  }
  else if (userStates[chatId]) {
    await handleProductStep(chatId, text);
  }
});

// =========== ОСНОВНЫЕ ФУНКЦИИ ===========

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

// 2. Проверить сервер
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

// 3. Добавление товара (по шагам)
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

// 4. Меню удаления товара
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
        errorMsg += 'RENDER_URL не установлен';
      } else if (!API_SECRET) {
        errorMsg += 'API_SECRET не установлен';
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
  
  // Логируем статус
  console.log(`[${new Date().toLocaleTimeString()}] Бот работает ${hours}ч ${minutes}м | Пользователей: ${Object.keys(userStates).length}`);
  
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

// =========== ОБРАБОТКА ЗАВЕРШЕНИЯ ===========
// Изящное завершение при SIGTERM (от Render)
process.on('SIGTERM', () => {
  console.log('🔄 Получен SIGTERM, завершаю работу...');
  
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