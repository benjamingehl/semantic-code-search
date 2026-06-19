struct Ledger {
    balance: i64,
}

enum Currency {
    Usd,
    Eur,
}

trait Account {
    fn balance(&self) -> i64;
}

impl Ledger {
    fn deposit(&mut self, amount: i64) {
        self.balance += amount;
    }
}

fn new_ledger() -> Ledger {
    Ledger { balance: 0 }
}
