/**
 * Inventory ledger — DEMO-MODE stock mutations (STEP 5, part A).
 *
 * The catalog's PUBLIC reads (src/lib/data.ts) show a variant's `stockQuantity`.
 * This module is the only thing that CHANGES it, and only in demo mode: while no
 * Supabase project is connected the "database" is this process, so the order
 * engine needs the same guarantee PostgreSQL gives it via
 * `public.create_order_with_items()` (supabase/migrations/0004_orders.sql):
 *
 *   • stock is decremented ONLY through a guarded, all-or-nothing operation —
 *     `decrementStock()` applies every line or none of it, and never lets a
 *     quantity go below zero;
 *   • an unknown variant or an insufficient quantity throws `InventoryError`,
 *     which is exactly the shape of the DB's RAISE (the caller rolls the whole
 *     order back — no order row survives a failed reservation);
 *   • seeding mirrors `public.variants`: one entry per colour/size row of every
 *     demo product (including INACTIVE ones, which exist in the table too —
 *     they are simply never sellable, so the engine refuses them earlier).
 *
 * WHEN A SUPABASE PROJECT IS CONNECTED this ledger is NOT used: the DB function
 * below is the single writer of `variants.stock_quantity`, and src/lib/orders.ts
 * routes to it. Nothing here is ever mixed with real rows (same rule as
 * data.ts).
 *
 * SSR-safe: a plain in-memory Map, no `window` access at import time. It lives
 * per process, which is the honest meaning of "demo mode": a server restart
 * resets demo stock to the fixture values.
 */

import { DEMO_PRODUCTS } from "~/lib/demo-data";

/* ── Errors ────────────────────────────────────────────────────────────────── */

/** Why a stock mutation was refused. Mirrors the DB function's `hint` values. */
export type InventoryErrorReason = "unknown-variant" | "insufficient-stock";

/** Thrown by a ledger mutation that would be illegal. Callers must roll back. */
export class InventoryError extends Error {
  readonly reason: InventoryErrorReason;
  readonly variantId: string;
  /** Units actually on hand (null when the variant is unknown). */
  readonly available: number | null;
  /** Units that were requested. */
  readonly requested: number;

  constructor(
    reason: InventoryErrorReason,
    variantId: string,
    requested: number,
    available: number | null
  ) {
    super(
      reason === "unknown-variant"
        ? `inventory: unknown variant ${variantId}`
        : `inventory: insufficient stock for ${variantId} (requested ${requested}, available ${available ?? 0})`
    );
    this.name = "InventoryError";
    this.reason = reason;
    this.variantId = variantId;
    this.available = available;
    this.requested = requested;
  }
}

/* ── Ledger ────────────────────────────────────────────────────────────────── */

/** One stock movement: `quantity` units of one variant. */
export interface StockChange {
  variantId: string;
  quantity: number;
}

/**
 * Minimal stock contract. Swap in a Supabase-backed implementation
 * (or an RPC wrapper) without touching the order engine.
 */
export interface StockLedger {
  /** Units on hand, or null when the ledger has no such variant. */
  get(variantId: string): number | null;
  /** Remove `quantity` units; throws `InventoryError` when that is impossible. */
  decrement(variantId: string, quantity: number): void;
  /** Put `quantity` units back (compensation for a rolled-back order). */
  restore(variantId: string, quantity: number): void;
  /** Add/replace entries (tests, fixtures). */
  seed(entries: Iterable<readonly [string, number]>): void;
  /** Drop everything (tests). */
  reset(): void;
}

/** A whole number of units, never below 1. */
function toUnits(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

/** In-memory ledger, optionally pre-seeded with `[variantId, stock]` entries. */
export function createStockLedger(
  entries?: Iterable<readonly [string, number]>
): StockLedger {
  const stock = new Map<string, number>();
  const ledger: StockLedger = {
    get(variantId) {
      const value = stock.get(variantId);
      return value === undefined ? null : value;
    },
    decrement(variantId, quantity) {
      const units = toUnits(quantity);
      const available = stock.get(variantId);
      if (available === undefined) {
        throw new InventoryError("unknown-variant", variantId, units, null);
      }
      if (available < units) {
        throw new InventoryError("insufficient-stock", variantId, units, available);
      }
      stock.set(variantId, available - units);
    },
    restore(variantId, quantity) {
      const units = toUnits(quantity);
      stock.set(variantId, (stock.get(variantId) ?? 0) + units);
    },
    seed(entriesToSeed) {
      for (const [variantId, quantity] of entriesToSeed) {
        stock.set(variantId, Math.max(0, Math.floor(Number(quantity)) || 0));
      }
    },
    reset() {
      stock.clear();
    },
  };
  if (entries) ledger.seed(entries);
  return ledger;
}

/**
 * Demo ledger seeded from the demo fixtures — one entry per variant row of every
 * demo product, ACTIVE or not (the DB table holds inactive rows too; they are
 * just never sellable, which the engine enforces before it touches stock).
 */
export function createDemoStockLedger(): StockLedger {
  const entries: Array<readonly [string, number]> = [];
  for (const product of DEMO_PRODUCTS) {
    for (const variant of product.variants) {
      entries.push([variant.id, variant.stockQuantity] as const);
    }
  }
  return createStockLedger(entries);
}

/** The process-wide demo ledger the order engine uses while Supabase is absent. */
export const demoInventory: StockLedger = createDemoStockLedger();

/* ── All-or-nothing mutations ──────────────────────────────────────────────── */

/**
 * Apply every change or none of them. Mutations are applied one by one; if ANY
 * of them throws, the ones already applied are compensated in reverse order and
 * the error is re-thrown — the caller's transaction-in-progress is then refused
 * as a whole (this is the demo-mode equivalent of the DB function's RAISE
 * rolling back the entire order: no order row, no partial stock change).
 */
export function applyStockChanges(
  changes: StockChange[],
  ledger: StockLedger = demoInventory
): void {
  const applied: StockChange[] = [];
  try {
    for (const change of changes) {
      ledger.decrement(change.variantId, change.quantity);
      applied.push(change);
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      ledger.restore(change.variantId, change.quantity);
    }
    throw error;
  }
}

/** Remove `quantity` units per variant, atomically. Throws `InventoryError`. */
export function decrementStock(
  changes: StockChange[],
  ledger: StockLedger = demoInventory
): void {
  applyStockChanges(changes, ledger);
}

/**
 * Put the units of an order back — used when a later step of the same order
 * failed (e.g. persistence) and the reservation must be undone. Compensating a
 * previously applied decrement is enough: the decrements were committed first.
 */
export function restoreStock(
  changes: StockChange[],
  ledger: StockLedger = demoInventory
): void {
  for (const change of changes) ledger.restore(change.variantId, change.quantity);
}

/** Units on hand for a variant (null when the ledger does not know it). */
export function availableStock(
  variantId: string,
  ledger: StockLedger = demoInventory
): number | null {
  return ledger.get(variantId);
}
