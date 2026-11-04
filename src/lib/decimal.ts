import Decimal from 'decimal.js';

// Configure Decimal.js for high precision financial and weight calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type NumericInput = string | number | Decimal;

export function D(val: NumericInput | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') {
    return new Decimal(0);
  }
  return new Decimal(val);
}

/**
 * Format weight to 4 decimal places for DB storage (kg)
 */
export function toWeightDb(val: NumericInput): string {
  return D(val).toFixed(4);
}

/**
 * Format rate/currency to 4 decimal places for DB storage
 */
export function toMoneyDb(val: NumericInput): string {
  return D(val).toFixed(4);
}

/**
 * Format percentage to 3 decimal places
 */
export function toPctDb(val: NumericInput): string {
  return D(val).toFixed(3);
}

/**
 * Human-readable weight formatting (e.g., "2,450.50 kg")
 */
export function formatKg(val: NumericInput | null | undefined, decimals = 2): string {
  const d = D(val);
  return `${Number(d.toFixed(decimals)).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kg`;
}

/**
 * Human-readable INR/Currency formatting (e.g., "₹842.50")
 */
export function formatCurrency(
  val: NumericInput | null | undefined,
  currency = 'INR',
  decimals = 2
): string {
  const d = D(val);
  const symbol = currency === 'USD' ? '$' : '₹';
  return `${symbol}${Number(d.toFixed(decimals)).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Compute Net Weight = Gross Weight - Tare Weight safely
 */
export function calcNetWeight(grossKg: NumericInput, tareKg: NumericInput): Decimal {
  return D(grossKg).minus(D(tareKg));
}

/**
 * Compute Material Reconciliation for RBD / Downstream Processing
 * Input copper weight = usable output + recoverable scrap + other recorded outputs + process loss + unexplained diff
 */
export interface ReconciliationResult {
  totalInputKg: Decimal;
  usableOutputKg: Decimal;
  scrapKg: Decimal;
  recoverableWasteKg: Decimal;
  processLossKg: Decimal;
  totalAccountedKg: Decimal;
  unexplainedDiffKg: Decimal;
  exceedsInput: boolean;
  isReconciled: boolean;
  yieldPct: Decimal;
  actualWastagePct: Decimal;
}

export function reconcileWeights(params: {
  totalInputKg: NumericInput;
  usableOutputKg: NumericInput;
  scrapKg: NumericInput;
  recoverableWasteKg?: NumericInput;
  processLossKg: NumericInput;
}): ReconciliationResult {
  const totalInputKg = D(params.totalInputKg);
  const usableOutputKg = D(params.usableOutputKg);
  const scrapKg = D(params.scrapKg);
  const recoverableWasteKg = D(params.recoverableWasteKg ?? 0);
  const processLossKg = D(params.processLossKg);

  const totalAccountedKg = usableOutputKg
    .plus(scrapKg)
    .plus(recoverableWasteKg)
    .plus(processLossKg);

  const unexplainedDiffKg = totalInputKg.minus(totalAccountedKg);

  // Tolerance of 0.0001 kg for exact decimal comparisons
  const exceedsInput = unexplainedDiffKg.lessThan(new Decimal('-0.0001'));
  const isReconciled = unexplainedDiffKg.abs().lessThanOrEqualTo(new Decimal('0.0001'));

  const yieldPct = totalInputKg.greaterThan(0)
    ? usableOutputKg.dividedBy(totalInputKg).times(100)
    : new Decimal(0);

  const actualWastagePct = totalInputKg.greaterThan(0)
    ? scrapKg.plus(recoverableWasteKg).plus(processLossKg).dividedBy(totalInputKg).times(100)
    : new Decimal(0);

  return {
    totalInputKg,
    usableOutputKg,
    scrapKg,
    recoverableWasteKg,
    processLossKg,
    totalAccountedKg,
    unexplainedDiffKg,
    exceedsInput,
    isReconciled,
    yieldPct,
    actualWastagePct,
  };
}

