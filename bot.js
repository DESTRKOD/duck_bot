const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// =========== НАСТРОЙКИ ===========
const TOKEN = process.env.TG_TOKEN || 'ВАШ_ТОКЕН_БОТА';
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID) || 2112942356;
const SERVER_URL = process.env.RENDER_URL || 'https://duck-backend-by9a.onrender.com';
const API_SECRET = process.env.API_SECRET || 'duck_shop_secret_2024';
const PORT = process.env.PORT || 10000;

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
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 Duck Shop Bot</title>
      <style>
        body { font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto; }
        .status { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 5px; }
        .info { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🤖 Duck Shop Bot</h1>
      <div class="status">✅ Статус: Работает</div>
      <div class="info">
        <p><strong>👑 Администратор:</strong> ${ADMIN_ID}</p>
        <p><strong>🌐 Сервер магазина:</strong> <a href="${SERVER_URL}" target="_blank">${SERVER_URL}</a></p>
        <p><strong>🕐 Время:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>📊 Состояние:</strong> ${Object.keys(userStates).length} активных пользователей</p>
      </div>
      <h3>📡 API Endpoints:</h3>
      <ul>
        <li><a href="/status">/status</a> - Статус бота</li>
        <li><a href="/health">/health</a> - Проверка здоровья</li>
        <li><a href="/products">/products</a> - Товары с сервера</li>
        <li><a href="${SERVER_URL}">Сервер магазина</a></li>
      </ul>
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
    active_users: Object.keys(userStates).length,
    server_url: SERVER_URL,
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
    timestamp: new Date().toISOString()
  });
});

// Получить товары с сервера магазина
app.get('/products', async (req, res) => {
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
      message: 'Не удалось получить товары с сервера'
    });
  }
});

// Запускаем веб-сервер
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
  console.log(`🔗 URL: http://0.0.0.0:${PORT}`);
});

// =========== ТЕЛЕГРАМ БОТ ===========
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Duck Shop Bot запущен 24/7');
console.log(`👑 Администратор: ${ADMIN_ID}`);
console.log(`🌐 Сервер магазина: ${SERVER_URL}`);
console.log(`🔐 API Secret: ${API_SECRET ? 'Установлен' : 'По умолчанию'}`);
console.log(`📡 Веб-порт: ${PORT}`);

// Хранилище состояний пользователей
const userStates = {};

// =========== КОМАНДЫ ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, 
      '👋 Привет! Я бот для управления магазином Duck Shop.\n' +
      '⚙️ Только администратор может управлять товарами.'
    );
  }
  
  showMainMenu(chatId, `👑 Администратор ${msg.from.first_name}!`);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== ADMIN_ID) return;
  
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
    '🔄 Проверить сервер - Статус сервера'
  );
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== ADMIN_ID) return;
  
  await listProducts(chatId);
});

