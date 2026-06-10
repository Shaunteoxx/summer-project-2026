import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calculator,
  PieChart,
  Receipt,
  PiggyBank,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHomeStats } from "@/api/endpoints";
import { monthName } from "@/lib/utils";
import { staggerContainer, fadeUp, fadeScaleItem } from "@/animations/variants";

const quickActions = [
  {
    to: "/transactions",
    label: "Add transaction",
    desc: "Log income or an expense",
    icon: Receipt,
  },
  {
    to: "/calculator",
    label: "Daily budget",
    desc: "What can I spend today?",
    icon: Calculator,
  },
  {
    to: "/tracker",
    label: "This month",
    desc: "Saved vs spent",
    icon: PieChart,
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchHomeStats().then(setStats).catch(() => setStats(null));
  }, []);

  const now = new Date();
  const month = stats ? stats.month : now.getMonth();
  const year = stats ? stats.year : now.getFullYear();

  return (
    <PageWrapper>
      {/* Greeting */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <p className="text-sm font-medium text-primary">
          {monthName(month)} {year}
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
          Welcome back{stats ? `, ${stats.username}` : ""}
        </h1>
      </motion.div>

      {/* Hero: left to spend */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-5"
      >
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <CardContent className="relative p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Left to spend this month
            </p>
            <p className="mt-1 text-[2.75rem] font-extrabold leading-tight tracking-tight text-foreground">
              <AnimatedNumber
                value={stats?.leftToSpend ?? 0}
                prefix="$"
                decimals={2}
              />
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <TrendingUp className="h-4 w-4" />
                <AnimatedNumber
                  value={stats?.monthIncome ?? 0}
                  prefix="$"
                  decimals={2}
                />
                <span className="text-muted-foreground">in</span>
              </span>
              <span className="flex items-center gap-1.5 text-destructive">
                <Receipt className="h-4 w-4" />
                <AnimatedNumber
                  value={stats?.monthExpenses ?? 0}
                  prefix="$"
                  decimals={2}
                />
                <span className="text-muted-foreground">out</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Secondary stats */}
      <motion.div
        variants={staggerContainer(0.1, 0.2)}
        initial="initial"
        animate="animate"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        <StatCard
          icon={PiggyBank}
          label="Total saved"
          value={stats?.totalSavings ?? 0}
          prefix="$"
          decimals={2}
        />
        <StatCard
          icon={TrendingUp}
          label="Saved this month"
          value={stats?.percentageSaved ?? 0}
          suffix="%"
          decimals={0}
        />
      </motion.div>

      {/* Quick actions */}
      <motion.div
        variants={staggerContainer(0.08, 0.35)}
        initial="initial"
        animate="animate"
        className="mt-8"
      >
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="space-y-3">
          {quickActions.map(({ to, label, desc, icon: Icon }) => (
            <motion.button
              key={to}
              variants={fadeScaleItem}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(to)}
              className="flex w-full items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </PageWrapper>
  );
}

function StatCard({ icon: Icon, label, value, prefix, suffix, decimals }) {
  return (
    <motion.div variants={fadeScaleItem}>
      <Card className="h-full">
        <CardContent className="flex flex-col gap-2 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight">
            <AnimatedNumber
              value={value}
              prefix={prefix}
              suffix={suffix}
              decimals={decimals}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </CardContent>
      </Card>
    </motion.div>
  );
}
