// Shared ECharts styling: recessive axes and grid, DM Sans, deck colours.
export const C = {
  grid: '#3D7FC4',
  solar: '#E0A100',
  gas: '#1F8A5B',
  brand: '#237A57',
  brandDark: '#173629',
  ink: '#18251F',
  muted: '#65736B',
  faint: '#8A948E',
  line: '#E2E8E3',
  warn: '#A96813',
  alarm: '#B83A2C',
  mint: '#E8F2EC',
}

export const FONT = '"DM Sans", system-ui, sans-serif'

export const axisLabel = { color: C.faint, fontFamily: FONT, fontSize: 11 }

export const tooltipBase = {
  backgroundColor: '#fff',
  borderColor: C.line,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: C.ink, fontFamily: FONT, fontSize: 12 },
  extraCssText: 'box-shadow: 0 8px 30px rgb(24 37 31 / 0.14); border-radius: 10px;',
}
