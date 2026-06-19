module Payments
  class Ledger
    def initialize
      @balance = 0
    end

    def deposit(amount)
      @balance += amount
    end
  end
end

def new_ledger
  Payments::Ledger.new
end
