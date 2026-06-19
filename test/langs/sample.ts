export interface Account {
  balance(): number;
}

export enum Currency {
  Usd,
  Eur,
}

export const newLedger = (): Account => ({ balance: () => 0 });
