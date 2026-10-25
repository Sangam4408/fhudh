// Shared Recharts props. Recharts sizes in JS, so phone tweaks live here rather than in CSS.

export function axisProps(mobile: boolean) {
  return { stroke: 'var(--axis)', tick: { fill: 'var(--text-2)', fontSize: mobile ? 11 : 12 } }
}

/** Narrower Y axis on phones; undefined keeps Recharts' default width on desktop. */
export const yAxisWidth = (mobile: boolean) => (mobile ? 36 : undefined)

export function chartMargin(mobile: boolean, top = 8) {
  return mobile ? { top, right: 4, bottom: 0, left: 0 } : { top, right: 16, bottom: 0, left: 8 }
}

/** Axis title, hidden on phones where the width is better spent on the plot. */
export function axisLabel(value: string, mobile: boolean) {
  return mobile ? undefined : { value, angle: -90, position: 'insideLeft' as const, fill: 'var(--text-2)', fontSize: 12 }
}

export const legendStyle = (mobile: boolean) => ({ fontSize: mobile ? 12 : 13 })
