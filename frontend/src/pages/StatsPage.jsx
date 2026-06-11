import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

export default function StatsPage() {
  const colors = useChartColors();
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllSummaries()
      .then(setSummaries)
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
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
