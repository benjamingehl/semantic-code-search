package payments;

public class Ledger {
    private long balance;

    public Ledger() {
        this.balance = 0;
    }

    public void deposit(long amount) {
        this.balance += amount;
    }
}

interface Account {
    long balance();
}
