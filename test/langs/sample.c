#include <stdio.h>

struct Ledger {
    long balance;
};

long deposit(struct Ledger *ledger, long amount) {
    ledger->balance += amount;
    return ledger->balance;
}

int main(void) {
    struct Ledger ledger = {0};
    deposit(&ledger, 100);
    return 0;
}
