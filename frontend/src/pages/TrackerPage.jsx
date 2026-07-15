import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3, PiggyBank, CreditCard } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import DailySpendingCard from "@/components/DailySpendingCard";
import SavingsGoalCard from "@/components/SavingsGoalCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSummary, fetchTransactions, fetchStreak } from "@/api/endpoints";
import { monthName, formatMoney, localToday } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { useChartColors } from "@/hooks/useChartColors";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

const OTHER_COLOR = "#94A3B8";

export default function TrackerPage() {
  const navigate = useNavigate();
  const colors = useChartColors();
  const { user } = useAuth();
  const { getCategory } = useCategories();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  // The streak supplies each day's rolling budget; if it fails the daily views
  // simply fall back to plain bars, so don't let it break the page.
  const load = useCallback(
    () =>
      Promise.all([
        fetchSummary(),
        fetchTransactions(),
        fetchStreak(localToday()).catch(() => null),
      ]).then(([s, txns, st]) => {
        setSummary(s);
        setTransactions(txns);
        setStreak(st);
      }),
    []
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const now = new Date();
  const month = summary?.month ?? now.getMonth();
  const year = summary?.year ?? now.getFullYear();

  const saved = Math.max(summary?.totalSaved ?? 0, 0);
  const spent = summary?.totalExpenses ?? 0;
  const income = summary?.totalIncome ?? 0;
  const hasData = income > 0 || spent > 0;
  const monthlySavings = Math.max(
    0,
    Number(user?.savingsByMonth?.[`${year}-${month}`]) || 0
  );

  const chartData = [
    { name: "Saved", value: saved },
    { name: "Spent", value: spent },
  ];

  // Expenses grouped by category, largest first. Keep the donut to <=6 slices
  // (top 5 + a neutral "Other") so it stays readable as categories grow.
  const byCategory = (() => {
    const map = new Map();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    let arr = [...map.entries()]
      .map(([name, value]) => ({ name, value, color: getCategory(name).color }))
      .sort((a, b) => b.value - a.value);
    if (arr.length > 6) {
      const other = arr.slice(5).reduce((s, x) => s + x.value, 0);
      arr = [...arr.slice(0, 5), { name: "Other", value: other, color: OTHER_COLOR }];
    }
    return arr;
  })();

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">Monthly Tracker</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {monthName(month)} {year}
        </p>
      </motion.div>

      {loading ? (
        <div className="mt-5 space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center p-5">
              <Skeleton className="h-5 w-32 self-start" />
              <Skeleton className="mt-5 h-44 w-44 rounded-full" />
              <div className="mt-5 flex gap-6">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="mt-4 h-52 w-full rounded-xl" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Donut chart */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-2 font-semibold">Saved vs Spent</h2>
                {hasData ? (
                  <div className="relative h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={104}
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                          isAnimationActive
                          animationBegin={250}
                          animationDuration={1000}
                          stroke="none"
                        >
                          <Cell fill={colors.saved} />
                          <Cell fill={colors.spent} />
                        </Pie>
                        <Tooltip
                          formatter={(v) => formatMoney(v)}
                          wrapperStyle={{ zIndex: 10 }}
                          contentStyle={{
                            borderRadius: 12,
                            border: `1px solid ${colors.tooltipBorder}`,
                            background: colors.tooltipBg,
                            color: colors.tooltipText,
                          }}
                          itemStyle={{ color: colors.tooltipText }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-muted-foreground">Income</span>
                      <span className="text-2xl font-extrabold">
                        <AnimatedNumber value={income} prefix="$" decimals={2} />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    No data yet. Add some income & expenses on the Transactions
                    page.
                  </div>
                )}

                <div className="mt-3 flex justify-center gap-6 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: colors.saved }}
                    />
                    Saved
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: colors.spent }}
                    />
                    Spent
                  </span>
                </div>
                {monthlySavings > 0 && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Goal: set aside {formatMoney(monthlySavings)} this month
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Savings goal */}
          <SavingsGoalCard
            target={monthlySavings}
            income={income}
            spent={spent}
            month={month}
            year={year}
            onUpdated={load}
          />

          {/* Daily spending tracker */}
          <DailySpendingCard
            transactions={transactions}
            income={income}
            monthDays={streak?.monthDays ?? []}
            todayBudget={streak?.today?.budget ?? 0}
          />

          {/* Spending by category */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-2 font-semibold">Spending by category</h2>
                {byCategory.length > 0 ? (
                  <>
                    <div className="relative h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={byCategory}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={92}
                            paddingAngle={2}
                            startAngle={90}
                            endAngle={-270}
                            isAnimationActive
                            animationBegin={250}
                            animationDuration={1000}
                            stroke="none"
                          >
                            {byCategory.map((c) => (
                              <Cell key={c.name} fill={c.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v) => formatMoney(v)}
                            wrapperStyle={{ zIndex: 10 }}
                            contentStyle={{
                              borderRadius: 12,
                              border: `1px solid ${colors.tooltipBorder}`,
                              background: colors.tooltipBg,
                              color: colors.tooltipText,
                            }}
                            itemStyle={{ color: colors.tooltipText }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs text-muted-foreground">Spent</span>
                        <span className="text-2xl font-extrabold">
                          <AnimatedNumber value={spent} prefix="$" decimals={2} />
                        </span>
                      </div>
                    </div>

                    {/* Legend with amounts */}
                    <div className="mt-4 space-y-2.5">
                      {byCategory.map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ background: c.color }}
                            />
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold tabular-nums">
                              {formatMoney(c.value)}
                            </span>
                            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                              {spent > 0 ? Math.round((c.value / spent) * 100) : 0}%
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    No expenses yet this month. Add some on the Transactions page.
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Breakdown */}
          <motion.div
            variants={staggerContainer(0.1, 0.15)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 gap-3"
          >
            <BreakdownCard
              icon={PiggyBank}
              label="Total saved"
              amount={summary?.totalSaved ?? 0}
              percent={summary?.percentageSaved ?? 0}
              color="text-success"
              accent
            />
            <BreakdownCard
              icon={CreditCard}
              label="Total spent"
              amount={summary?.totalExpenses ?? 0}
              percent={summary?.percentageSpent ?? 0}
              color="text-destructive"
            />
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Button
              variant="outline"
              onClick={() => navigate("/stats")}
              className="w-full gap-2"
            >
              <BarChart3 className="h-4 w-4" /> View all months
            </Button>
          </motion.div>
        </div>
      )}
    </PageWrapper>
  );
}

function BreakdownCard({ icon: Icon, label, amount, percent, color, accent }) {
  return (
    <motion.div variants={fadeScaleItem}>
      <Card className={`h-full ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className={`h-[18px] w-[18px] ${color}`} />
            </span>
          </div>
          <p className={`mt-3 text-xl font-extrabold ${color}`}>
            <AnimatedNumber value={amount} prefix="$" decimals={2} />
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <AnimatedNumber value={percent} suffix="%" /> of income
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
