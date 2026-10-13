import { Controller, Get, Inject } from '@nestjs/common';
import {
  DEFAULT_SEARCH_SYNTAX,
  type FontSpec,
  type SessionUser,
  type UiPreferences,
} from '@gglib/shared';
import { sql } from 'kysely';
import { CurrentUser } from '../auth/decorators.js';
import { KYSELY, type Database } from '../db/db.module.js';

/** clsCommon.SetTextboxEvent's default when the user has no UserConfig row. */
const DEFAULT_FONT: FontSpec = {
  family: 'Arial Unicode MS',
  sizePt: 18,
  bold: false,
  italic: false,
};

/** "Arial Unicode MS,12,1" -> family, size in points, FontStyle flags (1 bold, 2 italic). */
export function parseFont(value: string | null | undefined): FontSpec | null {
  const parts = (value ?? '').split(',');
  if (parts.length !== 3) return null;
  const size = Number(parts[1]);
  const style = Number(parts[2]);
  if (!parts[0] || !Number.isFinite(size) || !Number.isFinite(style)) return null;
  return { family: parts[0], sizePt: size, bold: (style & 1) === 1, italic: (style & 2) === 2 };
}

@Controller('me')
export class PreferencesController {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  /** The user's form fonts (UserConfig), and the search syntax defaults (MdlLib). */
  @Get('preferences')
  async preferences(@CurrentUser() user: SessionUser): Promise<UiPreferences> {
    const { rows } = await sql<{ TextBoxFont: string | null; GridViewFont: string | null }>`
      SELECT TOP 1 ISNULL(TextBoxFont, '') AS TextBoxFont, ISNULL(GridViewFont, '') AS GridViewFont
      FROM UserConfig WHERE UserKt = ${user.id}
    `.execute(this.db);
    const row = rows[0];
    return {
      textBoxFont: parseFont(row?.TextBoxFont) ?? DEFAULT_FONT,
      gridFont: parseFont(row?.GridViewFont) ?? DEFAULT_FONT,
      search: DEFAULT_SEARCH_SYNTAX,
    };
  }
}
