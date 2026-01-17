// =========== ЭНДПОИНТ ДЛЯ EMAIL (ОБНОВЛЕННЫЙ) ===========
app.post("/submit-email", async (req, res) => {
  try {
    const { order_id, email, cart } = req.body;
    
    console.log(`📧 Email для заказа ${order_id}: ${email}`);
    console.log(`🛒 Корзина:`, cart);
    
    // Сохраняем в базу
    await db.read();
    
    // Находим или создаем заказ
    let orderIndex = db.data.orders.findIndex(o => o.id === order_id);
    
    if (orderIndex === -1) {
      db.data.orders.push({
        id: order_id,
        email: email,
        cart: cart,
        status: "pending_email",
        created_at: new Date().toISOString()
      });
    } else {
      db.data.orders[orderIndex].email = email;
      db.data.orders[orderIndex].cart = cart;
      db.data.orders[orderIndex].status = "pending_email";
    }
    
    await db.write();
    
    // Отправляем уведомление боту (если есть API_SECRET и URL бота)
    const BOT_URL = process.env.BOT_URL || "https://duck-bot.onrender.com";
    const API_SECRET = process.env.API_SECRET || "duck_shop_secret_2024";
    
    try {
      await axios.post(`${BOT_URL}/api/order-notify`, {
        order_id,
        email,
        items: cart,
        amount: calculateCartTotalFromCart(cart), // Нужно реализовать эту функцию
        code: null, // Пока нет кода
        secret: API_SECRET
      }, { timeout: 5000 });
      
      console.log(`📤 Уведомление о заказе ${order_id} отправлено боту`);
    } catch (botError) {
      console.log(`⚠️ Не удалось отправить уведомление боту: ${botError.message}`);
    }
    
    res.json({ 
      success: true, 
      message: "Email сохранен",
      order_id,
      email 
    });
    
  } catch (error) {
    console.error("Ошибка сохранения email:", error);
    res.status(500).json({ 
      success: false,
      error: "Ошибка сервера" 
    });
  }
});

// =========== ЭНДПОИНТ ДЛЯ КОДА (ОБНОВЛЕННЫЙ) ===========
app.post("/api/submit-code", async (req, res) => {
  try {
    const { order_id, email, code } = req.body;
    
    if (!order_id || !email || !code) {
      return res.status(400).json({ 
        success: false, 
        error: "Не все поля заполнены" 
      });
    }
    
    console.log(`🔢 Код для заказа ${order_id}: ${code}`);
    
    await db.read();
    
    // Обновляем заказ с кодом
    const orderIndex = db.data.orders.findIndex(o => o.id === order_id);
    
    if (orderIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        error: "Заказ не найден" 
      });
    }
    
    db.data.orders[orderIndex].code = code;
    db.data.orders[orderIndex].status = "pending_code";
    db.data.orders[orderIndex].code_submitted_at = new Date().toISOString();
    
    await db.write();
    
    // Отправляем уведомление боту с кодом
    const BOT_URL = process.env.BOT_URL || "https://duck-bot.onrender.com";
    const API_SECRET = process.env.API_SECRET || "duck_shop_secret_2024";
    
    try {
      await axios.post(`${BOT_URL}/api/order-notify`, {
        order_id,
        email,
        items: db.data.orders[orderIndex].cart || {},
        amount: calculateOrderTotal(db.data.orders[orderIndex]),
        code: code,
        secret: API_SECRET
      }, { timeout: 5000 });
      
      console.log(`📤 Уведомление с кодом для заказа ${order_id} отправлено боту`);
    } catch (botError) {
      console.log(`⚠️ Не удалось отправить уведомление с кодом боту: ${botError.message}`);
    }
    
    res.json({ 
      success: true, 
      message: "Код отправлен на проверку",
      order_id,
      status: "pending"
    });
    
  } catch (error) {
    console.error("Ошибка сохранения кода:", error);
    res.status(500).json({ 
      success: false,
      error: "Ошибка сервера" 
    });
  }
});

// =========== ЭНДПОИНТ ДЛЯ ПРОВЕРКИ СТАТУСА ===========
app.get("/api/order-status/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    
    await db.read();
    
    const order = db.data.orders.find(o => o.id === order_id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: "Заказ не найден" 
      });
    }
    
    res.json({
      success: true,
      order_id,
      status: order.status || "unknown",
      email: order.email,
      code: order.code,
      created_at: order.created_at,
      updated_at: order.updated_at || order.created_at
    });
    
  } catch (error) {
    console.error("Ошибка проверки статуса:", error);
    res.status(500).json({ 
      success: false,
      error: "Ошибка сервера" 
    });
  }
});

// =========== ЭНДПОИНТ ДЛЯ ОБНОВЛЕНИЯ СТАТУСА ОТ БОТА ===========
app.post("/api/order-status-update", async (req, res) => {
  try {
    const { order_id, status, admin_comment, secret } = req.body;
    
    const API_SECRET = process.env.API_SECRET || "duck_shop_secret_2024";
    
    if (secret !== API_SECRET) {
      return res.status(401).json({ 
        success: false, 
        error: "Неавторизовано" 
      });
    }
    
    if (!order_id || !status) {
      return res.status(400).json({ 
        success: false, 
        error: "Не все поля заполнены" 
      });
    }
    
    console.log(`🔄 Обновление статуса заказа ${order_id}: ${status}`);
    
    await db.read();
    
    const orderIndex = db.data.orders.findIndex(o => o.id === order_id);
    
    if (orderIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        error: "Заказ не найден" 
      });
    }
    
    // Обновляем статус
    db.data.orders[orderIndex].status = status;
    db.data.orders[orderIndex].updated_at = new Date().toISOString();
    
    if (admin_comment) {
      db.data.orders[orderIndex].admin_comment = admin_comment;
    }
    
    // Если статус завершен, добавляем дату выполнения
    if (status === "completed") {
      db.data.orders[orderIndex].completed_at = new Date().toISOString();
    }
    
    await db.write();
    
    res.json({ 
      success: true, 
      message: "Статус обновлен",
      order_id,
      status 
    });
    
  } catch (error) {
    console.error("Ошибка обновления статуса:", error);
    res.status(500).json({ 
      success: false,
      error: "Ошибка сервера" 
    });
  }
});

// =========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===========
function calculateCartTotalFromCart(cart) {
  // Реализуйте подсчет суммы из корзины
  // Для примера:
  let total = 0;
  if (cart && typeof cart === 'object') {
    for (const [itemId, quantity] of Object.entries(cart)) {
      // Нужно получить цену товара из базы
      // total += (цена товара) * quantity;
    }
  }
  return total;
}

function calculateOrderTotal(order) {
  // Подсчет суммы заказа
  let total = 0;
  if (order.cart && typeof order.cart === 'object') {
    // Реализуйте подсчет на основе cart и цен товаров
  }
  return total;
}