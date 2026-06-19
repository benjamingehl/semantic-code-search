import Foundation

class Ledger {
    var balance: Int = 0

    func deposit(amount: Int) {
        balance += amount
    }
}

func newLedger() -> Ledger {
    return Ledger()
}
