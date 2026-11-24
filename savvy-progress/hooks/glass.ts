// Glass: the material every savvy-progress drawing sits on (Marc). Frosted, translucent
// panels with a bright rim, a soft sheen across the top and a soft shadow, in the manner
// of Apple's Liquid Glass. Kept minimal at rest; under the pointer a panel glistens (a
// sheen sweeps across it) and its edge glows in its own colour. A quiet (grey) panel only
// shimmers. Hover is CSS inside the drawing, so the Svg must be `isInteractive`, and the
// glow lights where the pointer enters rather than following it.
// To restyle, change GLASS and GLASS_CSS; nothing else holds a glass colour or size.

export const GLASS = {
  radius: 16,
  tileRadius: 12,
  // Room each drawing leaves around a panel for its shadow.
  inset: 3,
  glowBlur: 2.2,
  shadowBlur: 3.5,
  shadowY: 1.5,
}

// Light first; dark under the media query. Stops are styled by class, so one drawing serves both.
export const GLASS_CSS = `<style>
.gf0{stop-color:#ffffff;stop-opacity:.82}.gf1{stop-color:#ffffff;stop-opacity:.52}
.gr0{stop-color:#ffffff;stop-opacity:1}.gr1{stop-color:#ffffff;stop-opacity:.15}.gr2{stop-color:#ffffff;stop-opacity:.7}
.gs0{stop-color:#ffffff;stop-opacity:.55}.gs1{stop-color:#ffffff;stop-opacity:0}
.gedge{stroke:#000000;stroke-opacity:.07}.gsh{flood-color:#1b1a17;flood-opacity:.10}
.gsw0{stop-color:#ffffff;stop-opacity:0}.gsw1{stop-color:#ffffff;stop-opacity:.7}
.gglow,.gsweep{opacity:0}
.gglow{transition:opacity .3s ease}
.hum{animation:hum 2.4s ease-in-out infinite}@keyframes hum{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.hum{animation:none}}
.gp:hover .gglow{opacity:.95}
.gsweep{transform-box:fill-box}
.gp:hover .gsweep{animation:gsw .85s ease-out}
.gp.q:hover .gsweep{animation:gswq .85s ease-out}
@keyframes gsw{0%{transform:translateX(-100%);opacity:.85}100%{transform:translateX(350%);opacity:.85}}
@keyframes gswq{0%{transform:translateX(-100%);opacity:.4}100%{transform:translateX(350%);opacity:.4}}
@media (prefers-reduced-motion:reduce){.gp:hover .gsweep,.gp.q:hover .gsweep{animation:none}}
@media (prefers-color-scheme: dark){
.gf0{stop-color:#ffffff;stop-opacity:.11}.gf1{stop-color:#ffffff;stop-opacity:.045}
.gr0{stop-color:#ffffff;stop-opacity:.42}.gr1{stop-color:#ffffff;stop-opacity:.04}.gr2{stop-color:#ffffff;stop-opacity:.16}
.gs0{stop-color:#ffffff;stop-opacity:.10}.gs1{stop-color:#ffffff;stop-opacity:0}
.gedge{stroke:#000000;stroke-opacity:.35}.gsh{flood-color:#000000;flood-opacity:.45}
.gsw0{stop-opacity:.0}.gsw1{stop-opacity:.22}}
</style>`

// Gradients and filters one drawing shares between all its panels. `id` keeps drawings apart.
export const glassDefs = (id = 'g'): string => `<defs>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gf0"/><stop offset="1" class="gf1"/></linearGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="gr0"/><stop offset=".45" class="gr1"/><stop offset="1" class="gr2"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs0"/><stop offset="1" class="gs1"/></linearGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="gsw0"/><stop offset=".5" class="gsw1"/><stop offset="1" class="gsw0"/></linearGradient>
<filter id="${id}b" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${GLASS.glowBlur}"/></filter>
<filter id="${id}sg" x="-5%" y="-200%" width="110%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="${id}d" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${GLASS.shadowY}" stdDeviation="${GLASS.shadowBlur}" class="gsh"/></filter>
</defs>`

type PanelOpts = { r?: number; tint?: string; id?: string; isQuiet?: boolean }

