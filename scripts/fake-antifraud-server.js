const http = require('node:http');

const port = Number(process.env.ANTIFRAUD_PORT || 4000);
let received = 0;

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhooks/antifraud') {
      req.resume();
      req.on('end', () => {
        received += 1;
        res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'received', received }));
      });
      return;
    }
    res.writeHead(404).end();
  })
  .listen(port, () => console.info(`Anti-fraude fictício ouvindo em http://localhost:${port}/webhooks/antifraud`));
