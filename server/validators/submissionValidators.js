const { z } = require('zod');

const submitSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.enum(['javascript']),
  problemSlug: z.string().min(1),
});

module.exports = { submitSchema };
