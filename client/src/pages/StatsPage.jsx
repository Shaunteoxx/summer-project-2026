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
import { Card, CardContent } from "@/components/ui/card";
import { fetchAllSummaries } from "@/api/endpoints";
import { monthName, formatMoney } from "@/lib/utils";
import { useChartColors } from "@/hooks/useChartColors";
import { fadeUp } from "@/animations/variants";

export default function StatsPage() {
  const colors = useChartColors();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllSummaries()
      .then((summaries) =>
        setData(
          summaries.map((s) => ({
            label: `${monthName(s.month).slice(0, 3)} ${String(s.year).slice(2)}`,
            Saved: Math.max(s.totalSaved, 0),
            Spent: s.totalExpenses,
          }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

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
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No monthly data yet. Add some transactions to start building your
              history.
            </CardContent>
          </Card>
        ) : (
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
        )}
      </div>
    </PageWrapper>
  );
}
