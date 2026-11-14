# Enervtek × Din Industries: POC frontend

A hardcoded, offline proof of concept of the Enervtek platform as if installed at Din Industries' Spinning Unit DIL.

## Run (on the laptop, no internet needed)

```bash
npm run dev        # development: http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built app locally
```

## In the meeting

| Key | What it does |
|---|---|
| Shift + D | Power dip on LT#2 **now**: alarm pops up, Cards 05/06/07 trip, come back over 17–26 min |
| Shift + P | Presenter panel (trigger dip, TV mode, reset demo) |
| Shift + T | TV mode (HQ wall display, rotates every 15 s; ← → to switch, space to pause) |

```bash
npm run check      # cross-checks that every number agrees across all pages
```

> The C: drive on this laptop is full. Install packages with the npm cache on D:
> `npm install --cache D:/npm-cache`

## Structure

```
src/
  data/din/        Single source of truth for the mill (from Din's SLDs and tour notes)
    plant.ts       Site, grid intake, transformers, PF panels, solar, gensets, LT buses
    feeders.ts     All 43 LT feeders, named exactly as on "SLD For Spinning Unit DIL"
    machines.ts    165 assets: machine register wired to its feeder
    layout.ts      Halls and zones (walk order from the site visit)
    metering.ts    Enervtek metering points (PQ analysers, feeder and machine meters)
    floorplan.ts   2D mill map layout
  sim/             Simulation: live values, today's curve, 30-day history, findings (insights.ts)
  components/      App shell and UI primitives (theme taken from the Enervtek pitch deck)
  pages/           One file per module
  lib/             Formatting (PKR, kW), PKT shift calendar
  store/           Zustand app state (clock, theme)
```
