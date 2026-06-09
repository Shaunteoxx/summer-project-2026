import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { BarChart3, PiggyBank, CreditCard } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchSummary } from "@/api/endpoints";
import { monthName, formatMoney } from "@/lib/utils";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

const SAVED_COLOR = "hsl(152 56% 38%)";
const SPENT_COLOR = "hsl(150 12% 70%)";

export default function TrackerPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const month = summary?.month ?? now.getMonth();
  const year = summary?.year ?? now.getFullYear();

  const saved = Math.max(summary?.totalSaved ?? 0, 0);
  const spent = summary?.totalExpenses ?? 0;
  const income = summary?.totalIncome ?? 0;
  const hasData = income > 0 || spent > 0;

  const chartData = [
    { name: "Saved", value: saved },
    { name: "Spent", value: spent },
  ];

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Monthly Tracker</h1>
          <p className="mt-1 text-muted-foreground">
            {monthName(month)} {year}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/stats")} className="gap-2">
          <BarChart3 className="h-4 w-4" /> View All Months
        </Button>
      </motion.div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Donut chart */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 font-semibold">Saved vs Spent</h2>
                {hasData ? (
                  <div className="relative h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                          isAnimationActive
                          animationBegin={300}
                          animationDuration={1100}
                          stroke="none"
                        >
                          <Cell fill={SAVED_COLOR} />
                          <Cell fill={SPENT_COLOR} />
                        </Pie>
                        <Tooltip
                          formatter={(v) => formatMoney(v)}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid hsl(150 18% 88%)",
                          }}
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
                  <div className="flex h-72 items-center justify-center text-center text-muted-foreground">
                    No data yet. Add some income & expenses on the
                    Transactions page.
                  </div>
                )}

                <div className="mt-4 flex justify-center gap-6 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: SAVED_COLOR }} />
                    Saved
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: SPENT_COLOR }} />
                    Spent
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Stat breakdown */}
          <motion.div
            variants={staggerContainer(0.12, 0.2)}
            initial="initial"
            animate="animate"
            className="grid content-start gap-6"
          >
            <BreakdownCard
              icon={PiggyBank}
              label="Total saved"
              amount={summary?.totalSaved ?? 0}
              percent={summary?.percentageSaved ?? 0}
              color="text-primary"
              accent
            />
            <BreakdownCard
              icon={CreditCard}
              label="Total spent"
              amount={summary?.totalExpenses ?? 0}
              percent={summary?.percentageSpent ?? 0}
              color="text-rose-500"
            />
          </motion.div>
        </div>
      )}
    </PageWrapper>
  );
}

function BreakdownCard({ icon: Icon, label, amount, percent, color, accent }) {
  return (
    <motion.div variants={fadeScaleItem}>
      <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <p className={`mt-2 text-3xl font-extrabold ${color}`}>
            <AnimatedNumber value={amount} prefix="$" decimals={2} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <AnimatedNumber value={percent} suffix="%" /> of total income
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
