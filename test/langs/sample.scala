package payments

class Ledger {
  private var balance: Long = 0

  def deposit(amount: Long): Unit = {
    balance += amount
  }
}

object Payments {
  def newLedger(): Ledger = new Ledger()
}
