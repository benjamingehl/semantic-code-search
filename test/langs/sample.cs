namespace Payments
{
    public class Ledger
    {
        private long balance;

        public Ledger()
        {
            balance = 0;
        }

        public void Deposit(long amount)
        {
            balance += amount;
        }
    }

    interface IAccount
    {
        long Balance();
    }
}
