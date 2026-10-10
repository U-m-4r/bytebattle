/**
 * Factory that returns Express middleware to validate req.body against a Zod schema.
 * On failure, forwards the ZodError to the global error handler via next(err).
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(result.error); // ZodError — handled by globalErrorHandler
    }
    req.body = result.data; // replace with parsed/coerced data
    next();
  };
}

module.exports = { validate };