// One glass panel at (x, y, w, h): shadow, the tint glowing through, frost, sheen, rim.
// `tint` is the colour its edge glows in under the pointer; a quiet panel has none, only the shimmer.
export const glassPanel = (x: number, y: number, w: number, h: number, o: PanelOpts = {}): string => {
  const id = o.id ?? 'g'
  const r = o.r ?? GLASS.radius
  const clip = `${id}c${Math.round(x)}_${Math.round(y)}`
  const sheenH = Math.min(h * 0.5, 26)
  const sweepW = Math.max(24, w * 0.4)
  const glow = o.tint && !o.isQuiet
    ? `<g class="gglow"><rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="${o.tint}" stroke-width="2.6" filter="url(#${id}b)"/><rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="${o.tint}" stroke-width="1.1"/></g>`
    : ''
  return [
    `<g class="gp${o.tint && !o.isQuiet ? '' : ' q'}">`,
    `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}f)" filter="url(#${id}d)"/>`,
    `<g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${w}" height="${sheenH}" fill="url(#${id}s)"/><rect class="gsweep" x="${x}" y="${y}" width="${sweepW}" height="${h}" fill="url(#${id}w)"/></g>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" class="gedge"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="url(#${id}r)" stroke-width="1.2"/>`,
    glow,
    `</g>`,
  ].join('')
}

// Marc: progress bars look like a lightsaber's beam (not the sword): a white-hot core, a blade in
// the segment's colour around it and a soft glow of that colour beyond, humming gently. Faint
// segments (work not started) stay a dim glass fill with no beam. Leave about h/2 + 4px clear
// around the bar for the glow.
export const glassBar = (x: number, y: number, w: number, h: number, segments: { w: number; color: string; isFaint?: boolean }[], id = 'g'): string => {
  const r = h / 2
  let at = x
  const lit: string[] = []
  const glow: string[] = []
  const faint: string[] = []
  for (const s of segments.filter(seg => seg.w > 0)) {
    if (s.isFaint) faint.push(`<rect x="${at}" y="${y}" width="${s.w}" height="${h}" fill="${s.color}" opacity=".3"/>`)
    else {
      lit.push(`<rect x="${at}" y="${y}" width="${s.w}" height="${h}" fill="${s.color}"/>`)
      glow.push(`<rect x="${at}" y="${y - h * 0.15}" width="${s.w}" height="${h * 1.3}" rx="${r}" fill="${s.color}"/>`)
    }
    at += s.w
  }
  const litW = segments.filter(seg => seg.w > 0 && !seg.isFaint).reduce((n, seg) => n + seg.w, 0)
  const clip = `${id}bar${Math.round(y)}_${Math.round(x)}`
  const coreH = Math.max(1.2, h * 0.34)
  const core = litW > 0 ? `<rect x="${x + r * 0.4}" y="${y + (h - coreH) / 2}" width="${Math.max(0, litW - r * 0.8)}" height="${coreH}" rx="${coreH / 2}" fill="#ffffff" opacity=".9"/>` : ''
  return [
    `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="k" opacity=".55"/>`,
    `<g clip-path="url(#${clip})">${faint.join('')}</g>`,
    glow.length ? `<g class="hum" filter="url(#${id}sg)" opacity=".8">${glow.join('')}</g>` : '',
    `<g clip-path="url(#${clip})">${lit.join('')}${core}</g>`,
  ].join('')
}

// Marc: the hover glow as a drawing of its own, the same size as the card it lights and
// transparent but for the tinted edge. The pane stacks it on the card, hidden, and the app's own
// hover reveals it, so both stay plain images: no interactive frame, so none of its padding gaps.
export const glowOnly = (W: number, H: number, tint: string, r = GLASS.radius): string => {
  // Marc: subtle. A soft ring of the card's colour inside its rounded edge, at a quarter of the
  // first try's strength so it never clashes with the text, and a glimmer: a band of light that
  // flashes across the card every couple of seconds while the pointer is on it. All clipped to the
  // card's outline, so nothing reaches the drawing's square edge.
  const x = GLASS.inset
  const w = W - x * 2
  const h = H - x * 2
  const ring = (sw: number, extra: string) => `<rect x="${x}" y="${x}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${tint}" stroke-width="${sw}" ${extra}/>`
  const band = Math.max(40, w * 0.22)
  const style = `<style>.gm{animation:gm 2.6s cubic-bezier(.4,0,.2,1) infinite}@keyframes gm{0%{transform:translateX(${-band * 1.5}px)}45%,100%{transform:translateX(${W + band}px)}}@media (prefers-reduced-motion:reduce){.gm{animation:none;opacity:0}}</style>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${style}<defs><clipPath id="hc"><rect x="${x}" y="${x}" width="${w}" height="${h}" rx="${r}"/></clipPath><filter id="hw" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g clip-path="url(#hc)">${ring(8, 'filter="url(#hw)" opacity=".18"')}<g class="gm"><rect x="0" y="${-H}" width="${band}" height="${H * 3}" fill="url(#hg)" transform="skewX(-20)"/></g></g>${ring(0.8, 'opacity=".35"')}</svg>`
}
