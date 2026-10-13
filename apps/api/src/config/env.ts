import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  /** HMAC key for session and login tokens. At least 32 characters. */
  JWT_SECRET: z.string().min(32),
  SESSION_HOURS: z.coerce.number().positive().default(12),
  /**
   * The desktop's Security dialog (InputBoxProc / frmDeleteList) accepts either of two
   * passwords for Delete and Lock/Unlock. Kept only here, never in code or the web bundle.
   */
  SECURITY_PASSWORD: z.string().optional(),
  SECURITY_PASSWORD_ALT: z.string().optional(),
  /**
   * Author Master's "Lock Author" / "Unlock Author" (LockUnlockByAdmin) asks for its own
   * password instead of the first Security one; the second Security password still works there.
   */
  AUTHOR_LOCK_PASSWORD: z.string().optional(),
  /** Kruti Master's "Lock By Admin" / "Unlock By Admin" (LockByAdmin) password, likewise. */
  KRUTI_LOCK_PASSWORD: z.string().optional(),
  /**
   * Issue Master's "Replace LibNo For Selected Records" (InputBoxProc("vis123")): its own first
   * password; the second Security password still works there.
   */
  ISSUE_REPLACE_PASSWORD: z.string().optional(),
  /**
   * Graphics Master's Ctrl+L / Ctrl+U (InputBoxProc("vis123"), which also locks the record's
   * Graphics Detail rows) and Graphics Detail's Delete › File Path: their own first password;
   * the second Security password still works there.
   */
  GRAPHICS_LOCK_PASSWORD: z.string().optional(),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: bool.default(false),
  DB_TRUST_SERVER_CERTIFICATE: bool.default(true),
});

export type Env = z.infer<typeof envSchema>;

/** Parses the environment once at boot. A missing or malformed variable stops the process. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
