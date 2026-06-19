package payments

class Ledger {
    var balance: Long = 0

    fun deposit(amount: Long) {
        balance += amount
    }
}

fun newLedger(): Ledger {
    return Ledger()
}
