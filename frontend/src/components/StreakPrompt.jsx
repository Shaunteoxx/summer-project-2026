import { motion } from "framer-motion";
import { Flame } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeUp } from "@/animations/variants";

/**
 * The streak card when there's no streak to show yet: what's missing, and one
 * button to go and fix it. StreakCard uses it for "no period running" and "no
 * income logged", which differ only in their words and where the button goes.
 */
export default function StreakPrompt({ title, children, action, onAction }) {
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-2">
            <Flame className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.015em]">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{children}</p>
          </div>
          <Button size="sm" onClick={onAction}>
            {action}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
