const { ZodError } = require('zod');
const { AppError } = require('../errors');

// Last middleware: turns every error into one consistent JSON shape.
// { error: { code, message, details? } }
function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid.',
          details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
    }
    if (process.env.NODE_ENV !== 'test') console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  };
}

module.exports = { errorHandler };
