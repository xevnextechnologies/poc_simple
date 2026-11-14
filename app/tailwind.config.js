/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Classes composed at runtime from data
  safelist: [
    { pattern: /^(bg|text)-(lt1|lt2|lt3|solar|grid|genset)$/ },
    { pattern: /^(bg|text)-(lt1|lt2|lt3|solar|grid|genset)\/(10|15)$/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Rubik', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        sunken: v('sunken'),
        mint: v('mint'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        brand: v('brand'),
        'brand-dark': v('brand-dark'),
        'brand-soft': v('brand-soft'),
        ok: v('ok'),
        warn: v('warn'),
        'warn-bg': v('warn-bg'),
        alarm: v('alarm'),
        'alarm-bg': v('alarm-bg'),
        idle: v('idle'),
        grid: v('grid'),
        solar: v('solar'),
        gas: v('gas'),
        // aliases used by the Plant setup screen
        accent: v('brand'),
        raised: v('sunken'),
        genset: v('gas'),
        lt1: v('lt1'),
        lt2: v('lt2'),
        lt3: v('lt3'),
      },
      fontSize: {
        '2xs': ['11px', '15px'],
      },
      borderRadius: {
        DEFAULT: '8px',
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(24 37 31 / 0.04), 0 2px 8px rgb(24 37 31 / 0.04)',
        pop: '0 8px 30px rgb(24 37 31 / 0.14)',
      },
    },
  },
  plugins: [],
}
