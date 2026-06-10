import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Target } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staggerContainer, fadeUp } from "@/animations/variants";

function daysLeftInMonth() {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate() + 1; // include today
}

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export default function CalculatorPage() {
  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">Calculator</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Plan your spending and savings two ways.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer(0.12, 0.1)}
        initial="initial"
        animate="animate"
        className="mt-5 grid gap-4"
      >
        <DailySpendCalculator />
        <SavingsGoalCalculator />
      </motion.div>
    </PageWrapper>
  );
}

function DailySpendCalculator() {
  const [allowance, setAllowance] = useState("");
  const [result, setResult] = useState(null);
  const daysLeft = daysLeftInMonth();

  const calculate = (e) => {
    e.preventDefault();
    const a = Number(allowance);
    if (!a || a <= 0) return;
    setResult(a / daysLeft);
  };

  return (
    <motion.div variants={fadeUp}>
      <Card className="h-full">
        <CardHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <CalendarDays className="h-5 w-5" />
          </div>
          <CardTitle>Daily Spend Budget</CardTitle>
          <CardDescription>
            How much can you spend per day for the rest of this month?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={calculate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="allowance">Monthly allowance (after savings)</Label>
              <Input
                id="allowance"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 1200"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Calculate daily budget
            </Button>
          </form>

          {result !== null && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-6 rounded-xl bg-primary/5 p-5 text-center"
            >
              <p className="text-sm text-muted-foreground">
                You can spend (over {daysLeft} days left)
              </p>
              <p className="mt-1 text-4xl font-extrabold text-primary">
                <AnimatedNumber value={result} prefix="$" decimals={2} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground">per day</p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SavingsGoalCalculator() {
  const [daily, setDaily] = useState("");
  const [result, setResult] = useState(null);
  const totalDays = daysInCurrentMonth();

  const calculate = (e) => {
    e.preventDefault();
    const d = Number(daily);
    if (!d || d <= 0) return;
    setResult(d * totalDays);
  };

  return (
    <motion.div variants={fadeUp}>
      <Card className="h-full">
        <CardHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Target className="h-5 w-5" />
          </div>
          <CardTitle>Savings Goal</CardTitle>
          <CardDescription>
            Want to spend a set amount each day? See the monthly budget you need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={calculate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="daily">Desired daily spending</Label>
              <Input
                id="daily"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 40"
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Calculate monthly need
            </Button>
          </form>

          {result !== null && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-6 rounded-xl bg-primary/5 p-5 text-center"
            >
              <p className="text-sm text-muted-foreground">
                To spend that daily over {totalDays} days, set aside
              </p>
              <p className="mt-1 text-4xl font-extrabold text-primary">
                <AnimatedNumber value={result} prefix="$" decimals={2} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground">per month</p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
