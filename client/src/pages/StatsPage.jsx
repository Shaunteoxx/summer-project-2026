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
import { fadeUp } from "@/animations/variants";

const SAVED_COLOR = "hsl(152 56% 38%)";
const SPENT_COLOR = "hsl(150 12% 70%)";

export default function StatsPage() {
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
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">All Months</h1>
        <p className="mt-1 text-muted-foreground">
          Savings vs spending across every month you've tracked.
        </p>
      </motion.div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No monthly data yet. Add some transactions to start building your
            history.
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={fadeUp} initial="initial" animate="animate">
          <Card>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(150 18% 90%)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(v) => formatMoney(v)}
                      cursor={{ fill: "hsl(150 20% 95%)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(150 18% 88%)",
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="Saved"
                      fill={SAVED_COLOR}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive
                      animationBegin={200}
                      animationDuration={900}
                    />
                    <Bar
                      dataKey="Spent"
                      fill={SPENT_COLOR}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive
                      animationBegin={400}
                      animationDuration={900}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </PageWrapper>
  );
}
