package payments

import "fmt"

type Ledger struct {
	balance int
}

func NewLedger() *Ledger {
	return &Ledger{balance: 0}
}

func (l *Ledger) Deposit(amount int) {
	l.balance += amount
	fmt.Println("deposited", amount)
}