bot.onText(/\/server/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== ADMIN_ID) return;
  
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
  
  if (userId !== ADMIN_ID) return;
  if (text.startsWith('/')) return;
  
  if (text === '📦 Добавить товар') {
    userStates[chatId] = { step: 'name' };
    bot.sendMessage(chatId, '📝 Введите название товара:\n\nПример: "50 кристаллов" или "Brawl Pass"');
  }
  else if (text === '📋 Список товаров') {
    await listProducts(chatId);
  }
  else if (text === '❌ Удалить товар') {
    await showDeleteMenu(chatId);
  }
  else if (text === '🔄 Проверить сервер') {
    await checkServer(chatId);
  }
  else if (text === '📊 Статус бота') {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    bot.sendMessage(chatId,
      `🤖 **Статус бота:**\n\n` +
      `✅ Работает\n` +
      `⏰ Время работы: ${hours}ч ${minutes}м\n` +
      `👥 Активных сессий: ${Object.keys(userStates).length}\n` +
      `🌐 Сервер: ${SERVER_URL}\n` +
      `🔗 Веб-интерфейс: ваш_бот_на_render.com`
    );
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
  try {
    bot.sendMessage(chatId, '🔄 Загружаю товары...');
    
    const response = await axios.get(`${SERVER_URL}/api/products`, {
      timeout: 10000
    });
    
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Товаров в магазине нет');
    }
    
    let message = `📋 **Товаров в магазине:** ${products.length}\n\n`;
    products.forEach((p, i) => {
      message += `${i+1}. **${p.name}**\n`;
      message += `   💰 ${p.price}₽ | 🆔 ${p.id}\n`;
      if (p.gift) message += `   🎁 Подарочный товар\n`;
      message += '\n';
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка получения товаров:', error.message);
    bot.sendMessage(chatId, 
      '❌ Не удалось получить товары\n' +
      `Ошибка: ${error.message || 'Сервер недоступен'}`
    );
  }
}

// 2. Проверить сервер
async function checkServer(chatId) {
  try {
    bot.sendMessage(chatId, '🔄 Проверяю сервер магазина...');
    
    const response = await axios.get(`${SERVER_URL}/check`, {
      timeout: 10000
    });
    
    const data = response.data;
    const message = 
      `✅ **Сервер магазина работает**\n\n` +
      `📦 Товаров: ${data.products_count || 0}\n` +
      `🛒 Shop ID: ${data.shop_id || 'Не указан'}\n` +
      `🌐 URL: ${SERVER_URL}\n` +
      `⏰ Время сервера: ${new Date(data.time).toLocaleTimeString()}`;
    
    bot.sendMessage(chatId, message);
    
  } catch (error) {
    bot.sendMessage(chatId, 
      `❌ **Сервер недоступен**\n` +
      `Ошибка: ${error.message}\n` +
      `URL: ${SERVER_URL}`
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
      `📝 **Проверьте данные товара:**\n\n` +
      `📦 **Название:** ${state.name}\n` +
      `💰 **Цена:** ${state.price}₽\n` +
      `🖼️ **Картинка:** ${state.image.substring(0, 50)}...\n\n` +
      `Выберите тип товара:`,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }
}

// 4. Меню удаления товара
async function showDeleteMenu(chatId) {
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
          { text: `❌ ${p.name} - ${p.price}₽`, callback_data: `delete_${p.id}` }
        ]).concat([[{ text: '↩️ Назад в меню', callback_data: 'back_to_main' }]])
      }
    };
    
    bot.sendMessage(chatId, 'Выберите товар для удаления:', keyboard);
    
  } catch (error) {
    bot.sendMessage(chatId, '❌ Ошибка загрузки товаров');
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
      // Генерируем ID товара
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const productData = {
        id: productId,
        name: state.name,
        price: state.price,
        img: state.image,
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
          `✅ **Товар успешно добавлен!**\n\n` +
          `📦 ${state.name}\n` +
          `💰 ${state.price}₽\n` +
          `🆔 ${productId}\n` +
          `${data === 'confirm_gift' ? '🎁 Подарочный товар' : '📦 Обычный товар'}\n\n` +
          `🔄 Теперь товар доступен в магазине!`,
          { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
        );
        
        // Очищаем состояние
        delete userStates[chatId];
        
        // Через 2 сек показываем главное меню
        setTimeout(() => showMainMenu(chatId, 'Товар добавлен! Что дальше?'), 2000);
      }
      
    } catch (error) {
      console.error('Ошибка добавления товара:', error.message);
      
      let errorMsg = '❌ **Ошибка добавления товара**\n';
      if (error.response?.data?.error) {
        errorMsg += error.response.data.error;
      } else if (error.code === 'ECONNREFUSED') {
        errorMsg += 'Сервер магазина недоступен';
      } else {
        errorMsg += error.message;
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
      const response = await axios.post(`${SERVER_URL}/api/delete-product`, {
        id: productId,
        secret: API_SECRET
      }, {
        timeout: 10000
      });
      
      if (response.data?.success) {
        bot.editMessageText(`✅ **Товар удален!**\n\n🆔 ID: ${productId}`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown'
        });
      }
    } catch (error) {
      bot.editMessageText('❌ Ошибка удаления товара', {
        chat_id: chatId,
        message_id: msg.message_id
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

// =========== ОБРАБОТКА ОШИБОК ===========
bot.on('polling_error', (error) => {
  console.log('🔄 Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.log('❌ Webhook error:', error.message);
});

// Keep-alive сообщения
setInterval(() => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  console.log(`[${new Date().toLocaleTimeString()}] Бот работает ${hours}ч ${minutes}м`);
}, 60000);

// =========== ЗАПУСК ===========
console.log('✅ Бот и веб-сервер готовы к работе 24/7!');
console.log(`📡 Проверьте веб-интерфейс: http://0.0.0.0:${PORT}`);