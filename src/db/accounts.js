import * as SecureStore from 'expo-secure-store';
import { withDb } from './database';

/**
 * Multiple saved GitHub accounts. Each account's token lives in
 * SecureStore under its own unique key (never in this SQLite table,
 * which is not encrypted at rest) - this table only stores metadata:
 * username, an optional label, and which SecureStore key holds its token.
 *
 * The "active" account is still whatever's in the single TOKEN_KEY slot
 * that the rest of the app (github.js, AuthContext) reads from - so
 * "switching accounts" means copying the chosen account's token back
 * into that slot. This keeps every existing screen working unmodified
 * without threading an accountId through the whole app.
 */

function genId() {
  return `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function tokenKeyFor(id) {
  return `gh_pat_token_${id}`;
}

export async function addAccount(username, token, label) {
  const db = await withDb();
  const id = genId();
  const tokenKey = tokenKeyFor(id);
  await SecureStore.setItemAsync(tokenKey, token);
  await db.runAsync(
    `INSERT INTO accounts (id, username, label, token_key, avatar_url, added_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, username, label || null, tokenKey, null, Date.now(), Date.now()]
  );
  return id;
}

export async function listAccounts() {
  const db = await withDb();
  const rows = await db.getAllAsync(`SELECT * FROM accounts ORDER BY last_used_at DESC`);
  return rows.map(mapRow);
}

export async function getAccountToken(accountId) {
  const db = await withDb();
  const row = await db.getFirstAsync(`SELECT token_key FROM accounts WHERE id = ?`, [accountId]);
  if (!row) return null;
  return SecureStore.getItemAsync(row.token_key);
}

export async function touchAccount(accountId) {
  const db = await withDb();
  await db.runAsync(`UPDATE accounts SET last_used_at = ? WHERE id = ?`, [Date.now(), accountId]);
}

export async function removeAccount(accountId) {
  const db = await withDb();
  const row = await db.getFirstAsync(`SELECT token_key FROM accounts WHERE id = ?`, [accountId]);
  if (row) await SecureStore.deleteItemAsync(row.token_key);
  await db.runAsync(`DELETE FROM accounts WHERE id = ?`, [accountId]);
}

export async function updateAccountLabel(accountId, label) {
  const db = await withDb();
  await db.runAsync(`UPDATE accounts SET label = ? WHERE id = ?`, [label, accountId]);
}

function mapRow(row) {
  return {
    id: row.id,
    username: row.username,
    label: row.label,
    tokenKey: row.token_key,
    avatarUrl: row.avatar_url,
    addedAt: row.added_at,
    lastUsedAt: row.last_used_at,
  };
}
