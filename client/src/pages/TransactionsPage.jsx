import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  fetchTransactions,
  addTransaction,
  removeTransaction,
} from "@/api/endpoints";
import { monthName } from "@/lib/utils";
import { staggerContainer, slideInItem, fadeUp } from "@/animations/variants";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "expense",
    date: todayISO(),
  });
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();

  const load = () => {
    fetchTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.category === "income") acc.income += t.amount;
      else acc.expenses += t.amount;
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  const balance = totals.income - totals.expenses;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setSubmitting(true);
    try {
      const created = await addTransaction({
        ...form,
        amount: Number(form.amount),
      });
      // Only show it in the list if it belongs to the current month being viewed.
      const created_d = new Date(created.date);
      if (created_d.getMonth() === now.getMonth() && created_d.getFullYear() === now.getFullYear()) {
        setTransactions((prev) => [created, ...prev]);
      }
      setForm({ description: "", amount: "", category: "expense", date: todayISO() });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    await removeTransaction(id);
    setTransactions((prev) => prev.filter((t) => t._id !== id));
  };

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Transactions</h1>
        <p className="mt-1 text-muted-foreground">
          {monthName(now.getMonth())} {now.getFullYear()}
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Add form + balance */}
        <div className="space-y-6">
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4 text-primary" /> Add transaction
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="e.g. Groceries"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount</Label>
                      <Input
                        id="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        id="category"
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Adding…" : "Add transaction"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-muted-foreground">
                  Remaining balance this month
                </p>
                <p className="mt-1 text-3xl font-extrabold text-primary">
                  <AnimatedNumber value={balance} prefix="$" decimals={2} />
                </p>
                <div className="mt-4 flex gap-4 text-sm">
                  <span className="text-emerald-600">
                    + <AnimatedNumber value={totals.income} prefix="$" decimals={2} /> income
                  </span>
                  <span className="text-rose-500">
                    − <AnimatedNumber value={totals.expenses} prefix="$" decimals={2} /> spent
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Transaction list */}
        <div>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                No transactions yet this month. Add your first one!
              </CardContent>
            </Card>
          ) : (
            <motion.div
              variants={staggerContainer(0.07, 0.05)}
              initial="initial"
              animate="animate"
              className="space-y-3"
            >
              <AnimatePresence initial={false}>
                {transactions.map((t) => (
                  <motion.div
                    key={t._id}
                    variants={slideInItem}
                    layout
                    exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
                  >
                    <Card className="transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3">
                          {t.category === "income" ? (
                            <ArrowUpCircle className="h-9 w-9 text-emerald-500" />
                          ) : (
                            <ArrowDownCircle className="h-9 w-9 text-rose-400" />
                          )}
                          <div>
                            <p className="font-semibold">{t.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              · {t.category}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-bold tabular-nums ${
                              t.category === "income" ? "text-emerald-600" : "text-rose-500"
                            }`}
                          >
                            {t.category === "income" ? "+" : "−"}$
                            {t.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <button
                            onClick={() => handleDelete(t._id)}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
