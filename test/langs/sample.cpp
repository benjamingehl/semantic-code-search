#include <iostream>

class Ledger {
public:
    long balance = 0;
    void deposit(long amount);
};

void Ledger::deposit(long amount) {
    balance += amount;
}

int main() {
    Ledger ledger;
    ledger.deposit(100);
    return 0;
}
