import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllSummaries } from "@/api/endpoints";
import { monthName, formatMoney } from "@/lib/utils";
import { useChartColors } from "@/hooks/useChartColors";
import { useToast } from "@/hooks/useToast";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

export default function StatsPage() {
  const colors = useChartColors();
  const toast = useToast();
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllMonths, setShowAllMonths] = useState(false);

  const COLLAPSED_COUNT = 3;

  useEffect(() => {
    fetchAllSummaries()
      .then(setSummaries)
      .catch(() => toast.error("Couldn't load your monthly history."))
      .finally(() => setLoading(false));
  }, []);

  const data = summaries.map((s) => ({
    label: `${monthName(s.month).slice(0, 3)} ${String(s.year).slice(2)}`,
    Saved: Math.max(s.totalSaved, 0),
    Spent: s.totalExpenses,
  }));

  // Headline insights across the tracked history.
  const monthsTracked = summaries.length;
  const avgSavingsRate = monthsTracked
    ? Math.round(
        summaries.reduce((acc, s) => acc + (s.percentageSaved ?? 0), 0) /
          monthsTracked
      )
    : 0;

  // Summaries arrive oldest-first; show the breakdown newest-first, collapsed
  // to the most recent few until the user asks to see all months.
  const monthsNewestFirst = [...summaries].reverse();
  const visibleMonths = showAllMonths
    ? monthsNewestFirst
    : monthsNewestFirst.slice(0, COLLAPSED_COUNT);

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">All Months</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Savings vs spending across every month you've tracked.
        </p>
      </motion.div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="p-4">
                <Skeleton className="h-72 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No monthly data yet. Add some transactions to start building your
              history.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Headline insights */}
            <motion.div
              variants={staggerContainer(0.1, 0.05)}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-3"
            >
              <motion.div variants={fadeScaleItem}>
                <Card className="h-full">
                  <CardContent className="p-4">
                    <p className="text-2xl font-extrabold tracking-tight">
                      {monthsTracked}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {monthsTracked === 1 ? "Month tracked" : "Months tracked"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={fadeScaleItem}>
                <Card className="h-full border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <p className="text-2xl font-extrabold tracking-tight text-primary">
                      <AnimatedNumber value={avgSavingsRate} suffix="%" />
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      Avg savings rate
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-4 pl-1">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barGap={4} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke={colors.axis}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={48}
                        stroke={colors.axis}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(v) => formatMoney(v)}
                        cursor={{ fill: colors.cursor }}
                        contentStyle={{
                          borderRadius: 12,
                          border: `1px solid ${colors.tooltipBorder}`,
                          background: colors.tooltipBg,
                          color: colors.tooltipText,
                        }}
                        itemStyle={{ color: colors.tooltipText }}
                        labelStyle={{ color: colors.tooltipText }}
                      />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar
                        dataKey="Saved"
                        fill={colors.saved}
                        radius={[6, 6, 0, 0]}
                        isAnimationActive
                        animationBegin={150}
                        animationDuration={800}
                      />
                      <Bar
                        dataKey="Spent"
                        fill={colors.spent}
                        radius={[6, 6, 0, 0]}
                        isAnimationActive
                        animationBegin={350}
                        animationDuration={800}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Per-month breakdown */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly breakdown
            </h2>
            <Card>
              <CardContent className="p-2">
                <ul>
                  <AnimatePresence initial={false}>
                    {visibleMonths.map((s) => {
                      const positive = s.totalSaved >= 0;
                      return (
                        <motion.li
                          key={`${s.year}-${s.month}`}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {monthName(s.month)} {s.year}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              +{formatMoney(s.totalIncome)} in · −
                              {formatMoney(s.totalExpenses)} out
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`font-bold tabular-nums ${
                                positive ? "text-success" : "text-destructive"
                              }`}
                            >
                              {positive ? "+" : "−"}
                              {formatMoney(Math.abs(s.totalSaved))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.percentageSaved}% saved
                            </p>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>

                {monthsNewestFirst.length > COLLAPSED_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllMonths((v) => !v)}
                    aria-expanded={showAllMonths}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showAllMonths
                      ? "Show less"
                      : `See all ${monthsNewestFirst.length} months`}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        showAllMonths ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </CardContent>
            </Card>
          </motion.div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
