import mark from '../../assets/enervtek-mark.png'

export function EnervtekMark({ size = 30 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-lg bg-white shrink-0" style={{ width: size, height: size }}>
      <img src={mark} alt="" style={{ width: size * 0.82, height: size * 0.82 }} />
    </span>
  )
}

/** Neutral customer monogram. Swap for Din's logo file once approved. */
export function DinMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-full bg-mint text-brand-dark font-display font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      D
    </span>
  )
}
