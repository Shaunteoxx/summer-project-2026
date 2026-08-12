/** @type {import('tailwindcss').Config} */

// Tokens live in src/index.css. Anything referenced here as hsl(var(--x)) is
// defined there for both themes.
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        /* ── semantic (new code uses these) ─────────────────────────── */
        canvas: token("canvas"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        hairline: {
          DEFAULT: token("hairline"),
          strong: token("hairline-strong"),
        },
        ink: {
          DEFAULT: token("ink"),
          2: token("ink-2"),
          3: token("ink-3"),
        },
        positive: token("positive"),
        negative: token("negative"),
        warning: token("warning"),

        /* Category hues, for chips and chart fills. */
        cat: {
          food: token("cat-food"),
          transport: token("cat-transport"),
          shopping: token("cat-shopping"),
          entertainment: token("cat-entertainment"),
          travel: token("cat-travel"),
          allowance: token("cat-allowance"),
          job: token("cat-job"),
          gifts: token("cat-gifts"),
        },

        /* ── shadcn aliases, so untouched components keep working ───── */
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        success: {
          DEFAULT: token("success"),
          foreground: token("success-foreground"),
        },
      },

      /* Stepped, and much smaller than the old flat 20px. Big radii on small
         objects is what made the previous UI read as a toy. */
      borderRadius: {
        xs: "6px",   // badges, tags
        sm: "10px",  // icon tiles, chips, keypad keys
        md: "12px",  // buttons, inputs, segmented controls
        lg: "16px",  // cards
        xl: "20px",  // large cards, FAB
        "2xl": "24px", // bottom-sheet top corners
      },

      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
      },

      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      fontSize: {
        /* The scale from the spec. Line-height and tracking travel with the
           size so a heading can't be built wrong by accident. */
        overline: ["11px", { lineHeight: "1", letterSpacing: "0.07em", fontWeight: "500" }],
        meta: ["12.5px", { lineHeight: "1.4" }],
        caption: ["13px", { lineHeight: "1.45" }],
        body: ["15px", { lineHeight: "1.45", letterSpacing: "-0.005em" }],
        amount: ["19px", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
        title: ["19px", { lineHeight: "1.25", letterSpacing: "-0.02em", fontWeight: "600" }],
        "title-lg": ["27px", { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "600" }],
        display: ["46px", { lineHeight: "1.04", letterSpacing: "-0.035em", fontWeight: "500" }],
      },

      maxWidth: { app: "30rem" },

      transitionTimingFunction: {
        out: "cubic-bezier(0.32, 0.72, 0, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        micro: "120ms",
        base: "180ms",
        enter: "260ms",
        sheet: "340ms",
      },

      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        /* Indeterminate progress: a 38%-wide bar travelling the full track and
           easing at both ends, so it reads as "working" rather than "looping".
           Replaces the spinner — a rotating ring conveys the same nothing while
           drawing more attention to itself. */
        "track-slide": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(263%)" },
        },
        /* Hold at zero opacity first, so a chunk that loads quickly never
           flashes a loading state on screen. */
        "fade-in-delayed": {
          "0%, 60%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.32,0.72,0,1)",
        "sheet-up": "sheet-up 340ms cubic-bezier(0.32,0.72,0,1)",
        "track-slide":
          "track-slide 1.15s cubic-bezier(0.65,0,0.35,1) infinite",
        "fade-in-delayed": "fade-in-delayed 700ms ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
