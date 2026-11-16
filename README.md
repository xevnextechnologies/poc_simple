# Enervtek × Din Industries: POC frontend

A hardcoded, offline proof of concept of the Enervtek platform as if installed at Din Industries' Spinning Unit DIL.

## Run (on the laptop, no internet needed)

```bash
npm install        # first time only
npm run dev        # development: http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built app locally
npm run check      # cross-checks that every number agrees across all pages
```

## Screens

| Page | Route | What it shows |
|---|---|---|
| Mill today | `/today` | Opening screen: load gauge, grid vs solar, load today, halls, health, top fixes, what is stopped |
| Mill map | `/map` | Live floor plan with power flow; Status / Load / Health views; hall cards; event ticker; machine drawer |
| Downtime now | `/downtime` | Stopped machines, most urgent first, mini map, timeline (list on phones) |
| Downtime this month | `/downtime-month` | 30-day numbers, calendar heatmap, causes, repair time vs normal, heat map, top machines |
| Machine health | `/health` | Health map, act-now cards, the 8 checks, anomaly detection with early warning, analysis drawer |
| What to fix first | `/advisor` | Fix pipeline, priority matrix, ranked fixes, detail drawer with the proof chart |
| Ask Enervtek | `/ask` | Scripted chat assistant, answers from the same data |

## In the meeting

| Key | What it does |
|---|---|
| Shift + D | Power dip on LT#2 **now**: alarm and beep, Cards 05/06/07 trip and come back over 17–26 min |
| Shift + P | Presenter panel: trigger the dip, test sounds, reset the demo, **switch theme live** |
| Shift + T | Jump to Downtime now |

Click anywhere once before the meeting (or use **Test sounds**): browsers only play sound after the page has been used.

## Themes

Ten colour themes (7 dark, 3 light). The default is the one uncommented line in `src/theme.ts`; the colours live in `src/index.css` under "Themes". The presenter panel switches themes live until the page is reloaded.

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
  components/      App shell, shared kit (ui/kit.tsx), proof charts, demo layer
  pages/           One file per screen
  lib/             Formatting (PKR, kW), PKT shift calendar, sounds
  store/           Zustand app state (clock, demo state)
  theme.ts         Which colour theme is used
```
