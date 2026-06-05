import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Оборачивает async-обработчик, чтобы отклонённый промис уходил в error-middleware.
 * (Express 4 сам async-ошибки не ловит.)
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
