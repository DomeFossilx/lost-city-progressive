/**
 * BotDatabase.ts
 *
 * Ensures each bot has a row in the `account` table so that LoginServer can
 * find the account during the normal player_logout flow and call
 * updateHiscores() for it.
 *
 * Hiscore writes are handled entirely by LoginServer.ts on logout — no custom
 * DB code is needed here.
 */

import { db, toDbDate } from '#/db/query.js';

/**
 * Returns the account_id for the given bot username.
 * Creates a new account row if one does not already exist.
 *
 * Uses INSERT OR IGNORE so the call is safe to make on every server start —
 * if the row already exists it is left unchanged and the SELECT returns the
 * existing id.
 *
 * Bot accounts use `!bot` as their password — this string is intentionally
 * NOT a valid bcrypt hash so no client can ever authenticate as a bot through
 * the normal login flow.
 *
 * Returns null if the database is unavailable or the operation fails.
 */
export async function ensureBotAccount(username: string): Promise<number | null> {
    try {
        await db
            .insertInto('account')
            .orIgnore()
            .values({
                username,
                password:          '!bot',
                registration_ip:   '127.0.0.1',
                registration_date: toDbDate(new Date()),
                staffmodlevel:     0,  // 0 = normal player → appears on hiscores
            })
            .execute();

        const row = await db
            .selectFrom('account')
            .select('id')
            .where('username', '=', username)
            .executeTakeFirst();

        if (!row) {
            console.error(`[BotDatabase] Could not find/create account for bot "${username}"`);
            return null;
        }

        return row.id;

    } catch (err) {
        console.error(`[BotDatabase] ensureBotAccount("${username}") failed:`, err);
        return null;
    }
}
