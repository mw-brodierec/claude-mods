// Glass: the material every savvy-progress drawing sits on (Marc). Frosted, translucent
// panels with a bright rim, a soft sheen across the top, a blurred tint glowing through
// from behind and a soft shadow, in the manner of Apple's Liquid Glass.
//
// The app draws each SVG as an image, so nothing outside a drawing can show through it.
// The colour that seems to sit behind the glass is drawn inside, as a blurred orb.
// To restyle, change GLASS and GLASS_CSS; nothing else holds a glass colour or size.

export const GLASS = {
  radius: 16,
  tileRadius: 12,
  // Room each drawing leaves around a panel for its shadow.
  inset: 3,
  orbBlur: 14,
  shadowBlur: 3.5,
  shadowY: 1.5,
}

// Light first; dark under the media query. Stops are styled by class, so one drawing serves both.
export const GLASS_CSS = `<style>
.gf0{stop-color:#ffffff;stop-opacity:.82}.gf1{stop-color:#ffffff;stop-opacity:.52}
.gr0{stop-color:#ffffff;stop-opacity:1}.gr1{stop-color:#ffffff;stop-opacity:.15}.gr2{stop-color:#ffffff;stop-opacity:.7}
.gs0{stop-color:#ffffff;stop-opacity:.55}.gs1{stop-color:#ffffff;stop-opacity:0}
.gedge{stroke:#000000;stroke-opacity:.07}.gsh{flood-color:#1b1a17;flood-opacity:.10}
.gorb{opacity:.55}.gorb.q{opacity:.25}
@media (prefers-color-scheme: dark){
.gf0{stop-color:#ffffff;stop-opacity:.11}.gf1{stop-color:#ffffff;stop-opacity:.045}
.gr0{stop-color:#ffffff;stop-opacity:.42}.gr1{stop-color:#ffffff;stop-opacity:.04}.gr2{stop-color:#ffffff;stop-opacity:.16}
.gs0{stop-color:#ffffff;stop-opacity:.10}.gs1{stop-color:#ffffff;stop-opacity:0}
.gedge{stroke:#000000;stroke-opacity:.35}.gsh{flood-color:#000000;flood-opacity:.45}
.gorb{opacity:.26}.gorb.q{opacity:.12}}
</style>`

// Gradients and filters one drawing shares between all its panels. `id` keeps drawings apart.
export const glassDefs = (id = 'g'): string => `<defs>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gf0"/><stop offset="1" class="gf1"/></linearGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="gr0"/><stop offset=".45" class="gr1"/><stop offset="1" class="gr2"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs0"/><stop offset="1" class="gs1"/></linearGradient>
<filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${GLASS.orbBlur}"/></filter>
<filter id="${id}d" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${GLASS.shadowY}" stdDeviation="${GLASS.shadowBlur}" class="gsh"/></filter>
</defs>`

type PanelOpts = { r?: number; tint?: string; tintAt?: [number, number]; id?: string; isQuiet?: boolean }

// One glass panel at (x, y, w, h): shadow, the tint glowing through, frost, sheen, rim.
// `tint` is the colour behind it; `tintAt` where it glows from, as fractions of the panel.
export const glassPanel = (x: number, y: number, w: number, h: number, o: PanelOpts = {}): string => {
  const id = o.id ?? 'g'
  const r = o.r ?? GLASS.radius
  const clip = `${id}c${Math.round(x)}_${Math.round(y)}`
  const [tx, ty] = o.tintAt ?? [0.12, 0.1]
  const orbR = Math.max(18, Math.min(w, h) * 0.75)
  const sheenH = Math.min(h * 0.5, 26)
  return [
    `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}f)" filter="url(#${id}d)"/>`,
    o.tint
      ? `<g clip-path="url(#${clip})"><circle cx="${x + w * tx}" cy="${y + h * ty}" r="${orbR}" fill="${o.tint}" class="gorb${o.isQuiet ? ' q' : ''}" filter="url(#${id}b)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}f)" opacity=".6"/></g>`
      : '',
    `<g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${w}" height="${sheenH}" fill="url(#${id}s)"/></g>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" class="gedge"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="url(#${id}r)" stroke-width="1.2"/>`,
  ].join('')
}

// A glass capsule track with a liquid fill: for progress bars.
export const glassBar = (x: number, y: number, w: number, h: number, segments: { w: number; color: string; isFaint?: boolean }[], id = 'g'): string => {
  const clip = `${id}bar${Math.round(y)}`
  let at = x
  const fills = segments
    .filter(s => s.w > 0)
    .map(s => {
      const out = `<rect x="${at}" y="${y}" width="${s.w}" height="${h}" fill="${s.color}"${s.isFaint ? ' opacity=".35"' : ''}/>`
      at += s.w
      return out
    })
    .join('')
  return [
    `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/></clipPath>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="k"/>`,
    `<g clip-path="url(#${clip})">${fills}<rect x="${x}" y="${y}" width="${w}" height="${h / 2}" fill="#ffffff" opacity=".28"/></g>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${(h - 1) / 2}" fill="none" stroke="url(#${id}r)" stroke-width="1"/>`,
  ].join('')
}
