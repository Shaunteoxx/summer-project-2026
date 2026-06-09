import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calculator,
  PieChart,
  Receipt,
  PiggyBank,
  Wallet,
  TrendingUp,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHomeStats } from "@/api/endpoints";
import { monthName } from "@/lib/utils";
import { staggerContainer, fadeUp, fadeScaleItem } from "@/animations/variants";

const navCards = [
  {
    to: "/calculator",
    label: "Calculator",
    desc: "Work out your daily spend & savings goals",
    icon: Calculator,
  },
  {
    to: "/tracker",
    label: "Monthly Tracker",
    desc: "See what you saved vs spent this month",
    icon: PieChart,
  },
  {
    to: "/transactions",
    label: "Transactions",
    desc: "Log income & expenses for the month",
    icon: Receipt,
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
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mb-8">
        <p className="text-sm font-medium text-primary">
          {monthName(month)} {year}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Welcome back{stats ? `, ${stats.username}` : ""} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here's where your money stands this month.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer(0.12, 0.1)}
        initial="initial"
        animate="animate"
        className="grid gap-4 sm:grid-cols-3"
      >
        <StatCard
          icon={PiggyBank}
          label="Total saved since sign-up"
          value={stats?.totalSavings ?? 0}
          prefix="$"
          decimals={2}
          accent
        />
        <StatCard
          icon={Wallet}
          label="Left to spend this month"
          value={stats?.leftToSpend ?? 0}
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

      <motion.div
        variants={staggerContainer(0.1, 0.35)}
        initial="initial"
        animate="animate"
        className="mt-10"
      >
        <h2 className="mb-4 text-lg font-semibold">Jump to</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {navCards.map((c) => {
            const Icon = c.icon;
            return (
              <motion.button
                key={c.to}
                variants={fadeScaleItem}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(c.to)}
                className="text-left"
              >
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{c.label}</h3>
                      <p className="text-sm text-muted-foreground">{c.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </PageWrapper>
  );
}

function StatCard({ icon: Icon, label, value, prefix, suffix, decimals, accent }) {
  return (
    <motion.div variants={fadeScaleItem}>
      <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {label}
            </span>
            <Icon className={`h-5 w-5 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="text-3xl font-extrabold tracking-tight">
            <AnimatedNumber
              value={value}
              prefix={prefix}
              suffix={suffix}
              decimals={decimals}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
