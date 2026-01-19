// keepAlive.js - Предотвращает сон сервера на Render
const http = require('http');

module.exports = function keepAlive() {
  // Создаем простой HTTP сервер для keep-alive
  const server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        service: 'duck-bot-keepalive'
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Запускаем на другом порту
  server.listen(8080, () => {
    console.log('🔧 Keep-alive сервер запущен на порту 8080');
  });

  // Периодические запросы к себе
  setInterval(() => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 10000,
      path: '/keep-alive',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      console.log(`[${new Date().toLocaleTimeString()}] Keep-alive выполнен: ${res.statusCode}`);
    });

    req.on('error', (err) => {
      console.log(`[${new Date().toLocaleTimeString()}] Keep-alive ошибка: ${err.message}`);
    });

    req.end();
  }, 4 * 60 * 1000); // Каждые 4 минуты

  return server;
};
