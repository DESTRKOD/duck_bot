const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// =========== НАСТРОЙКИ ===========
const TOKEN = process.env.TG_TOKEN; // Получите у @BotFather
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID); // Ваш ID
const SERVER_URL = process.env.RENDER_URL || 'https://duck-backend-by9a.onrender.com';
const API_SECRET = process.env.API_SECRET || 'duck_shop_secret_2024';

// Создаем бота
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Duck Shop Bot запущен 24/7');
console.log(`👑 Администратор: ${ADMIN_ID}`);
console.log(`🌐 Сервер: ${SERVER_URL}`);

// Хранилище состояний
const userStates = {};

// =========== КОМАНДЫ ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '👋 Только для администратора');
  }
  
  showMainMenu(chatId, `👑 Администратор ${msg.from.first_name}!`);
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== ADMIN_ID) return;
  
  await listProducts(chatId);
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  delete userStates[chatId];
  bot.sendMessage(chatId, '❌ Отменено', getMainKeyboard());
});

// =========== ГЛАВНОЕ МЕНЮ ===========
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ['📦 Добавить товар', '📋 Список товаров'],
        ['❌ Удалить товар', '🔄 Проверить сервер']
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
    bot.sendMessage(chatId, '📝 Введите название товара:');
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
  else if (userStates[chatId]) {
    await handleProductStep(chatId, text);
  }
});

// =========== ФУНКЦИИ ===========

// 1. Список товаров
async function listProducts(chatId) {
  try {
    const response = await axios.get(`${SERVER_URL}/api/products`, {
      timeout: 5000
    });
    
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Товаров нет');
    }
    
    let message = `📋 Товаров: ${products.length}\n\n`;
    products.forEach((p, i) => {
      message += `${i+1}. ${p.name}\n`;
      message += `   💰 ${p.price}₽ | 🆔 ${p.id}\n`;
      if (p.gift) message += `   🎁 Подарочный\n`;
      message += '\n';
    });
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Ошибка: ' + (error.message || 'Сервер недоступен'));
  }
}

// 2. Проверка сервера
async function checkServer(chatId) {
  try {
    const response = await axios.get(`${SERVER_URL}/check`, {
      timeout: 5000
    });
    
    const data = response.data;
    const message = 
      `✅ Сервер работает\n` +
      `📦 Товаров: ${data.products_count || 0}\n` +
      `🛒 Shop ID: ${data.shop_id || 'Не указан'}\n` +
      `⏰ Время: ${new Date().toLocaleTimeString()}`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Сервер недоступен');
  }
}

// 3. Добавление товара
async function handleProductStep(chatId, text) {
  const state = userStates[chatId];
  
  if (state.step === 'name') {
    state.name = text;
    state.step = 'price';
    bot.sendMessage(chatId, '💰 Введите цену (только цифры):');
  }
  else if (state.step === 'price') {
    const price = parseInt(text);
    if (isNaN(price) || price <= 0) {
      return bot.sendMessage(chatId, '❌ Введите корректную цену!');
    }
    
    state.price = price;
    state.step = 'image';
    bot.sendMessage(chatId, '🖼️ Введите URL картинки:\nПример: https://i.imgur.com/xxx.png');
  }
  else if (state.step === 'image') {
    const imageUrl = text.trim();
    
    if (!imageUrl.startsWith('http')) {
      return bot.sendMessage(chatId, '❌ Некорректный URL!');
    }
    
    state.image = imageUrl;
    state.step = 'confirm';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Добавить товар', callback_data: 'confirm_add' },
            { text: '🎁 Подарочный', callback_data: 'confirm_gift' }
          ],
          [
            { text: '❌ Отмена', callback_data: 'cancel_add' }
          ]
        ]
      }
    };
    
    bot.sendMessage(chatId,
      `📝 Проверьте данные:\n\n` +
      `📦 ${state.name}\n` +
      `💰 ${state.price}₽\n` +
      `🖼️ ${state.image.substring(0, 50)}...`,
      keyboard
    );
  }
}

// 4. Удаление товара
async function showDeleteMenu(chatId) {
  try {
    const response = await axios.get(`${SERVER_URL}/api/products`);
    const products = response.data?.products || [];
    
    if (!products.length) {
      return bot.sendMessage(chatId, '📭 Нет товаров для удаления');
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: products.map(p => [
          { text: `❌ ${p.name} - ${p.price}₽`, callback_data: `delete_${p.id}` }
        ]).concat([[{ text: '↩️ Назад', callback_data: 'back_to_main' }]])
      }
    };
    
    bot.sendMessage(chatId, 'Выберите товар для удаления:', keyboard);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Ошибка загрузки товаров');
  }
}

// 5. Подтверждение добавления
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  if (data === 'confirm_add' || data === 'confirm_gift') {
    const state = userStates[chatId];
    if (!state || state.step !== 'confirm') return;
    
    try {
      // Генерируем ID
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const productData = {
        id: productId,
        name: state.name,
        price: state.price,
        img: state.image,
        gift: data === 'confirm_gift',
        secret: API_SECRET
      };
      
      console.log('Добавление товара:', productData);
      
      // Отправляем на сервер
      const response = await axios.post(`${SERVER_URL}/api/add-product`, productData, {
        timeout: 10000
      });
      
      if (response.data?.success) {
        bot.editMessageText(
          `✅ Товар добавлен!\n\n` +
          `📦 ${state.name}\n` +
          `💰 ${state.price}₽\n` +
          `🆔 ${productId}\n` +
          `${data === 'confirm_gift' ? '🎁 Подарочный' : ''}\n\n` +
          `🔄 Теперь на сайте!`,
          { chat_id: chatId, message_id: msg.message_id }
        );
      }
    } catch (error) {
      bot.editMessageText(`❌ Ошибка: ${error.response?.data?.error || error.message}`, {
        chat_id: chatId, message_id: msg.message_id
      });
    }
    
    delete userStates[chatId];
    setTimeout(() => showMainMenu(chatId), 2000);
  }
  else if (data.startsWith('delete_')) {
    const productId = data.replace('delete_', '');
    
    try {
      const response = await axios.post(`${SERVER_URL}/api/delete-product`, {
        id: productId,
        secret: API_SECRET
      });
      
      if (response.data?.success) {
        bot.editMessageText(`✅ Товар удален!\n🆔 ${productId}`, {
          chat_id: chatId, message_id: msg.message_id
        });
      }
    } catch (error) {
      bot.editMessageText(`❌ Ошибка удаления`, {
        chat_id: chatId, message_id: msg.message_id
      });
    }
  }
  else if (data === 'cancel_add') {
    delete userStates[chatId];
    bot.editMessageText('❌ Добавление отменено', {
      chat_id: chatId, message_id: msg.message_id
    });
    showMainMenu(chatId);
  }
  else if (data === 'back_to_main') {
    showMainMenu(chatId);
  }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.log('🔄 Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.log('❌ Webhook error:', error.message);
});

// Keep-alive для бесплатного Render
setInterval(() => {
  console.log(`[${new Date().toLocaleTimeString()}] Бот работает...`);
}, 60000); // Каждую минуту

console.log('✅ Бот готов к работе 24/7!');