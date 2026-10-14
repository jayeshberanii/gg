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
  /**
   * LabIssueMRepository.GetUserNotReturnedBook: nobody gets a new lab issue while they hold books
   * delivered more than 30 days ago ("You Cannot Issue any Books …"). Desktop v3.4.3.1 switched
   * the check off ("Temporary Comment"), so it is off unless this is `true`.
   */
  LAB_ISSUE_OLD_DUE_BLOCK: bool.default(false),
  /**
   * frmAttachments: the folder the desktop saves attachments under, as the desktop computers
   * reach it. It is what goes into Attachments.FilePath, so the desktop can open a file the web
   * saved. (Desktop v3.4.3.1 reads it from GeneralConfig's AttachmentPath instead.)
   */
  ATTACHMENT_SHARE: z.string().min(1).default('\\\\192.168.0.210\\Attachments\\Production'),
  /**
   * The same folder as this server reaches it (the share mounted, or the folder itself when this
   * machine hosts the share). Without it attachments are listed but cannot be opened or changed.
   */
  ATTACHMENT_DIR: z.string().min(1).optional(),
  /**
   * The desktop's file folders (scanpath.txt beside the EXE, MdlLib's ReferenceTPath / MainRoot,
   * Graphics Detail's d:\\tempgr; GeneralConfig from v3.4.3.1). `*_PATH` is the folder as the
   * desktop computers name it, which is what the database stores and the lists show; `*_DIR` is
   * the same folder as this server reaches it. LIBRARY_FILES_DIR is a parent folder for the ones
   * with no `*_DIR` of their own (each under its `*_PATH`'s last part). A folder with neither is
   * "not configured": its menu items say so.
   */
  LIBRARY_FILES_DIR: z.string().min(1).optional(),
  SCAN_PATH: z.string().min(1).default('\\\\192.168.0.50\\ScanData'),
  SCAN_DIR: z.string().min(1).optional(),
  EBOOK_PATH: z.string().min(1).default('\\\\192.168.0.50\\B2 Ebook'),
  EBOOK_DIR: z.string().min(1).optional(),
  TITLE_PATH: z.string().min(1).default('\\\\192.168.0.50\\ScanTitle'),
  TITLE_DIR: z.string().min(1).optional(),
  GRAPHICS_PATH: z.string().min(1).default('\\\\192.168.0.50\\Graphics'),
  GRAPHICS_DIR: z.string().min(1).optional(),
  REFERENCET_PATH: z.string().min(1).default('F:\\scantesting'),
  REFERENCET_DIR: z.string().min(1).optional(),
  MAIN_ROOT_PATH: z.string().min(1).default('I:\\LibraryImages'),
  MAIN_ROOT_DIR: z.string().min(1).optional(),
  /**
   * The drive Graphics Detail's pictures are on: graphicbkt.filepath is `Y:\\<LibNo>\\<file>`
   * (frmGraphicsDetail.updateFilePath's hard-coded "Y:\\"), whatever share the desktops map Y: to.
   */
  GRAPHICS_DRIVE_PATH: z.string().min(1).default('Y:'),
  GRAPHICS_DRIVE_DIR: z.string().min(1).optional(),
  TEMPGR_PATH: z.string().min(1).default('d:\\tempgr'),
  TEMPGR_DIR: z.string().min(1).optional(),
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
