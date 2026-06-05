import type { Request, Response } from 'express';

/**
 * Готовит ответ под Server-Sent Events и возвращает функции отправки/закрытия.
 * Сам ставит heartbeat и убирает слушателей при разрыве соединения.
 */
export function openSseStream(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // на случай буферизации прокси
  });
  res.write('retry: 3000\n\n'); // клиент переподключается через 3с

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // heartbeat — комментарий-пинг, чтобы прокси/браузер не рвали соединение
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  const onClose = (cb: () => void) => {
    req.on('close', () => {
      clearInterval(ping);
      cb();
    });
  };

  return { send, onClose };
}
