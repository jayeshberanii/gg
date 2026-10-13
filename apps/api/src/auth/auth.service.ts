import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { sql } from 'kysely';
import { timingSafeEqual } from 'node:crypto';
import type { AttendanceUser } from '../attendance/attendance.service.js';
import { KYSELY, type Database } from '../db/db.module.js';
import type { Executor } from '../db/legacy-sql.js';
import { decodeLegacyPassword, encodeLegacyPassword } from './legacy-password.js';

type UserRow = {
  tid: number;
  uname: string;
  pwd: Buffer | null;
  uadd: boolean | null;
  umodify: boolean | null;
  udel: boolean | null;
  uview: boolean | null;
  IsAdmin: boolean;
  UserTypekt: number;
};

const USER_COLUMNS = sql`tid, uname, CONVERT(varbinary(100), upwd) AS pwd, uadd, umodify, udel, uview,
  CAST(ISNULL(IsAdmin, 0) AS bit) AS IsAdmin, ISNULL(UserTypekt, 0) AS UserTypekt`;

/** Credential check of frmlogin.vb `Login()`, against the desktop's own Usecurity table. */
@Injectable()
export class AuthService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  /**
   * The desktop matches `uname` and the encoded password in SQL (case-insensitive collation),
   * then requires both to match exactly. The two failure messages are the desktop's own.
   */
  async verifyCredentials(
    username: string,
    password: string,
    db: Executor = this.db,
  ): Promise<AttendanceUser> {
    if (username.trim() === '') throw new BadRequestException('Please Enter User Name');
    const plain = password.trim();
    if (plain === '') throw new BadRequestException('Please Enter Password');

    const { rows } = await sql<UserRow>`
      SELECT ${USER_COLUMNS} FROM Usecurity WHERE ISNULL(IsActive, 0) = 1 AND uname = ${username}
    `.execute(db);

    const loose = rows.filter(
      (r) => r.pwd && decodeLegacyPassword(r.pwd).toLowerCase() === plain.toLowerCase(),
    );
    if (loose.length === 0) {
      throw new UnauthorizedException('Please Enter Current Username And Password');
    }
    const expected = encodeLegacyPassword(plain);
    const exact = loose.find(
      (r) =>
        r.uname === username &&
        r.pwd!.length === expected.length &&
        timingSafeEqual(r.pwd!, expected),
    );
    if (!exact) throw new UnauthorizedException('Invalid User Name Or Password');
    return toAttendanceUser(exact);
  }

  /** An active user by id, for the login-ticket step. */
  async activeUser(id: number, db: Executor = this.db): Promise<AttendanceUser | null> {
    const { rows } = await sql<UserRow>`
      SELECT ${USER_COLUMNS} FROM Usecurity WHERE ISNULL(IsActive, 0) = 1 AND tid = ${id}
    `.execute(db);
    return rows[0] ? toAttendanceUser(rows[0]) : null;
  }
}

function toAttendanceUser(r: UserRow): AttendanceUser {
  return {
    id: r.tid,
    username: r.uname,
    isAdmin: Boolean(r.IsAdmin),
    userType: r.UserTypekt,
    rights: {
      add: Boolean(r.uadd),
      modify: Boolean(r.umodify),
      delete: Boolean(r.udel),
      view: Boolean(r.uview),
    },
  };
}
