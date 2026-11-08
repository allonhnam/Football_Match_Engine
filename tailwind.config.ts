import type { Config } from 'tailwindcss';

// Colours come from CSS variables (see src/app/globals.css) so light and dark themes share one set of classes.
const c = (n: string) => `rgb(var(--c-${n}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), surface2: c('surface2'), line: c('line'),
        ink: c('ink'), dim: c('dim'), accent: c('accent'), accentink: c('accentink'),
        good: c('good'), warn: c('warn'), bad: c('bad'), card: c('yellow'), away: c('away'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
