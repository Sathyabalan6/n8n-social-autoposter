const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email({ message: 'Valid email address is required' }).max(255),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' })
});

const registerSchema = z.object({
  email: z.string().email({ message: 'Valid email address is required' }).max(255),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(128),
  name: z.string().min(1, { message: 'Name is required' }).max(100),
  role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']).default('EDITOR'),
  client_id: z.number().int().positive().default(1)
});

const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(100),
  color_code: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be valid hex color (e.g. #3B82F6)').default('#3B82F6')
});

const createAccountSchema = z.object({
  platform: z.enum(['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook']),
  account_name: z.string().min(1, 'Account name is required').max(100),
  account_handle: z.string().max(100).optional().default(''),
  tokens: z.record(z.string(), z.any()).optional().default({})
});

const reschedulePostSchema = z.object({
  scheduled_at: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'Must be a valid ISO 8601 date string'
  })
});

const queueRuleSchema = z.object({
  timezone: z.string().max(50).default('UTC'),
  iso_weekday: z.number().int().min(1).max(7),
  local_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be HH:mm 24-hour format')
});

const replyInboxSchema = z.object({
  reply_text: z.string().min(1, 'Reply text is required').max(5000),
  client_id: z.number().int().positive().optional()
});

module.exports = {
  loginSchema,
  registerSchema,
  createClientSchema,
  createAccountSchema,
  reschedulePostSchema,
  queueRuleSchema,
  replyInboxSchema
};
