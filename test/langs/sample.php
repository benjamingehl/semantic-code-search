<?php

class Ledger
{
    private int $balance = 0;

    public function deposit(int $amount): void
    {
        $this->balance += $amount;
    }
}

function newLedger(): Ledger
{
    return new Ledger();
}
