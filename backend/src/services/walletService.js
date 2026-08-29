const { getClient, query } = require("../config/db");

// The one rule this whole file exists to enforce: wallets.balance is NEVER
// updated by itself. Every change is a wallet_transactions row + a balance
// update, in the same database transaction, so they can never drift apart.
// This is what prevents the classic "my balance doesn't match my history"
// support ticket.

async function getOrCreateWallet(ownerType, ownerId) {
  const existing = await query(
    "SELECT * FROM wallets WHERE owner_type = $1 AND owner_id = $2",
    [ownerType, ownerId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await query(
    `INSERT INTO wallets (owner_type, owner_id) VALUES ($1, $2) RETURNING *`,
    [ownerType, ownerId]
  );
  return created.rows[0];
}

/**
 * Credits or debits a wallet atomically. amountKobo is always positive;
 * `type` sets the direction. Throws if a debit would take balance negative.
 */
async function recordTransaction({ walletId, type, amountKobo, reason, referenceId = null }) {
  if (amountKobo <= 0) throw new Error("amountKobo must be positive");
  if (!["credit", "debit"].includes(type)) throw new Error('type must be "credit" or "debit"');

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const walletResult = await client.query(
      "SELECT * FROM wallets WHERE id = $1 FOR UPDATE", // row lock — prevents race conditions on concurrent transactions
      [walletId]
    );
    if (walletResult.rows.length === 0) throw new Error("Wallet not found");
    const wallet = walletResult.rows[0];

    const delta = type === "credit" ? amountKobo : -amountKobo;
    const newBalance = Number(wallet.balance) + delta;
    if (newBalance < 0) {
      const err = new Error("Insufficient wallet balance");
      err.code = "INSUFFICIENT_BALANCE";
      throw err;
    }

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [walletId, type, amountKobo, reason, referenceId]
    );

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2`,
      [newBalance, walletId]
    );

    await client.query("COMMIT");
    return { ...wallet, balance: newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getBalance(walletId) {
  const result = await query("SELECT balance, pending_balance FROM wallets WHERE id = $1", [walletId]);
  if (result.rows.length === 0) throw new Error("Wallet not found");
  return result.rows[0];
}

async function getTransactionHistory(walletId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT * FROM wallet_transactions WHERE wallet_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [walletId, limit, offset]
  );
  return result.rows;
}

module.exports = { getOrCreateWallet, recordTransaction, getBalance, getTransactionHistory };
