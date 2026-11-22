// Clawd for the usage band's right edge, 30px tall like the meters: shooting hoops while
// Claude works; welding or in the lab (picked per wait) while it waits for you.
// Pure strings, so a test can check them without the engine.

export const W = 96
export const H = 30
const U = 2.5
const ORANGE = '#D97757'
const INK = '#1F1E1D'
const BALL = '#E8833A'

const px = (x: number, y: number, w = 1, h = 1) => `<rect x="${x * U}" y="${y * U}" width="${w * U}" height="${h * U}"/>`

// Body 11x5 units with arm nubs, eyes on top. Legs drawn separately so they can move.
const body = [px(1, 0, 9, 5), px(0, 2), px(10, 2)].join('')
const eyes = `<g class="eyes" fill="${INK}">${px(3, 1, 1, 2)}${px(7, 1, 1, 2)}</g>`
const seams = `<path d="M-3 0H3M0-3V3M-2.1-2.1Q-.9 0-2.1 2.1M2.1-2.1Q.9 0 2.1 2.1" stroke="${INK}" stroke-width=".45" fill="none"/>`
const ball = `<g class="ball"><g class="spin"><circle r="3" fill="${BALL}"/>${seams}</g></g>`

// Rim 10 wide (ball is 6). Net is a closed mesh: sides, crossing strands and a bottom ring.
const TOP = [75.5, 78.5, 81.5, 84.5]
const BOT = [77.5, 79.2, 80.8, 82.5]
const strands = [
  `M${TOP[0]} 9.5L${BOT[0]} 16H${BOT[3]}L${TOP[3]} 9.5`,
  ...TOP.slice(0, 3).map((t, i) => `M${t} 9.5L${BOT[i + 1]} 16M${TOP[i + 1]} 9.5L${BOT[i]} 16`),
].join('')
const hoopBack = (poleBottom: number) =>
  `<rect x="91" y="1" width="2" height="${poleBottom - 1}" fill="#8A8580"/><rect x="87" y="0" width="2.5" height="13" fill="#C9C4BC"/><rect x="84.5" y="8" width="3" height="1" fill="#8A8580"/>`
// Drawn after the ball, so the ball drops behind the net and the rim's front.
const hoopFront =
  `<g class="net" stroke="#E6E1D8" stroke-width=".6" fill="none" stroke-linejoin="round"><path d="${strands}"/></g>` +
  `<rect x="75" y="8" width="10" height="1.6" rx=".6" fill="#D9482B"/>`

const css = (rules: string[]) => `<style>${rules.join('')}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`
const svg = (style: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${style}${inner}</svg>`

// Standing at x=4 with feet on the floor (body top 12.5 + 7 units = 30); `face` goes over the body.
// `isSeated` (Marc): no legs, for a seat in a cockpit or a kart.
const standing = (face: string, isSeated = false) =>
  `<g class="clawd"><g transform="translate(4 12.5)"><g fill="${ORANGE}">${body}${isSeated ? '' : [2, 4, 6, 8].map(x => px(x, 5, 1, 2)).join('')}</g>${face}</g></g>`

export function workingSvg(): string {
  // One 3.2s loop: three dribbles, gather, jump shot, through the net, ball back to the hand.
  const style = css([
    '.ball{animation:ball 3.2s infinite}',
    '@keyframes ball{',
    '0%,16%,32%{transform:translate(36px,19px);animation-timing-function:ease-in}',
    '8%,24%,40%{transform:translate(36px,27px);animation-timing-function:ease-out}',
    '48%{transform:translate(35px,16px)}',
    '56%{transform:translate(48px,5px)}62%{transform:translate(60px,2px)}68%{transform:translate(71px,4px)}',
    '74%{transform:translate(80px,7px);animation-timing-function:ease-in}',
    '86%{transform:translate(80px,27px);opacity:1}',
    '90%{transform:translate(80px,27px);opacity:0}',
    '91%{transform:translate(36px,19px);opacity:0}',
    '100%{transform:translate(36px,19px);opacity:1}}',
    // Backspin on the shot: counterclockwise from the release until it drops through the net.
    '.spin{transform-box:fill-box;transform-origin:50% 50%;animation:spin 3.2s infinite}',
    '@keyframes spin{0%,48%{transform:rotate(0)}74%{transform:rotate(-540deg)}86%,90.9%{transform:rotate(-630deg)}91%,100%{transform:rotate(0)}}',
    '.clawd{animation:hop 3.2s infinite}',
    '@keyframes hop{0%,16%,32%{transform:translateY(0)}8%,24%,40%{transform:translateY(1px)}',
    '48%{transform:translateY(1.5px)}54%{transform:translateY(-3px)}62%,100%{transform:translateY(0)}}',
    '.net{transform-box:fill-box;transform-origin:50% 0;animation:swish 3.2s infinite}',
    '@keyframes swish{0%,75%,90%,100%{transform:scaleY(1)}79%{transform:scaleY(1.3)}84%{transform:scaleY(.92)}}',
  ])
  return svg(style, `${hoopBack(H)}${standing(eyes)}${ball}${hoopFront}`)
}

// Weld point: the torch tip against the plate's left end.
const TIP = { x: 41, y: 19.5 }
const SPARKS: [number, number, number][] = [
  [-6, -5, 6],
  [4, -6, 8],
  [-3, -3, 9],
  [7, -4, 7],
]

export function weldingSvg(): string {
  // Welder's mask down, spot-welding a plate at the bench. 2.4s loop: a burst of
  // arc flashes and sparks, then a pause while the weld glows and cools.
  const style = css([
    '.flash{animation:flash 2.4s infinite}',
    '@keyframes flash{0%,10%,22%,38%,55%{opacity:1}5%,30%{opacity:.4}15%,46%{opacity:.65}56%,100%{opacity:0}}',
    '.burst{animation:burst 2.4s infinite}',
    '@keyframes burst{0%,55%{opacity:1}56%,100%{opacity:0}}',
    ...SPARKS.map(([dx, up, down], i) =>
      `.s${i}{animation:s${i} .45s ${(i * -0.11).toFixed(2)}s linear infinite}` +
      `@keyframes s${i}{0%{transform:translate(0,0);opacity:1}50%{transform:translate(${dx / 2}px,${up}px)}100%{transform:translate(${dx}px,${down}px);opacity:0}}`,
    ),
    '.weld{animation:cool 2.4s infinite}',
    '@keyframes cool{0%,55%{fill:#FFD27A}75%{fill:#E8642C}100%{fill:#8E959C}}',
  ])
  // Mask over the face: grey shell, dark tinted visor that catches the arc light.
  const mask =
    `<rect x="${1.5 * U}" y="${-0.5 * U}" width="${8 * U}" height="${3.6 * U}" rx=".8" fill="#4B5157"/>` +
    `<rect x="${0.9 * U}" y="${0.6 * U}" width="${0.6 * U}" height="${U}" fill="#33383D"/>` +
    `<rect x="${2.6 * U}" y="${0.9 * U}" width="${5.8 * U}" height="${1.2 * U}" fill="#1E2A22"/>` +
    `<g opacity=".55"><rect class="flash" x="${2.6 * U}" y="${0.9 * U}" width="${5.8 * U}" height="${1.2 * U}" fill="#9FE6FF"/></g>`
  const bench =
    `<rect x="40" y="21" width="30" height="2" fill="#6E5A48"/><rect x="42" y="23" width="2" height="7" fill="#5A4A3B"/><rect x="66" y="23" width="2" height="7" fill="#5A4A3B"/>` +
    `<rect x="41" y="18.5" width="20" height="2.5" fill="#8E959C"/><rect class="weld" x="41" y="18.3" width="1.6" height="1.4" fill="#8E959C"/>`
  // Torch held in the right arm nub, nozzle on the weld point.
  const torch = `<rect x="31" y="18.6" width="7" height="1.6" fill="#6B6F73"/><rect x="38" y="19.1" width="3" height=".8" fill="#B8BCC0"/>`
  const arc =
    `<g transform="translate(${TIP.x} ${TIP.y})">` +
    `<g class="flash"><circle r="4" fill="#BFE8FF" opacity=".45"/><circle r="1.8" fill="#FFFFFF"/></g>` +
    `<g class="burst">${SPARKS.map((_, i) => `<circle class="s${i}" r=".7" fill="#FFD27A"/>`).join('')}</g></g>`
  const parked = `<g transform="translate(80 27)"><circle r="3" fill="${BALL}"/>${seams}</g>`

  return svg(style, `${bench}${parked}${standing(mask)}${torch}${arc}`)
}

const NEON = '#39FF14'
const GLASS = 'fill="#DDEFF5" fill-opacity=".18" stroke="#DDEFF5" stroke-width=".5"'

export function labSvg(): string {
  // White coat and goggles; tips a beaker of neon green into a funnel that feeds a flask,
  // a coiled condenser and a bubbling flask, beside a rack of glowing test tubes. 3.6s loop.
  const style = css([
    '.neon{filter:drop-shadow(0 0 1.2px #39FF14)}',
    '.beaker{transform-box:fill-box;transform-origin:0% 100%;animation:tilt 3.6s ease-in-out infinite}',
    '@keyframes tilt{0%,5%,78%,100%{transform:rotate(0)}18%,62%{transform:rotate(32deg)}}',
    '.liq{transform-box:fill-box;transform-origin:50% 100%;animation:drain 3.6s infinite}',
    '@keyframes drain{0%,18%{transform:scaleY(1)}62%,80%{transform:scaleY(.35)}96%,100%{transform:scaleY(1)}}',
    '.stream{animation:stream 3.6s infinite}',
    '@keyframes stream{0%,19%,62%,100%{opacity:0}21%,60%{opacity:1}}',
    '.flow{stroke-dasharray:2 3;animation:flow .6s linear infinite}',
    '@keyframes flow{to{stroke-dashoffset:-5}}',
    '.bub{animation:bub 1.2s ease-in infinite}.bub.b{animation-delay:-.4s}.bub.c{animation-delay:-.8s}',
    '@keyframes bub{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-4px);opacity:0}}',
    '.drip{animation:drip 1.2s ease-in infinite}',
    '@keyframes drip{0%{transform:translateY(0);opacity:1}80%{transform:translateY(5px);opacity:1}81%,100%{opacity:0}}',
    '.tube{animation:glow 2.4s ease-in-out infinite}',
    ...[1, 2, 3, 4].map(i => `.tube.t${i}{animation-delay:-${(i * 0.5).toFixed(1)}s}`),
    '@keyframes glow{0%,100%{opacity:.75}50%{opacity:1}}',
    '.eyes{transform-box:fill-box;transform-origin:50% 50%;animation:blink 5s infinite}',
    '@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}',
  ])
  // Coat from row 3 down, so it sits below the eyes (rows 1-2); V collar, buttons, pocket and pen.
  const coat =
    `<g fill="#F4F2EC">${px(1, 3, 9, 2)}${px(0, 2)}${px(10, 2)}</g>` +
    `<path d="M${4.6 * U} ${3 * U}H${6.4 * U}L${5.5 * U} ${3.8 * U}Z" fill="${ORANGE}"/>` +
    `<rect x="${5.4 * U}" y="${3.8 * U}" width="${0.2 * U}" height="${1.2 * U}" fill="#CFCBC2"/>` +
    `<circle cx="${5.9 * U}" cy="${4.1 * U}" r=".4" fill="#B9B4AA"/><circle cx="${5.9 * U}" cy="${4.65 * U}" r=".4" fill="#B9B4AA"/>` +
    `<rect x="${2 * U}" y="${3.7 * U}" width="${1.4 * U}" height="${0.8 * U}" fill="none" stroke="#CFCBC2" stroke-width=".4"/>` +
    `<rect x="${2.5 * U}" y="${3.25 * U}" width="${0.25 * U}" height="${0.6 * U}" fill="#3B7DD8"/>`
  const goggles =
    `<rect x="${1 * U}" y="${1.25 * U}" width="${9 * U}" height="${0.5 * U}" fill="#6B7A86"/>` +
    eyes +
    `<rect x="${2.4 * U}" y="${0.6 * U}" width="${2.4 * U}" height="${1.8 * U}" rx="1" fill="#CFF4FF" fill-opacity=".45" stroke="#6B7A86" stroke-width=".5"/>` +
    `<rect x="${6.2 * U}" y="${0.6 * U}" width="${2.4 * U}" height="${1.8 * U}" rx="1" fill="#CFF4FF" fill-opacity=".45" stroke="#6B7A86" stroke-width=".5"/>`
  // Beaker in the right hand: its bottom-left corner (31.5, 18) is the pivot it tips around.
  const beaker =
    `<g class="beaker"><rect x="31.5" y="10" width="6" height="8" rx=".6" ${GLASS}/>` +
    `<rect class="liq neon" x="32" y="13.5" width="5" height="4.2" fill="${NEON}"/>` +
    `<path d="M37.5 10.2l.9-.7" stroke="#DDEFF5" stroke-width=".5"/></g>`
  const stream = `<g class="stream"><path class="flow neon" d="M40.8 14.4Q41.9 15 42 17" stroke="${NEON}" stroke-width=".9" fill="none"/></g>`
  // Bench, stand and clamp, funnel into a round flask, side arm up into the coil, down into
  // the conical flask; test-tube rack on the right.
  const bench = `<rect x="38" y="27" width="56" height="1.5" fill="#6E5A48"/><rect x="40" y="28.5" width="1.5" height="1.5" fill="#5A4A3B"/><rect x="91" y="28.5" width="1.5" height="1.5" fill="#5A4A3B"/>`
  const stand = `<rect x="47.2" y="7" width=".8" height="20" fill="#8A8580"/><rect x="44.5" y="17.3" width="3" height=".6" fill="#8A8580"/><rect x="46" y="26.4" width="4" height=".6" fill="#8A8580"/>`
  const funnel = `<path d="M39 16.5H45L42.7 19.5V21.2H41.3V19.5Z" ${GLASS}/>`
  const flask =
    `<rect x="41" y="20.5" width="2" height="2" ${GLASS}/><circle cx="42" cy="24.5" r="2.5" ${GLASS}/>` +
    `<path class="neon" d="M39.7 25.2A2.3 2.3 0 0 0 44.3 25.2Z" fill="${NEON}"/>`
  const coilPath = 'M43 21.6H49.5V6.5L60 8.2 50 10 60 11.8 50 13.6 60 15.4 62.5 17V19.4'
  const coil = `<path d="${coilPath}" fill="none" stroke="#CFE9F1" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/><path class="flow neon" d="${coilPath}" fill="none" stroke="${NEON}" stroke-width=".5"/>`
  const conical =
    `<path d="M61.5 19.2H63.5V21.3L66.2 27H58.8L61.5 21.3Z" ${GLASS}/>` +
    `<path class="neon" d="M60.1 24.2H64.9L66.2 27H58.8Z" fill="${NEON}"/>` +
    `<circle class="drip neon" cx="62.5" cy="19.6" r=".5" fill="${NEON}"/>` +
    ['a', 'b', 'c'].map((k, i) => `<circle class="bub ${k}" cx="${61.2 + i * 1.2}" cy="26.3" r=".45" fill="#E9FFE0"/>`).join('')
  const TUBES: [number, string, number][] = [[71, NEON, 6], [75.5, '#FF4FD8', 4], [80, '#3EE0FF', 7], [84.5, '#FFC44D', 5], [89, NEON, 3.5]]
  const rack =
    `<rect x="69.5" y="19.5" width="22" height="1" fill="#8A8580"/>` +
    TUBES.map(([x, color, fill], i) =>
      `<rect x="${x}" y="15" width="2.4" height="11" rx="1.2" ${GLASS}/>` +
      `<rect class="tube t${i} neon" x="${x + 0.3}" y="${25.7 - fill}" width="1.8" height="${fill}" rx=".9" fill="${color}" style="filter:drop-shadow(0 0 1px ${color})"/>`,
    ).join('') +
    `<rect x="69.5" y="25.6" width="22" height="1.4" fill="#8A8580"/>`

  return svg(style, `${bench}${stand}${rack}${coil}${conical}${flask}${funnel}${standing(coat + goggles)}${beaker}${stream}`)
}

// ---------------------------------------------------------------------------
// Marc: more wait scenes, one per trade Clawd has picked up. Each sets him in his
// outfit at a small scene of his own, as the lab does. Absolute coordinates: Clawd's body
// spans x 4-31.5, y 12.5-25; his right arm nub, where he holds things, ends at (31.5, 19).

const pf = (fill: string, ...rects: string[]) => `<g fill="${fill}">${rects.join('')}</g>`
const blinkEyes = '.eyes{transform-box:fill-box;transform-origin:50% 50%;animation:blink 5s infinite}@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}'
const floor = (color = '#6E5A48') => `<rect x="0" y="29" width="96" height="1" fill="${color}" opacity=".5"/>`
const GOLDEN = '#E3B341'
const RED = '#CE102C'

export function generalSvg(): string {
  // Dress whites between two flagpoles, the Stars and Stripes and the Maple Leaf: peaked cap,
  // epaulettes, ribbons and a medal; salutes as the flags fly.
  const style = css([
    blinkEyes,
    '.flag{transform-box:fill-box;transform-origin:0 50%;animation:fly 1.2s ease-in-out infinite}',
    '@keyframes fly{0%,100%{transform:skewY(0) scaleX(1)}50%{transform:skewY(6deg) scaleX(.9)}}',
    '.salute{animation:salute 3s steps(1) infinite}@keyframes salute{0%,55%{opacity:1}56%,100%{opacity:0}}',
    '.glint{animation:glint 1.5s steps(1) infinite}@keyframes glint{50%{opacity:0}}',
  ])
  const look =
    `<rect x="${0.5 * U}" y="${-2.3 * U}" width="${10 * U}" height="${1.6 * U}" rx="1.5" fill="#FAFAF8" stroke="#C3C7CF" stroke-width=".4"/>` +
    pf('#1C1C1E', px(1.2, -0.8, 8.6, 0.7), px(2, -0.15, 7, 0.45)) +
    pf(GOLDEN, px(4.8, -1, 1.4, 0.9), px(2, -0.15, 7, 0.18)) +
    eyes +
    pf('#FAFAF8', px(1, 3, 9, 2), px(0, 2), px(10, 2)) +
    pf(GOLDEN, px(4, 3, 3, 0.3), px(5.4, 3.6, 0.3, 0.3), px(5.4, 4.3, 0.3, 0.3), px(-0.2, 1.6, 1.6, 0.6), px(9.6, 1.6, 1.6, 0.6), px(7.4, 3.7, 0.8, 0.8)) +
    pf(RED, px(2, 3.5, 0.5, 0.4)) + pf('#1F3A68', px(2.5, 3.5, 0.5, 0.4), px(7.5, 3.4, 0.6, 0.3)) + pf(GOLDEN, px(3, 3.5, 0.5, 0.4)) + pf('#2E8B57', px(3.5, 3.5, 0.5, 0.4)) +
    `<rect class="glint" x="${7.5 * U}" y="${3.75 * U}" width=".7" height=".7" fill="#FFF6D8"/>` +
    `<g class="salute" fill="${ORANGE}">${px(9.6, -0.6, 1.1, 1.3)}${px(10.2, 0.6, 0.8, 1.4)}</g>`
  // Two poles: the Stars and Stripes and the Maple Leaf, flying side by side.
  const pole = (x: number) => `<rect x="${x - 3.5}" y="27" width="8" height="2.5" fill="#8A8580"/><rect x="${x - 0.6}" y="1" width="1.2" height="26" fill="#B8B3AA"/><circle cx="${x}" cy="1" r="1" fill="${GOLDEN}"/>`
  // 13 stripes, 1px each, red top and bottom; the canton spans the top seven with rows of stars.
  const stars = [0, 1, 2, 3, 4, 5].flatMap(r => [0, 1, 2, 3].map(c => `<rect x="${51.1 + c * 1.8 + (r % 2) * 0.9}" y="${2.4 + r * 1.1}" width=".5" height=".5" fill="#FFFFFF"/>`)).join('')
  const usa = `<g class="flag"><rect x="50.6" y="2" width="19" height="13" fill="#FFFFFF"/>${Array.from({ length: 7 }, (_, k) => `<rect x="50.6" y="${2 + k * 2}" width="19" height="1" fill="#B22234"/>`).join('')}<rect x="50.6" y="2" width="8" height="7" fill="#3C3B6E"/>${stars}</g>`
  // Red, white, red in 1:2:1, the eleven-point maple leaf in the middle.
  const leaf = 'M84.5 4.2L85.3 5.8 86.1 5.4 85.8 7.4 87.1 6.2 87.5 7 88.7 6.8 88.2 8.3 88.8 8.6 86.8 10.3 87 11 84.8 10.7 84.8 12.8 84.2 12.8 84.2 10.7 82 11 82.2 10.3 80.2 8.6 80.8 8.3 80.3 6.8 81.5 7 81.9 6.2 83.2 7.4 82.9 5.4 83.7 5.8Z'
  const canada = `<g class="flag"><rect x="74.6" y="2" width="20" height="13" fill="#FFFFFF"/><rect x="74.6" y="2" width="5" height="13" fill="#D52B1E"/><rect x="89.6" y="2" width="5" height="13" fill="#D52B1E"/><path d="${leaf}" fill="#D52B1E"/></g>`
  const flag = `${pole(50)}${pole(74)}${usa}${canada}`
  return svg(style, `${floor()}${flag}${standing(look)}`)
}

export function pilotSvg(): string {
  // Leather cap and goggles, flying a biplane through passing clouds; the propeller spins.
  const style = css([
    blinkEyes,
    '.fly{animation:bob 2s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}',
    '.prop{transform-box:fill-box;transform-origin:50% 50%;animation:prop .12s linear infinite}@keyframes prop{50%{transform:scaleY(.15)}}',
    '.cloud{animation:drift 4s linear infinite}.cloud.b{animation-delay:-2s}@keyframes drift{from{transform:translateX(30px)}to{transform:translateX(-80px)}}',
    '.scarf{transform-box:fill-box;transform-origin:100% 50%;animation:scarf .3s steps(1) infinite}@keyframes scarf{50%{transform:skewY(-10deg) scaleX(.85)}}',
  ])
  const look =
    `<rect x="${0.5 * U}" y="${-1.6 * U}" width="${10 * U}" height="${1.9 * U}" rx="2" fill="#6B4226"/>` +
    pf('#6B4226', px(0, 0.2, 1, 2), px(10, 0.2, 1, 2)) +
    pf('#2E2E30', px(1.6, -0.9, 7.8, 0.4)) + pf('#E8B04B', px(2.2, -1.1, 2, 0.8), px(6.8, -1.1, 2, 0.8)) +
    eyes + pf(RED, px(1, 3, 9, 0.7))
  const scarf = `<g class="scarf"><path d="M4 20.5L-4 19 -3 22.5Z" fill="${RED}"/></g>`
  const plane =
    `<rect x="9" y="12" width="30" height="1.8" rx=".8" fill="#E8E2D4"/><rect x="14" y="13.8" width="1" height="7" fill="#8A8580"/><rect x="32" y="13.8" width="1" height="7" fill="#8A8580"/>` +
    `<path d="M-2 20H44Q49 21.5 44 27H4L-2 22Z" fill="#2F6FB0"/><path d="M-2 20L-6 13H-1L4 20Z" fill="#2F6FB0"/>` +
    `<rect x="6" y="25" width="34" height="1.8" rx=".8" fill="#E8E2D4"/><rect x="2" y="22.5" width="40" height=".8" fill="#E8E2D4" opacity=".6"/>` +
    `<circle cx="47" cy="23.5" r="1.4" fill="#5A5550"/><rect class="prop" x="46.4" y="16.5" width="1.4" height="14" rx=".7" fill="#C9C4BC"/>` +
    `<circle cx="22" cy="28.6" r="1.4" fill="#2E2E30"/><rect x="21.5" y="26.5" width="1" height="2" fill="#5A5550"/>`
  const clouds = `<g class="cloud"><g fill="#FFFFFF" opacity=".85"><ellipse cx="70" cy="7" rx="6" ry="2.6"/><ellipse cx="74" cy="5.5" rx="4" ry="2.6"/></g></g><g class="cloud b"><g fill="#FFFFFF" opacity=".7"><ellipse cx="80" cy="16" rx="5" ry="2"/><ellipse cx="83" cy="14.8" rx="3" ry="2"/></g></g>`
  return svg(style, `${clouds}<g class="fly">${scarf}${standing(look, true)}${plane}</g>`)
}

export function dartsSvg(): string {
  // Marc: at the oche in the pub, throwing darts. 2.6s loop: the arm draws back, snaps forward,
  // the dart arcs across and sticks in the board, then the next one is in his claw again.
  const style = css([
    blinkEyes,
    '.arm{transform-box:view-box;transform-origin:31px 17.5px;animation:arm 2.6s infinite}',
    '@keyframes arm{0%,12%{transform:rotate(0)}26%{transform:rotate(-38deg);animation-timing-function:ease-in}32%{transform:rotate(18deg)}44%,100%{transform:rotate(0)}}',
    '.dart{animation:dart 2.6s infinite}',
    '@keyframes dart{0%,12%{transform:translate(35px,16.5px);opacity:1}26%{transform:translate(32px,13px)}32%{transform:translate(36px,15px);animation-timing-function:linear}' +
      '38%{transform:translate(57px,9.5px);animation-timing-function:linear}44%,86%{transform:translate(79.5px,12px);opacity:1}92%{transform:translate(79.5px,12px);opacity:0}93%{transform:translate(35px,16.5px);opacity:0}100%{transform:translate(35px,16.5px);opacity:1}}',
    '.thud{transform-box:fill-box;transform-origin:50% 50%;animation:thud 2.6s infinite}',
    '@keyframes thud{0%,43%,52%,100%{transform:scale(1)}46%{transform:scale(1.04)}}',
  ])
  // Board on the wall at (83, 12.5): black rim, cream and black wedges, red and green rings, the bull.
  const cx = 83
  const cy = 12.5
  const ring = (r: number, w: number, a: string, b: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${a}" stroke-width="${w}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${b}" stroke-width="${w}" stroke-dasharray="${((2 * Math.PI * r) / 20).toFixed(3)}" />`
  const board =
    `<rect x="${cx - 12}" y="0" width="24" height="25" rx="1.5" fill="#3B2A1E"/>` +
    `<g class="thud"><circle cx="${cx}" cy="${cy}" r="10.6" fill="#1E1E22"/>` +
    ring(4.5, 9, '#F1E6C8', '#1E1E22') +
    ring(8.7, 1.2, '#C8102E', '#1F7A44') +
    ring(5.1, 1, '#C8102E', '#1F7A44') +
    `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#1F7A44"/><circle cx="${cx}" cy="${cy}" r=".8" fill="#C8102E"/>` +
    // Two darts from earlier throws, already in the board.
    `<g transform="translate(${cx - 2} ${cy + 4}) rotate(-8)"><rect x="-5" y="-.5" width="3.6" height="1" fill="#3A3A3E"/><path d="M-5 0L-7.5 -1.6V1.6Z" fill="#2F6FB0"/></g>` +
    `<g transform="translate(${cx + 1.5} ${cy - 3.5}) rotate(6)"><rect x="-5" y="-.5" width="3.6" height="1" fill="#3A3A3E"/><path d="M-5 0L-7.5 -1.6V1.6Z" fill="#2F6FB0"/></g></g>`
  const oche = `<rect x="0" y="29.2" width="40" height=".8" fill="#C9A227"/><rect x="40" y="29.4" width="56" height=".6" fill="#8A8580" opacity=".5"/>`
  const arm = `<g class="arm"><rect x="31" y="16.9" width="4.5" height="1.3" rx=".6" fill="${ORANGE}"/></g>`
  const dart = `<g class="dart"><path d="M1.6 0L0 -.45V.45Z" fill="#D8D4CC"/><rect x="-4" y="-.55" width="4" height="1.1" rx=".4" fill="#3A3A3E"/><rect x="-5.4" y="-.25" width="1.6" height=".5" fill="#8A8580"/><path d="M-5 0L-8 -2V2Z" fill="#D9482B"/></g>`
  return svg(style, `${board}${oche}${standing(eyes)}${arm}${dart}`)
}

// The pencil's path round the house outline: [% of the loop, arm angle in degrees, arm length].
// Each row puts the pencil tip (arm length + 3) on a corner, timed by the outline's length.
const REACH: [number, number, number][] = [[0, 9.1, 9.7], [10.9, -17.7, 10.1], [24.1, -23.4, 17.2], [37.2, -9.3, 21.8], [48.1, 4.7, 21.6], [70, 9.1, 9.7], [100, 9.1, 9.7]]

export function architectSvg(): string {
  // Beret and round glasses at a blueprint pulled down over the blackboard. It already carries a floor plan
  // in white (rooms, a door swing, dimension lines); his pencil draws the house's front onto it.
  const style = css([
    blinkEyes,
    // Arm, pencil and line share one clock. The arm turns about his shoulder and stretches so
    // the pencil tip, always in his claw, lands on each corner of the house as the stroke reaches it.
    '.draw{stroke-dasharray:39;animation:draw 4s linear infinite -1.6s}@keyframes draw{0%{stroke-dashoffset:39}70%,100%{stroke-dashoffset:0}}',
    `.reach{transform-box:view-box;transform-origin:31.5px 19px;animation:reach 4s linear infinite -1.6s}@keyframes reach{${REACH.map(([t, a]) => `${t}%{transform:rotate(${a}deg)}`).join('')}}`,
    `.arm{transform-box:view-box;transform-origin:31.5px 19px;animation:arm 4s linear infinite -1.6s}@keyframes arm{${REACH.map(([t, , l]) => `${t}%{transform:scaleX(${(l / 10).toFixed(3)})}`).join('')}}`,
    `.pen{animation:pen 4s linear infinite -1.6s}@keyframes pen{${REACH.map(([t, , l]) => `${t}%{transform:translateX(${l}px)}`).join('')}}`,
  ])
  const look =
    `<rect x="${1 * U}" y="${-1.4 * U}" width="${9 * U}" height="${1.6 * U}" rx="2" fill="#2B2B2E" stroke="#6A6A70" stroke-width=".5"/>` + pf('#2B2B2E', px(5.2, -1.9, 0.6, 0.6)) +
    pf('#2B2B2E', px(1, 3, 9, 2)) +
    eyes +
    `<g fill="none" stroke="#C9A227" stroke-width=".55"><rect x="${2.4 * U}" y="${0.6 * U}" width="${2.2 * U}" height="${2.6 * U}" rx="1.4"/><rect x="${6.4 * U}" y="${0.6 * U}" width="${2.2 * U}" height="${2.6 * U}" rx="1.4"/><path d="M${4.6 * U} ${1.6 * U}H${6.4 * U}"/></g>`
  const W_ = '#FFFFFF'
  const plan =
    // The floor plan on the right of the sheet: outer walls, two inner walls, a door swing, a window.
    `<g fill="none" stroke="${W_}" stroke-opacity=".8" stroke-width=".6"><rect x="62" y="9" width="18" height="12"/><path d="M71 9V15M71 18V21M62 15H67"/>` +
    `<path d="M67 15A3 3 0 0 1 70 18" stroke-dasharray="1 .7"/><path d="M74 21h4" stroke-width="1.2"/></g>` +
    // Dimension lines with end ticks, and a few label marks.
    `<g stroke="${W_}" stroke-opacity=".7" stroke-width=".35"><path d="M62 7H80M62 6V8M80 6V8M82 9V21M81 9H83M81 21H83"/></g>` +
    `<g fill="${W_}" fill-opacity=".7"><rect x="70" y="6.4" width="2" height=".5"/><rect x="65" y="11.5" width="3" height=".5"/><rect x="74" y="11.5" width="3" height=".5"/></g>` +
    // Title block in the corner.
    `<rect x="72" y="22.2" width="10" height="1.4" fill="none" stroke="${W_}" stroke-opacity=".6" stroke-width=".3"/>`
  // The house front he is drawing, on the left of the sheet where his pencil reaches.
  const house = `<path class="draw" d="M44 21V15L50 11 56 15V21Z" fill="none" stroke="${W_}" stroke-width=".7"/>`
  const grid = `<g stroke="#DCEBFA" stroke-opacity=".18" stroke-width=".3">${[10, 14, 18, 22].map(y => `<path d="M40 ${y}H84"/>`).join('')}${[48, 56, 64, 72, 80].map(x => `<path d="M${x} 6V24"/>`).join('')}</g>`
  // A blackboard on the wall, and the blueprint pulled down over it from a roller at the top,
  // with a weighted bar and a pull cord at the bottom.
  const board =
    `<rect x="36" y="1" width="54" height="26" rx="1" fill="#8B5A2B"/><rect x="37.5" y="2.5" width="51" height="23" fill="#24372E"/>` +
    `<path d="M84 21q1.5-1 3 0M38.6 22.5h3" stroke="#E8E6DF" stroke-opacity=".5" stroke-width=".4" fill="none"/>` +
    `<rect x="35" y="26.6" width="56" height="1.2" fill="#6B4226"/><rect x="40" y="25.9" width="3" height=".7" fill="#F4F3EE"/><rect x="46" y="25.9" width="2" height=".7" fill="#F5C542"/>`
  const sheet =
    `<rect x="39" y="3" width="48" height="2" rx="1" fill="#9AA0A8"/><rect x="38.4" y="3.2" width="1.4" height="1.6" fill="#5A5F66"/><rect x="86.2" y="3.2" width="1.4" height="1.6" fill="#5A5F66"/>` +
    `<rect x="40" y="5" width="44" height="20" fill="#2F6FB0"/>${grid}${plan}${house}` +
    `<rect x="39.5" y="24.6" width="45" height="1.2" rx=".6" fill="#1E4F86"/><path d="M62 25.8V27.6" stroke="#CFCBC2" stroke-width=".35"/><circle cx="62" cy="28.2" r=".6" fill="none" stroke="#CFCBC2" stroke-width=".35"/>`
  const table = `${board}${sheet}`
  // The arm from his right nub (shoulder at 31.5, 19), the claw at its end, the pencil in the claw
  // with its tip 3px past the claw, on the sheet.
  const pencil =
    `<g class="reach"><rect class="arm" x="31.5" y="18.3" width="10" height="1.4" fill="${ORANGE}"/>` +
    `<g class="pen"><rect x="30.9" y="17.7" width="1.8" height="2.6" fill="${ORANGE}"/><rect x="28.6" y="18.4" width="4.6" height="1.2" fill="#F5C542"/><rect x="28.2" y="18.4" width=".8" height="1.2" fill="#E88FA0"/><path d="M33.2 18.4L34.5 19 33.2 19.6Z" fill="#E8C9A0"/></g></g>`
  return svg(style, `${floor()}${table}${standing(look)}${pencil}`)
}

// The space suit (Marc): white suit over body, arms and legs, grey boots, and a helmet that takes
// in his whole head, with a neck ring, a glint and an antenna light.
const SUIT =
  pf('#EEF0F4', px(1, 2.6, 9, 2.4), px(0, 2), px(10, 2), px(2, 5, 1, 2), px(4, 5, 1, 2), px(6, 5, 1, 2), px(8, 5, 1, 2)) +
  pf('#9AA0A8', px(2, 6.4, 1, 0.6), px(4, 6.4, 1, 0.6), px(6, 6.4, 1, 0.6), px(8, 6.4, 1, 0.6)) +
  pf('#7F77DD', px(4.5, 3.3, 2, 0.9)) + pf('#CE102C', px(2, 3.3, 0.8, 0.5)) +
  eyes +
  `<rect x="${0.3 * U}" y="${-2 * U}" width="${10.4 * U}" height="${4.8 * U}" rx="${2.2 * U}" fill="#A9D6F5" fill-opacity=".22" stroke="#EEF0F4" stroke-width="1.2"/>` +
  `<rect x="${0.6 * U}" y="${2.5 * U}" width="${9.8 * U}" height="${0.5 * U}" rx=".6" fill="#9AA0A8"/>` +
  `<path d="M${1.6 * U} ${-0.6 * U}q.6-1.6 2.6-2" stroke="#FFFFFF" stroke-width=".9" fill="none" opacity=".85"/>` +
  `<rect x="${5.3 * U}" y="${-3.2 * U}" width=".8" height="${1.2 * U}" fill="#C9CCD2"/><circle class="ant" cx="${5.45 * U}" cy="${-3.4 * U}" r="1.1" fill="#7F77DD"/>`

// The suited Clawd, shrunk and centred on (cx, cy); his bounding box runs from the antenna to the boots.
const astronaut = (cx: number, cy: number, scale: number) =>
  `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-17.75 -19.5)">${standing(SUIT)}</g>`

const twinkle = '.star{animation:tw 1.6s ease-in-out infinite}.star.b{animation-delay:-.5s}.star.c{animation-delay:-1s}@keyframes tw{0%,100%{opacity:.35}50%{opacity:1}}.ant{animation:tw .8s steps(1) infinite}'

// The Moon (Marc): grey, shaded to one side, with a few craters. It hangs over the Earth scene.
const moon = (cx: number, cy: number, r: number) =>
  `<radialGradient id="moonShade" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#EDEDE8"/><stop offset=".7" stop-color="#B9B8B2"/><stop offset="1" stop-color="#7D7C78"/></radialGradient>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#moonShade)"/>` +
  [[-0.35, -0.2, 0.22], [0.3, 0.25, 0.18], [0.05, 0.45, 0.12], [-0.1, -0.5, 0.1], [0.45, -0.3, 0.1]]
    .map(([dx, dy, k]) => `<circle cx="${(cx + dx * r).toFixed(2)}" cy="${(cy + dy * r).toFixed(2)}" r="${(k * r).toFixed(2)}" fill="#9C9B95" stroke="#C9C8C2" stroke-width=".25"/>`).join('')

// Mars (Marc): rust red, shaded to one side, darker regions and a white polar cap.
const mars = (cx: number, cy: number, r: number) =>
  `<radialGradient id="marsShade" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#E8885A"/><stop offset=".65" stop-color="#C1532E"/><stop offset="1" stop-color="#7A2E17"/></radialGradient>` +
  `<clipPath id="marsClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#marsShade)"/>` +
  `<g clip-path="url(#marsClip)" fill="#8E3A1F" opacity=".55"><ellipse cx="${cx - r * 0.2}" cy="${cy + r * 0.1}" rx="${r * 0.45}" ry="${r * 0.18}"/><ellipse cx="${cx + r * 0.35}" cy="${cy + r * 0.45}" rx="${r * 0.3}" ry="${r * 0.14}"/><ellipse cx="${cx + r * 0.1}" cy="${cy - r * 0.35}" rx="${r * 0.25}" ry="${r * 0.1}"/>` +
  `<ellipse cx="${cx}" cy="${cy - r * 0.92}" rx="${r * 0.45}" ry="${r * 0.18}" fill="#F4F1EC" opacity="1"/></g>`

export function astronautSvg(): string {
  // At the window of a Starship-style ship bound for Mars. Stainless hull with a cylindrical sheen,
  // black heat-shield tiles on the belly, forward and aft flaps swept back and trimming, grid fins
  // that tilt to steer, RCS thrusters puffing cold gas, three engines firing.
  const style = css([
    blinkEyes,
    twinkle,
    '.ship{transform-box:fill-box;transform-origin:50% 50%;animation:pitch 3s ease-in-out infinite}@keyframes pitch{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-.8px) rotate(-1.2deg)}70%{transform:translateY(.6px) rotate(1deg)}}',
    '.flame{transform-box:fill-box;transform-origin:100% 50%;animation:flame .18s steps(1) infinite}@keyframes flame{50%{transform:scaleX(.62)}}',
    '.stars{animation:stars 6s linear infinite}@keyframes stars{from{transform:translateX(0)}to{transform:translateX(-48px)}}',
    '.bob{animation:bob 2.4s ease-in-out infinite}@keyframes bob{0%,100%{transform:translate(0,.4px)}50%{transform:translate(.3px,-.6px)}}',
    // Flaps trim with the pitch; grid fins tilt the other way; RCS puffs fire in turn.
    '.flapT{transform-box:fill-box;transform-origin:50% 100%;animation:flapT 3s ease-in-out infinite}@keyframes flapT{0%,100%{transform:rotate(0)}30%{transform:rotate(-8deg)}70%{transform:rotate(6deg)}}',
    '.flapB{transform-box:fill-box;transform-origin:50% 0%;animation:flapB 3s ease-in-out infinite}@keyframes flapB{0%,100%{transform:rotate(0)}30%{transform:rotate(8deg)}70%{transform:rotate(-6deg)}}',
    '.grid{transform-box:fill-box;transform-origin:50% 100%;animation:grid 3s ease-in-out infinite}@keyframes grid{0%,100%{transform:skewX(0)}30%{transform:skewX(18deg)}70%{transform:skewX(-14deg)}}',
    '.gridB{transform-box:fill-box;transform-origin:50% 0%;animation:gridB 3s ease-in-out infinite}@keyframes gridB{0%,100%{transform:skewX(0)}30%{transform:skewX(-18deg)}70%{transform:skewX(14deg)}}',
    '.rcs{opacity:0;animation:rcs 3s infinite}.rcs.b{animation-delay:-1.5s}@keyframes rcs{0%,22%{opacity:0;transform:translate(0,0) scale(.4)}26%{opacity:.9}36%{opacity:0;transform:translate(0,-3px) scale(1.4)}100%{opacity:0}}',
    '.rcsB{opacity:0;animation:rcsB 3s infinite -1.5s}@keyframes rcsB{0%,22%{opacity:0;transform:translate(0,0) scale(.4)}26%{opacity:.9}36%{opacity:0;transform:translate(0,3px) scale(1.4)}100%{opacity:0}}',
  ])
  const field = [[50, 3, ''], [58, 27, 'b'], [64, 2, 'c'], [74, 27, 'b'], [86, 27, 'c'], [94, 3, ''], [94, 20, 'b']]
  const stars = `<g class="stars">${[0, 48].map(dx => field.map(([x, y, k]) => `<circle class="star ${k}" cx="${Number(x) + dx}" cy="${y}" r=".6" fill="#F5E9B8"/>`).join('')).join('')}</g>`
  const WIN = { x: 45, y: 12.6, r: 3.8 }
  const defs =
    `<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2F4F7"/><stop offset=".35" stop-color="#CDD1D7"/><stop offset=".7" stop-color="#9EA4AC"/><stop offset="1" stop-color="#7C828A"/></linearGradient>` +
    `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34373C"/><stop offset="1" stop-color="#16181B"/></linearGradient>` +
    `<linearGradient id="bell" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#6B6F76"/><stop offset="1" stop-color="#2B2E33"/></linearGradient>` +
    `<radialGradient id="plume" cx="100%" cy="50%" r="100%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#BFE3FF"/><stop offset="1" stop-color="#5AA9F0" stop-opacity="0"/></radialGradient>` +
    `<pattern id="hex" width="1.6" height="1.4" patternUnits="userSpaceOnUse"><circle cx=".8" cy=".7" r=".28" fill="#4A4E55"/></pattern>`
  const gridFin = (x: number, y: number, cls: string) =>
    `<g class="${cls}"><rect x="${x}" y="${y}" width="4" height="3" fill="none" stroke="#8E949C" stroke-width=".45"/>` +
    `<path d="M${x + 1.33} ${y}V${y + 3}M${x + 2.66} ${y}V${y + 3}M${x} ${y + 1}H${x + 4}M${x} ${y + 2}H${x + 4}" stroke="#8E949C" stroke-width=".3"/></g>`
  const ship =
    defs +
    // Engine plumes and bells.
    `<g class="flame">${[12, 15, 18].map(y => `<ellipse cx="-1" cy="${y}" rx="6" ry="1.3" fill="url(#plume)"/>`).join('')}</g>` +
    [12, 15, 18].map(y => `<path d="M2.5 ${y - 1.3}L6 ${y - 0.8}V${y + 0.8}L2.5 ${y + 1.3}Z" fill="url(#bell)"/>`).join('') +
    // Aft flaps and forward flaps, all swept back toward the tail, trimming as she flies.
    `<g class="flapT"><path d="M8 9L5 2.4H12.5L17 9Z" fill="#2E3136" stroke="#555A61" stroke-width=".3"/></g><g class="flapB"><path d="M8 21L5 27.6H12.5L17 21Z" fill="#2E3136" stroke="#555A61" stroke-width=".3"/></g>` +
    `<g class="flapT"><path d="M50 9.3L47.5 5.2H52L56.5 9.3Z" fill="#2E3136" stroke="#555A61" stroke-width=".3"/></g><g class="flapB"><path d="M50 20.7L47.5 24.8H52L56.5 20.7Z" fill="#2E3136" stroke="#555A61" stroke-width=".3"/></g>` +
    // Grid fins on the sides amidships.
    gridFin(26, 6, 'grid') + gridFin(26, 21, 'gridB') +
    // Hull: steel barrel and ogive nose, heat tiles on the belly, ring welds, a raceway along the top.
    `<path d="M6 9H52Q62 9.5 66 15Q62 20.5 52 21H6Z" fill="url(#steel)" stroke="#7C828A" stroke-width=".4"/>` +
    `<path d="M6 15.4H65.8Q62 20.5 52 21H6Z" fill="url(#tile)"/><path d="M6 15.4H65.8Q62 20.5 52 21H6Z" fill="url(#hex)"/>` +
    `<g stroke="#FFFFFF" stroke-opacity=".35" stroke-width=".25">${[10, 14, 18, 22, 30, 34, 38, 42, 50].map(x => `<path d="M${x} 9.2V15.3"/>`).join('')}</g>` +
    `<rect x="9" y="9.6" width="40" height=".6" fill="#B4B9C0"/>` +
    // RCS thrusters near the nose and tail, puffing cold gas.
    `<rect x="53" y="9.4" width="1" height=".6" fill="#555A61"/><rect x="11" y="9.4" width="1" height=".6" fill="#555A61"/><rect x="53" y="20.1" width="1" height=".6" fill="#555A61"/>` +
    `<g fill="#FFFFFF"><circle class="rcs" cx="53.5" cy="8.6" r="1"/><circle class="rcs b" cx="11.5" cy="8.6" r="1"/><circle class="rcsB" cx="53.5" cy="21.4" r="1"/></g>` +
    // The window: cabin, the suited Clawd floating whole inside, glass, rim and a glint.
    `<clipPath id="win"><circle cx="${WIN.x}" cy="${WIN.y}" r="${WIN.r}"/></clipPath>` +
    `<circle cx="${WIN.x}" cy="${WIN.y}" r="${WIN.r}" fill="#1C2433"/>` +
    `<g clip-path="url(#win)"><g class="bob">${astronaut(WIN.x, WIN.y + 0.3, 0.23)}</g></g>` +
    `<circle cx="${WIN.x}" cy="${WIN.y}" r="${WIN.r}" fill="#A9D6F5" fill-opacity=".15" stroke="#5A5F66" stroke-width=".9"/>` +
    `<path d="M${WIN.x - 2.2} ${WIN.y - 1.4}q.7-1.4 2.2-1.7" stroke="#FFFFFF" stroke-width=".45" fill="none" opacity=".8"/>`
  return svg(style, `${stars}${mars(85, 13, 7)}<g class="ship">${ship}</g>`)
}

export function shuttleSvg(): string {
  // The orbiter alone from above over the Earth, the Moon beyond, cargo bay doors open, the Canadarm reaching out of the
  // bay; a tiny tethered Clawd in his suit works on the wing with a wrench. Now and then a UFO
  // zips across the top.
  const style = css([
    blinkEyes,
    twinkle,
    '.clouds{animation:clouds 14s linear infinite}@keyframes clouds{to{transform:translateX(-40px)}}',
    '.walk{animation:walk 3s ease-in-out infinite}@keyframes walk{0%,100%{transform:translate(0,0) rotate(0)}50%{transform:translate(.6px,-.8px) rotate(-3deg)}}',
    '.wrench{transform-box:fill-box;transform-origin:0% 50%;animation:wrench .8s ease-in-out infinite}@keyframes wrench{50%{transform:rotate(-35deg)}}',
    '.glint{animation:glint .8s steps(1) infinite}@keyframes glint{50%{opacity:0}}',
    '.arm{transform-box:view-box;transform-origin:73px 11.6px;animation:arm 6s ease-in-out infinite}@keyframes arm{0%,100%{transform:rotate(0)}50%{transform:rotate(-2.5deg)}}',
    '.ufo{animation:ufo 14s linear infinite}@keyframes ufo{0%,84%{transform:translate(-20px,0)}92%{transform:translate(60px,-1.5px)}100%{transform:translate(130px,1px)}}',
    '.ufoLight{animation:glint .25s steps(1) infinite}',
  ])
  const stars = [[24, 3, ''], [28, 9, 'b'], [32, 2, 'c'], [90, 3, 'b'], [94, 9, '']].map(([x, y, k]) => `<circle class="star ${k}" cx="${x}" cy="${y}" r=".6" fill="#F5E9B8"/>`).join('')
  // Earth: deep-blue ocean shading to the limb, land, drifting cloud bands, a soft atmosphere glow.
  const earth =
    `<radialGradient id="ocean" cx="45%" cy="100%" r="100%"><stop offset="0" stop-color="#3D86D1"/><stop offset=".8" stop-color="#1F5C9E"/><stop offset="1" stop-color="#16467A"/></radialGradient>` +
    `<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset=".93" stop-color="#9CCBF0" stop-opacity=".9"/><stop offset="1" stop-color="#9CCBF0" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="earth"><circle cx="48" cy="118" r="102"/></clipPath>` +
    `<circle cx="48" cy="118" r="108" fill="url(#glow)"/><circle cx="48" cy="118" r="102" fill="url(#ocean)"/>` +
    `<g clip-path="url(#earth)"><path d="M6 23Q14 18 22 20T34 22 42 25 46 30H4Z" fill="#4E8A4F"/><path d="M14 24q4-1.5 7 0" stroke="#3B6E3D" stroke-width=".6" fill="none"/>` +
    `<path d="M60 20Q68 16.5 76 19T90 18V30H63Z" fill="#B49A62"/><path d="M70 22q5-1 9 .5" stroke="#9C8250" stroke-width=".6" fill="none"/>` +
    `<g class="clouds" fill="#FFFFFF" opacity=".85">${[0, 40].map(dx => `<ellipse cx="${20 + dx}" cy="22" rx="6" ry="1.1"/><ellipse cx="${34 + dx}" cy="26" rx="5" ry=".9"/><ellipse cx="${52 + dx}" cy="21" rx="4" ry=".9"/><ellipse cx="${70 + dx}" cy="25" rx="7" ry="1.1"/>`).join('')}</g></g>`
  // The orbiter seen from above, nose right.
  const orbiter =
    // Delta wings with black leading edges and elevons along the trailing edge.
    `<path d="M70 12L52 2.5H47L46 12Z" fill="#F4F4F2" stroke="#B8BCC2" stroke-width=".3"/><path d="M70 18L52 27.5H47L46 18Z" fill="#F4F4F2" stroke="#B8BCC2" stroke-width=".3"/>` +
    `<path d="M52 2.5L70 12" stroke="#1F1F22" stroke-width="1.1"/><path d="M52 27.5L70 18" stroke="#1F1F22" stroke-width="1.1"/>` +
    `<path d="M47.6 3.5V11M47.6 19V26.5" stroke="#9AA0A8" stroke-width=".35" stroke-dasharray="2 .6"/>` +
    // Fuselage, black nose cap and cockpit windows.
    `<path d="M42 11H80Q87 11.4 90 15Q87 18.6 80 19H42Z" fill="#F4F4F2" stroke="#9AA0A8" stroke-width=".4"/>` +
    `<path d="M85 12.2Q88.6 13.4 90 15Q88.6 16.6 85 17.8Z" fill="#1F1F22"/>` +
    `<g fill="#1F1F22"><rect x="80" y="13.2" width="1.4" height="1"/><rect x="80" y="15.8" width="1.4" height="1"/><rect x="81.8" y="14" width="1.2" height="2"/></g>` +
    // Bay doors open on either side, their radiator panels ribbed; the bay with payload inside.
    `<rect x="54" y="6.6" width="20" height="3.6" fill="#DCE3EA" stroke="#9AA0A8" stroke-width=".3"/><rect x="54" y="19.8" width="20" height="3.6" fill="#DCE3EA" stroke="#9AA0A8" stroke-width=".3"/>` +
    `<g stroke="#B6C2CE" stroke-width=".25">${[57, 60, 63, 66, 69, 72].map(x => `<path d="M${x} 6.8V10M${x} 20V23.2"/>`).join('')}</g>` +
    `<rect x="54" y="11.6" width="20" height="6.8" fill="#8E949C"/><rect x="58" y="12.8" width="5" height="4.4" fill="#C9A227"/><rect x="65" y="13.4" width="6" height="3.2" fill="#E6E8EE"/><path d="M58 15h5" stroke="#9C7E1C" stroke-width=".3"/>` +
    // Tail: vertical fin seen edge-on, OMS pods, the three main engines.
    `<rect x="38" y="14.4" width="10" height="1.2" fill="#2B2B2E"/>` +
    `<path d="M42 11.4H48Q49 12.6 48 13.8H42Z" fill="#E6E8EE" stroke="#9AA0A8" stroke-width=".3"/><path d="M42 16.2H48Q49 17.4 48 18.6H42Z" fill="#E6E8EE" stroke="#9AA0A8" stroke-width=".3"/>` +
    [12.8, 15, 17.2].map(y => `<circle cx="42" cy="${y}" r="1" fill="#4A4E55" stroke="#2B2B2E" stroke-width=".3"/>`).join('') +
    `<circle class="glint" cx="49.5" cy="5" r=".8" fill="#FFF6D8"/>`
  // The Canadarm: shoulder at the front of the bay, upper boom out over the wing, elbow, lower boom
  // back to the wrist and end effector beside Clawd.
  const canadarm =
    `<g class="arm"><path d="M73 11.6L58 1.8" stroke="#F4F4F2" stroke-width="1.5" stroke-linecap="round"/><path d="M73 11.6L58 1.8" stroke="#B8BCC2" stroke-width=".3" stroke-dasharray="1 3"/>` +
    `<path d="M58 1.8L46.2 5.8" stroke="#F4F4F2" stroke-width="1.3" stroke-linecap="round"/>` +
    `<circle cx="73" cy="11.6" r="1.1" fill="#4A4E55"/><circle cx="58" cy="1.8" r="1" fill="#4A4E55"/><rect x="44.4" y="5" width="2.4" height="1.6" rx=".4" fill="#4A4E55"/></g>`
  // The spacewalker: tether from the bay to his belt, wrench at the wing panel.
  const walker =
    `<g class="walk"><path d="M54 11Q46 15 40.5 9.6" stroke="#F5C542" stroke-width=".35" fill="none"/>` +
    astronaut(38, 8, 0.24) +
    `<g class="wrench"><rect x="42" y="7.2" width="4" height=".7" fill="#8E959C"/><path d="M46 6.8h1.2v.5h-.6v.6h.6v.5H46Z" fill="#8E959C"/></g></g>`
  // The Easter egg: a little saucer with a dome and blinking lights.
  const ufo =
    `<g class="ufo"><ellipse cx="0" cy="4" rx="3.2" ry=".9" fill="#9AA0A8"/><path d="M-1.4 3.6Q0 1.6 1.4 3.6Z" fill="#9FE6B8" fill-opacity=".8"/>` +
    `<g class="ufoLight"><circle cx="-2" cy="4.2" r=".3" fill="#FFE08A"/><circle cx="0" cy="4.5" r=".3" fill="#FF6B6B"/><circle cx="2" cy="4.2" r=".3" fill="#FFE08A"/></g></g>`
  return svg(style, `${stars}${moon(12, 7, 5)}${ufo}${earth}${orbiter}${canadarm}${walker}`)
}

export function burglarSvg(): string {
  // Night in an alley, the whole drawing (so it reads the same on any theme, and the band only
  // picks it on a dark one): a burglar in black sweeps his flashlight along the alley. The beam
  // turns with the torch in his claw; when it lands at the far end it shows a caped figure with
  // pointed ears, and a dark thought bubble with a red "!" pops over his head. 4.2s loop.
  const style = css([
    blinkEyes,
    '.sweep{transform-box:view-box;transform-origin:31.5px 19px;animation:sweep 4.2s ease-in-out infinite}',
    '@keyframes sweep{0%{transform:rotate(-13deg)}22%{transform:rotate(12deg)}42%{transform:rotate(-9deg)}56%,84%{transform:rotate(-2.3deg)}100%{transform:rotate(-13deg)}}',
    '.gasp{opacity:0;animation:gasp 4.2s steps(1) infinite}@keyframes gasp{0%,59%{opacity:0}60%,84%{opacity:1}85%,100%{opacity:0}}',
    '.flicker{animation:flicker 2.1s steps(1) infinite}@keyframes flicker{0%,100%{opacity:1}48%{opacity:.75}50%{opacity:1}}',
    '.lamp{animation:lamp 3.3s steps(1) infinite}@keyframes lamp{0%,100%{opacity:.9}62%{opacity:.35}66%{opacity:.9}}',
  ])
  // All in black: beanie, a full mask with eyeholes, top, trousers. A faint edge keeps him off the wall.
  const EDGE = 'stroke="#55565C" stroke-width=".35"'
  const look =
    `<g fill="#17181B" ${EDGE}>${px(1, 2.6, 9, 2.4)}${px(0, 2)}${px(10, 2)}${px(2, 5, 1, 2)}${px(4, 5, 1, 2)}${px(6, 5, 1, 2)}${px(8, 5, 1, 2)}</g>` +
    `<path d="M${1 * U} 0Q${1 * U} ${-2.4 * U} ${5.5 * U} ${-2.4 * U}Q${10 * U} ${-2.4 * U} ${10 * U} 0Z" fill="#17181B" ${EDGE}/>` +
    pf('#2A2B30', px(1, -0.4, 9, 0.5)) +
    `<rect x="${0.4 * U}" y="${-0.1 * U}" width="${10.2 * U}" height="${2.8 * U}" rx="1" fill="#17181B" ${EDGE}/>` +
    `<g class="eyes" fill="#FFFFFF">${px(3, 1, 1, 1)}${px(7, 1, 1, 1)}</g>`
  // The alley, edge to edge: brick back wall, a wall lamp flickering over him, the side walls
  // closing in toward the far end, wet cobbles underfoot, a bin and a fire escape.
  const alley =
    `<rect x="0" y="0" width="96" height="30" fill="#1C1E24"/>` +
    `<g stroke="#262931" stroke-width=".5">${[3, 7, 11, 15, 19, 23].map(y => `<path d="M0 ${y}H96"/>`).join('')}${[0, 1, 2, 3, 4, 5].map(r => Array.from({ length: 12 }, (_, c) => `<path d="M${2 + c * 8 + (r % 2) * 4} ${3 + r * 4}v4"/>`).join('')).join('')}</g>` +
    `<radialGradient id="lampGlow" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#FFD98A" stop-opacity=".22"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>` +
    `<path class="lamp" d="M10 1.6L-2 27H26Z" fill="url(#lampGlow)"/><rect x="8" y="0" width="4" height="1.2" fill="#3A3D44"/><rect x="8.6" y="1.2" width="2.8" height=".8" fill="#FFE7A8" class="lamp"/>` +
    `<path d="M96 0L84 5V24.5L96 30Z" fill="#121419"/><path d="M84 5L72 9V23L84 24.5Z" fill="#0F1115" opacity=".7"/>` +
    `<rect x="0" y="26" width="96" height="4" fill="#121418"/>` +
    `<g fill="#1A1D23">${[2, 9, 16, 44, 51, 58, 65].map(x => `<rect x="${x}" y="26.8" width="5" height="1" rx=".4"/>`).join('')}</g>` +
    `<ellipse cx="60" cy="28.4" rx="6" ry=".7" fill="#2A3140" opacity=".8"/>` +
    `<rect x="48" y="20.5" width="8" height="5.5" fill="#2E4A3A"/><rect x="47.5" y="19.9" width="9" height="1" fill="#24392D"/>` +
    `<g stroke="#2E3138" stroke-width=".5" fill="none"><path d="M62 4H70V11H62ZM62 7.5H70"/><path d="M64 11L68 4"/><path d="M62 11V18H70V11"/></g>`
  // The caped figure at the far end: cowl with pointed ears, broad shoulders, cape to the ground.
  // Near the wall's own colour, so the beam behind him is what shows his shape.
  const figure =
    `<path d="M78.6 9.6L79.3 7.4 79.8 9.2H81.2L81.7 7.4 82.4 9.6Q83.2 11.2 82.2 12.6L85.6 14 88 26H73L75.4 14 78.8 12.6Q77.8 11.2 78.6 9.6Z" fill="#17191E"/>` +
    `<path class="gasp" d="M79.6 10.6h.8M80.6 10.6h.8" stroke="#E8EEF5" stroke-width=".35"/>`
  // Torch and beam turn together about his claw: the beam can never leave the torch.
  const beam =
    `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF4C2" stop-opacity=".85"/><stop offset=".6" stop-color="#FFE68A" stop-opacity=".45"/><stop offset="1" stop-color="#FFE68A" stop-opacity=".12"/></linearGradient>` +
    `<g class="sweep"><path class="flicker" d="M38.6 17.7L100 9V29L38.6 20.1Z" fill="url(#beam)"/>` +
    `<rect x="30.4" y="17.6" width="6.6" height="2.6" rx=".6" fill="#3A3D44"/><rect x="36.6" y="17" width="2.2" height="3.8" rx=".5" fill="#5A5F66"/><rect x="38.6" y="17.4" width=".5" height="3" fill="#FFF4C2"/>` +
    `<rect x="30" y="17.4" width="2.4" height="3" fill="${ORANGE}"/></g>`
  // The thought bubble: dark, with a red "!", trailing two small puffs down to his head.
  const gasp =
    `<g class="gasp"><circle cx="30.5" cy="10.6" r=".8" fill="#2A2D35" stroke="#4A4E58" stroke-width=".35"/><circle cx="33" cy="8.4" r="1.2" fill="#2A2D35" stroke="#4A4E58" stroke-width=".35"/>` +
    `<rect x="34.2" y=".6" width="8.4" height="7" rx="3.5" fill="#2A2D35" stroke="#4A4E58" stroke-width=".4"/>` +
    `<rect x="37.75" y="1.7" width="1.3" height="3.2" rx=".5" fill="#E5484D"/><rect x="37.75" y="5.4" width="1.3" height="1.2" rx=".5" fill="#E5484D"/></g>`
  return svg(style, `${alley}${beam}${figure}${standing(look)}${gasp}`)
}

export function engineerSvg(): string {
  // Hard hat and hi-vis vest, turning a valve wheel on the steam line; the gauge needle jumps.
  const style = css([
    blinkEyes,
    '.wheel{transform-box:fill-box;transform-origin:50% 50%;animation:turn 2.4s ease-in-out infinite}@keyframes turn{0%,100%{transform:rotate(0)}50%{transform:rotate(120deg)}}',
    '.puff{animation:puff 1.8s ease-out infinite}.puff.b{animation-delay:-.6s}.puff.c{animation-delay:-1.2s}',
    '@keyframes puff{0%{transform:translate(0,0) scale(.4);opacity:0}25%{opacity:.85}100%{transform:translate(3px,-9px) scale(1.4);opacity:0}}',
    '.needle{transform-box:fill-box;transform-origin:0% 50%;animation:needle 2.4s ease-in-out infinite}@keyframes needle{0%,100%{transform:rotate(-30deg)}50%{transform:rotate(40deg)}}',
  ])
  const look =
    `<path d="M${0.6 * U} 0Q${0.6 * U} ${-2.4 * U} ${5.5 * U} ${-2.4 * U}Q${10.4 * U} ${-2.4 * U} ${10.4 * U} 0Z" fill="#F5C542"/>` +
    pf('#FBE08A', px(5, -2.3, 1, 2.2)) + pf('#C99A1E', px(-0.3, -0.25, 11.6, 0.5)) +
    eyes + pf('#F28C28', px(1, 3, 9, 2)) + pf('#EDEDED', px(1, 3.9, 9, 0.35))
  const pipes =
    `<rect x="36" y="22" width="60" height="3.2" fill="#8E959C"/><rect x="62" y="9" width="3.2" height="13" fill="#8E959C"/><rect x="61" y="8" width="5.2" height="1.6" fill="#6B7178"/>` +
    `<rect x="44" y="21.4" width="1.6" height="4.4" fill="#6B7178"/><rect x="80" y="21.4" width="1.6" height="4.4" fill="#6B7178"/>`
  const wheel = `<g class="wheel"><circle cx="38" cy="18.5" r="4" fill="none" stroke="${RED}" stroke-width="1.1"/><path d="M34 18.5H42M38 14.5V22.5" stroke="${RED}" stroke-width=".8"/></g><rect x="37.4" y="22" width="1.2" height="1" fill="#6B7178"/>`
  const gauge = `<circle cx="74" cy="15" r="3.6" fill="#FAFAF8" stroke="#6B7178" stroke-width=".8"/><rect class="needle" x="74" y="14.7" width="2.8" height=".6" fill="${RED}"/><rect x="73.4" y="18.6" width="1.2" height="3.4" fill="#6B7178"/>`
  const puffs = ['', 'b', 'c'].map(k => `<circle class="puff ${k}" cx="63.6" cy="6.5" r="1.8" fill="#FFFFFF"/>`).join('')
  return svg(style, `${floor()}${pipes}${gauge}${puffs}${standing(look)}${wheel}`)
}

export function chefSvg(): string {
  // Toque and apron at the stove, flipping an omelette while the pot steams.
  const style = css([
    blinkEyes,
    '.egg{transform-box:fill-box;transform-origin:50% 50%;animation:flip 1.8s ease-in-out infinite}',
    '@keyframes flip{0%,30%,100%{transform:translateY(0) scaleY(1)}55%{transform:translateY(-9px) scaleY(-1)}75%{transform:translateY(0) scaleY(-1)}}',
    '.pan{transform-box:fill-box;transform-origin:0% 50%;animation:toss 1.8s ease-in-out infinite}@keyframes toss{0%,25%,60%,100%{transform:rotate(0)}35%{transform:rotate(-8deg)}}',
    '.flame{animation:flame .3s steps(1) infinite}@keyframes flame{50%{transform:scaleY(.7);opacity:.8}}',
    '.steam{stroke-dasharray:3 3;animation:steam 1.2s linear infinite}@keyframes steam{to{stroke-dashoffset:-6}}',
  ])
  const look =
    `<g fill="#F4F3EE" stroke="#BDBAB0" stroke-width=".5"><ellipse cx="${3.5 * U}" cy="${-3 * U}" rx="${2.4 * U}" ry="${1.6 * U}"/><ellipse cx="${7.5 * U}" cy="${-3 * U}" rx="${2.4 * U}" ry="${1.6 * U}"/><ellipse cx="${5.5 * U}" cy="${-3.6 * U}" rx="${2.6 * U}" ry="${1.8 * U}"/></g>` +
    pf('#F4F3EE', px(2.1, -2.6, 6.8, 2.4)) + `<path d="M${2 * U} ${-2.4 * U}V${-0.2 * U}M${9 * U} ${-2.4 * U}V${-0.2 * U}" stroke="#BDBAB0" stroke-width=".5"/>` +
    pf('#D2D1C8', px(2, -0.6, 7, 0.4)) +
    eyes + pf('#F4F3EE', px(2, 3, 7, 2)) + pf('#D2D1C8', px(5.4, 3, 0.2, 2))
  const stove = `<rect x="40" y="23" width="36" height="7" fill="#3A3A3C"/><rect x="40" y="22" width="36" height="1.2" fill="#5A5A5E"/><circle cx="72" cy="26.5" r="1" fill="#8E959C"/><circle cx="68" cy="26.5" r="1" fill="#8E959C"/>`
  const flames = `<g class="flame" style="transform-box:fill-box;transform-origin:50% 100%"><path d="M44 22l1.2-2.6 1.2 2.6M47 22l1.2-3.2 1.2 3.2M50 22l1.2-2.6 1.2 2.6" fill="#F28C28"/></g>`
  const pan = `<g class="pan"><rect x="31" y="18.4" width="9" height="1.1" fill="#3A3A3C"/><path d="M40 18.2H54Q54 20.8 51 20.8H43Q40 20.8 40 18.2Z" fill="#2E2E30"/><ellipse class="egg" cx="47" cy="17.6" rx="4.6" ry="1.1" fill="#F5C542"/></g>`
  const pot = `<rect x="60" y="15" width="10" height="7" rx="1" fill="#8E959C"/><rect x="59" y="14.2" width="12" height="1.2" fill="#6B7178"/>` +
    `<g fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width=".7"><path class="steam" d="M62 13Q60.6 10.5 62 8.5T62 4"/><path class="steam" d="M66 13Q67.4 10.5 66 8.5T66 4" style="animation-delay:-.6s"/></g>`
  return svg(style, `${stove}${flames}${pot}${standing(look)}${pan}`)
}

export function racerSvg(): string {
  // Helmet down in a Formula One car at speed: low red body, airbox, halo, front and rear wings,
  // wide slick tyres spinning, kerbs streaming past, the checkered flag waving.
  const style = css([
    '.car{animation:rattle .16s steps(1) infinite}@keyframes rattle{50%{transform:translateY(.4px)}}',
    '.wheel{transform-box:fill-box;transform-origin:50% 50%;animation:spin .25s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}',
    '.kerb{animation:kerb .3s linear infinite}@keyframes kerb{to{transform:translateX(-8px)}}',
    '.speed{animation:speed .45s linear infinite}.speed.b{animation-delay:-.22s}@keyframes speed{from{transform:translateX(8px);opacity:0}30%{opacity:.8}to{transform:translateX(-12px);opacity:0}}',
    '.flag{transform-box:fill-box;transform-origin:0 50%;animation:wave .3s steps(1) infinite}@keyframes wave{50%{transform:skewY(-10deg) scaleX(.85)}}',
  ])
  const look =
    `<path d="M${0.3 * U} ${1.8 * U}Q${0.3 * U} ${-2.6 * U} ${5.5 * U} ${-2.6 * U}Q${10.7 * U} ${-2.6 * U} ${10.7 * U} ${1.8 * U}Z" fill="#FFFFFF" stroke="#BDBAB0" stroke-width=".6"/>` +
    pf(RED, px(0.3, -0.6, 10.4, 0.8)) +
    `<rect x="${3.2 * U}" y="${0.4 * U}" width="${7 * U}" height="${1.3 * U}" rx="1.4" fill="#1F2A33"/>`
  const RED2 = '#9E0C24'
  const car =
    // Rear wing with its endplate, main planes and the DRS flap.
    `<rect x="0" y="12.5" width="1.4" height="11" fill="#1F1E1D"/><rect x="0" y="12.5" width="9" height="1.6" fill="${RED}"/><rect x="0" y="15" width="9" height="1.1" fill="#1F1E1D"/>` +
    // Floor, body, sidepods, nose and the airbox behind the driver.
    `<rect x="1" y="25.6" width="58" height="1" fill="#1F1E1D"/>` +
    `<path d="M2 20.5H15Q21 19 27 19.4H40L57 23.6Q59 24.6 57 25.6H2Z" fill="${RED}"/>` +
    `<path d="M14 21.4H36Q38 23.4 36 25H14Z" fill="${RED2}"/><path d="M15 22.4H35" stroke="#FFFFFF" stroke-width=".7"/>` +
    `<path d="M7 20.6Q10 13.8 19 14.6L22 20Z" fill="${RED}"/><rect x="16.4" y="15.4" width="2.4" height="1.6" rx=".5" fill="#1F1E1D"/>` +
    `<text x="41" y="24.6" font-family="-apple-system,sans-serif" font-size="3.2" font-weight="700" fill="#FFFFFF">4</text>` +
    // Front wing and its endplate.
    `<rect x="51" y="25.8" width="11" height="1.1" fill="#1F1E1D"/><rect x="61" y="23.8" width="1" height="3.1" fill="#1F1E1D"/><rect x="52" y="24.9" width="8" height=".7" fill="${RED}"/>` +
    // The halo over the cockpit.
    `<path d="M21 19.6Q27 12.8 35 19.4" fill="none" stroke="#2B2B2E" stroke-width="1"/><path d="M33.6 19.4V17.6" stroke="#2B2B2E" stroke-width=".8"/>` +
    // Slick tyres with spinning rims.
    `<g class="wheel"><circle cx="9.5" cy="25.6" r="4.2" fill="#1A1A1A"/><circle cx="9.5" cy="25.6" r="2" fill="#8E959C"/><path d="M7.7 25.6H11.3M9.5 23.8V27.4" stroke="#5A5F66" stroke-width=".5"/></g>` +
    `<g class="wheel"><circle cx="48" cy="25.8" r="3.8" fill="#1A1A1A"/><circle cx="48" cy="25.8" r="1.8" fill="#8E959C"/><path d="M46.4 25.8H49.6M48 24.2V27.4" stroke="#5A5F66" stroke-width=".5"/></g>`
  const kerb = `<g class="kerb">${Array.from({ length: 14 }, (_, k) => `<rect x="${k * 8}" y="29.2" width="4" height=".8" fill="${RED}"/><rect x="${k * 8 + 4}" y="29.2" width="4" height=".8" fill="#FFFFFF"/>`).join('')}</g>`
  const speed = `<g stroke="#9a9a96" stroke-width=".6"><path class="speed" d="M-1 16h-5"/><path class="speed b" d="M-1 21h-6"/></g>`
  const flag = `<rect x="84" y="4" width="1" height="25" fill="#8A8580"/><g class="flag">${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<rect x="${85 + c * 2.5}" y="${4 + r * 2.5}" width="2.5" height="2.5" fill="${(r + c) % 2 ? '#1F1E1D' : '#FFFFFF'}"/>`).join('')).join('')}</g>`
  // Clawd, sized to the cockpit, sits behind the halo with only his helmet showing.
  const driver = `<g transform="translate(15.5 8.4) scale(.55)">${standing(look, true)}</g>`
  return svg(style, `${kerb}${flag}<g class="car">${speed}${driver}${car}</g>`)
}

export function pirateSvg(): string {
  // Tricorn and eyepatch on the deck of a pirate ship, spyglass up: square sails, the Jolly Roger,
  // gun ports. Ahead, a big island thick with palms and a volcano erupting behind it.
  const style = css([
    '.boat{transform-box:fill-box;transform-origin:50% 100%;animation:rock 2.4s ease-in-out infinite}@keyframes rock{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}',
    '.waves{animation:waves 1.6s linear infinite}@keyframes waves{to{transform:translateX(-12px)}}',
    '.gull{animation:gull 5s linear infinite}@keyframes gull{from{transform:translateX(20px)}to{transform:translateX(-60px)}}',
    '.scope{transform-box:fill-box;transform-origin:0% 50%;animation:scope 2.4s ease-in-out infinite}@keyframes scope{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(-6deg)}}',
    '.jolly{transform-box:fill-box;transform-origin:0 50%;animation:jolly .6s steps(1) infinite}@keyframes jolly{50%{transform:skewY(-8deg) scaleX(.85)}}',
    '.lava{animation:lava 1.8s ease-out infinite}.lava.b{animation-delay:-.6s}.lava.c{animation-delay:-1.2s}',
    '@keyframes lava{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),-7px);opacity:0}}',
    '.smoke{animation:smoke 3s ease-out infinite}.smoke.b{animation-delay:-1s}.smoke.c{animation-delay:-2s}',
    '@keyframes smoke{0%{transform:translate(0,0) scale(.5);opacity:.85}100%{transform:translate(4px,-10px) scale(1.8);opacity:0}}',
  ])
  const look =
    pf('#F8F6F1', px(1, 3, 9, 2)) + pf(RED, px(1, 3, 9, 0.6)) +
    `<path d="M${-0.4 * U} 0L${1.4 * U} ${-2.6 * U}Q${5.5 * U} ${-1.4 * U} ${9.6 * U} ${-2.6 * U}L${11.4 * U} 0Z" fill="#2B2B2E" stroke="${GOLDEN}" stroke-width=".5"/>` +
    pf('#F8F6F1', px(5, -1.6, 1, 0.8)) +
    pf(INK, px(3, 1, 1, 2)) + pf(INK, px(6.4, 0.7, 2.2, 1.9), px(0.2, 0.9, 6.2, 0.3))
  // The island and volcano, far off to the right.
  const palms = [[60, 22.5], [64, 21.5], [68, 22], [72, 21.2], [76, 21.8], [80, 22.4], [84, 21.6], [88, 22.6], [92, 22]]
    .map(([x, y]) => `<rect x="${x - 0.25}" y="${y}" width=".5" height="3.4" fill="#7A4A26"/><path d="M${x} ${y}q-2.2-.4-2.8 1M${x} ${y}q2.2-.4 2.8 1M${x} ${y}q-1-1.6-2.6-1.6M${x} ${y}q1-1.6 2.6-1.6" stroke="#2E8B57" stroke-width=".7" fill="none"/>`).join('')
  const volcano =
    `<path d="M70 21L79 6.5H82.5L91 21Z" fill="#6B5446"/><path d="M79 6.5H82.5L81.6 9 80.6 8 79.6 9.4Z" fill="#E8642C"/><path d="M80 7.5L77.6 14 79 13.2 79.6 16" stroke="#E8642C" stroke-width=".6" fill="none"/>` +
    ['', 'b', 'c'].map(k => `<circle class="smoke ${k}" cx="80.8" cy="5.5" r="1.6" fill="#8A8580"/>`).join('') +
    [['-3px', ''], ['0px', 'b'], ['3px', 'c']].map(([dx, k]) => `<circle class="lava ${k}" style="--dx:${dx}" cx="80.8" cy="6.5" r=".6" fill="#FF7A2B"/>`).join('')
  const island = `${volcano}<path d="M54 28.5Q60 20.5 72 20.8T96 21V28.5Z" fill="#C9B27A"/><path d="M56 26Q66 22 78 22.4T96 22.4V26Z" fill="#4E8A4F"/>${palms}`
  // The ship, bow to the right: hull with gun ports, gold gunwale, raised stern, mast and two sails,
  // the Jolly Roger on top, bowsprit out front.
  const ship =
    `<rect x="35.6" y="0" width="1" height="24" fill="#5A3519"/><rect x="34" y="2.2" width="4" height="1" fill="#5A3519"/>` +
    `<path d="M30 3.6H42Q43.6 7.6 42 11.4H30Q31.4 7.6 30 3.6Z" fill="#F2EBD9" stroke="#CFC5AC" stroke-width=".3"/>` +
    `<path d="M29 12.6H43Q44.6 16.6 43 20H29Q30.6 16.6 29 12.6Z" fill="#F2EBD9" stroke="#CFC5AC" stroke-width=".3"/>` +
    `<g class="jolly"><rect x="36.6" y=".2" width="5" height="3" fill="#1F1E1D"/><circle cx="39.1" cy="1.4" r=".7" fill="#F8F6F1"/><path d="M37.8 2.6l2.6-.8M37.8 1.8l2.6.8" stroke="#F8F6F1" stroke-width=".3"/></g>` +
    `<path d="M48 22L60 17.6" stroke="#5A3519" stroke-width=".8"/><path d="M42 3.6L60 17.6" stroke="#5A3519" stroke-width=".25"/>` +
    `<path d="M-3 22.6H48L52 19.6 49 27Q30 30 2 28.4L-3 22.6Z" fill="#7A4A26"/><rect x="-3" y="17.6" width="12" height="5" fill="#7A4A26"/>` +
    `<path d="M-3 22.6H48L52 19.6" stroke="${GOLDEN}" stroke-width=".7" fill="none"/><path d="M-3 17.6H9" stroke="${GOLDEN}" stroke-width=".6"/>` +
    `<path d="M0 25.4H46" stroke="#5A3519" stroke-width=".5"/>` + [6, 14, 22, 30, 38].map(x => `<rect x="${x}" y="23.6" width="2" height="1.4" fill="#1F1E1D"/>`).join('')
  const scope = `<g class="scope"><rect x="31" y="17.6" width="10" height="1.8" fill="#C9A227"/><rect x="40" y="17.2" width="3" height="2.6" fill="#B8862B"/></g>`
  const waves = `<g class="waves"><path d="M-12 27q3-2 6 0${" t6 0".repeat(22)}V30H-12Z" fill="#2F6FB0"/></g>`
  const gull = `<g class="gull"><path d="M66 3q2-1.6 3.4 0q1.4-1.6 3.4 0" fill="none" stroke="#8A8580" stroke-width=".7"/></g>`
  return svg(style, `${gull}${island}<g class="boat">${standing(look)}${ship}${scope}</g>${waves}`)
}

export function golferSvg(): string {
  // Cap and red polo with black trousers on the tee, small trees round the course, mountains beyond: a full swing, the ball
  // arcs onto the green past the bunker and drops in the cup beside the flag. 3.6s loop.
  const style = css([
    blinkEyes,
    '.club{transform-box:view-box;transform-origin:31px 19px;animation:swing 3.6s ease-in-out infinite}',
    '@keyframes swing{0%,8%{transform:rotate(0)}26%{transform:rotate(130deg)}34%{transform:rotate(0);animation-timing-function:ease-out}44%,60%{transform:rotate(-70deg)}80%,100%{transform:rotate(0)}}',
    '.ball{animation:shot 3.6s infinite}',
    '@keyframes shot{0%,33%{transform:translate(0,0);opacity:1}42%{transform:translate(14px,-16px)}50%{transform:translate(28px,-21px)}58%{transform:translate(40px,-14px)}64%{transform:translate(46px,-3px)}68%{transform:translate(49px,-1px)}71%{transform:translate(51px,0);opacity:1}73%,88%{transform:translate(51px,1.5px);opacity:0}89%{transform:translate(0,0);opacity:0}96%,100%{transform:translate(0,0);opacity:1}}',
    '.pin{transform-box:fill-box;transform-origin:0 50%;animation:flutter .8s ease-in-out infinite}@keyframes flutter{50%{transform:skewY(8deg) scaleX(.85)}}',
  ])
  // A round-topped cap with its brim to the right, a red polo, black trousers, white shoes.
  const look =
    pf(RED, px(1, 3, 9, 1.6), px(0, 2), px(10, 2)) + pf('#FFFFFF', px(4.3, 3, 1, 0.5), px(5.7, 3, 1, 0.5)) +
    `<g fill="#1F1E1D" stroke="#6A6A70" stroke-width=".35">${px(1, 4.6, 9, 0.4)}${px(2, 5, 1, 2)}${px(4, 5, 1, 2)}${px(6, 5, 1, 2)}${px(8, 5, 1, 2)}</g>` +
    pf('#FAFAF8', px(2, 6.5, 1, 0.5), px(4, 6.5, 1, 0.5), px(6, 6.5, 1, 0.5), px(8, 6.5, 1, 0.5)) +
    eyes +
    `<path d="M${1 * U} 0Q${1 * U} ${-2.6 * U} ${5.5 * U} ${-2.6 * U}Q${10 * U} ${-2.6 * U} ${10 * U} 0Z" fill="#FAFAF8" stroke="#BDBAB0" stroke-width=".4"/>` +
    `<rect x="${8.6 * U}" y="${-0.3 * U}" width="${3.6 * U}" height="${0.5 * U}" rx=".6" fill="#FAFAF8" stroke="#BDBAB0" stroke-width=".4"/>` +
    pf(RED, px(5.2, -2.7, 0.6, 0.4))
  const mountains =
    `<path d="M36 30L48 11 56 19 66 6 76 16 84 9 96 22V30Z" fill="#9AA7B8"/>` +
    `<path d="M66 6L63.4 9.4 65 8.8 66 10 67.4 8.6 68.6 9.2ZM48 11L46.2 13.4 47.6 13 48.6 14 49.6 13Z" fill="#FFFFFF"/>` +
    `<path d="M38 30L54 16 64 23 74 14 86 24 96 18V30Z" fill="#7E8E77"/>`
  const green =
    `<rect x="0" y="29" width="96" height="1" fill="#5FAF5A" opacity=".7"/><ellipse cx="80" cy="29.2" rx="15" ry="1.8" fill="#7CC46F"/><ellipse cx="80" cy="29" rx="1.6" ry=".55" fill="#1F2A1F"/>` +
    `<ellipse cx="61" cy="29.1" rx="4.2" ry="1" fill="#E6D3A0"/><ellipse cx="61" cy="29" rx="3" ry=".55" fill="#D9C38A"/>`
  // Small trees round the course: round-topped broadleaves and pines, short enough to leave the flag clear.
  const broadleaf = (x: number, h: number) => `<rect x="${x - 0.3}" y="${29 - h * 0.45}" width=".6" height="${h * 0.45}" fill="#6B4A2E"/><circle cx="${x}" cy="${29 - h * 0.7}" r="${h * 0.32}" fill="#3F7F45"/><circle cx="${x - h * 0.12}" cy="${29 - h * 0.78}" r="${h * 0.14}" fill="#5A9A5C"/>`
  const pine = (x: number, h: number) => `<rect x="${x - 0.25}" y="${29 - h * 0.25}" width=".5" height="${h * 0.25}" fill="#6B4A2E"/><path d="M${x} ${29 - h}L${x + h * 0.32} ${29 - h * 0.25}H${x - h * 0.32}Z" fill="#2F6B3C"/><path d="M${x} ${29 - h}L${x + h * 0.2} ${29 - h * 0.55}H${x - h * 0.2}Z" fill="#3F7F45"/>`
  const trees = [pine(39, 6), broadleaf(43, 5), pine(47, 7), broadleaf(53, 4.5), pine(57, 5.5), broadleaf(69, 5), pine(73, 6.5), broadleaf(91, 5.5), pine(94.5, 6)].join('')
  const pin = `<rect x="80" y="12" width=".7" height="17" fill="#FAFAF8"/><g class="pin"><path d="M80.7 12.2L87 14.4 80.7 16.6Z" fill="#CE102C"/></g>`
  const tee = `<rect x="32.6" y="29" width=".6" height="1" fill="#FAFAF8"/>`
  const club = `<g class="club"><rect x="30.5" y="19" width=".9" height="9.5" fill="#8E959C"/><rect x="30.3" y="18.4" width="1.3" height="2.6" fill="#1F1E1D"/><path d="M30.2 28.2H33.4V29.2H30.2Z" fill="#5A5F66"/></g>`
  const ball = `<g class="ball"><circle cx="33" cy="28.4" r=".75" fill="#FFFFFF" stroke="#C9CCD2" stroke-width=".25"/></g>`
  return svg(style, `${mountains}${trees}${green}${pin}${tee}${standing(look)}${club}${ball}`)
}

// The coach's marker along the play: [% of the loop, arm angle, arm length], tip at length + 3.
const COACH_REACH: [number, number, number][] = [[0, -15.4, 12], [10, -15.4, 12], [25, -27.9, 16.2], [40, -22.3, 19.2], [55, -15.5, 21.4], [70, -12.8, 24.2], [85, -12.8, 24.2], [100, -15.4, 12]]

export function coachSvg(): string {
  // Cap and polo at the whiteboard, drawing up the next play; the whistle glints.
  const style = css([
    blinkEyes,
    // As with the architect's pencil: the arm turns and stretches so the marker, always in his
    // claw, follows the play as it is drawn.
    '.play{stroke-dasharray:20;animation:play 3.6s linear infinite}@keyframes play{0%,10%{stroke-dashoffset:20}70%,100%{stroke-dashoffset:0}}',
    '.tip{animation:tip 3.6s steps(1) infinite}@keyframes tip{0%{opacity:0}69%{opacity:1}100%{opacity:1}}',
    `.creach{transform-box:view-box;transform-origin:31.5px 19px;animation:creach 3.6s linear infinite}@keyframes creach{${COACH_REACH.map(([t, a]) => `${t}%{transform:rotate(${a}deg)}`).join('')}}`,
    `.carm{transform-box:view-box;transform-origin:31.5px 19px;animation:carm 3.6s linear infinite}@keyframes carm{${COACH_REACH.map(([t, , l]) => `${t}%{transform:scaleX(${(l / 10).toFixed(3)})}`).join('')}}`,
    `.cpen{animation:cpen 3.6s linear infinite}@keyframes cpen{${COACH_REACH.map(([t, , l]) => `${t}%{transform:translateX(${l}px)}`).join('')}}`,
    '.glint{animation:glint 1.5s steps(1) infinite}@keyframes glint{50%{opacity:0}}',
  ])
  const look =
    `<rect x="${1 * U}" y="${-1.6 * U}" width="${9 * U}" height="${1.8 * U}" rx="2" fill="#1C1C1E" stroke="#6A6A70" stroke-width=".5"/>` + pf(RED, px(-0.6, -0.1, 6.6, 0.5)) + pf('#FFFFFF', px(6.8, -1.1, 0.8, 0.9)) +
    eyes + pf('#3A3F48', px(1, 3, 9, 2), px(0, 2), px(10, 2)) + pf(RED, px(4, 3, 1, 0.5), px(6, 3, 1, 0.5)) +
    `<path d="M${3.5 * U} ${3 * U}L${5 * U} ${4.2 * U}" stroke="#F4F3EE" stroke-width=".4"/>` +
    pf('#C9CCD2', px(4.8, 4, 1.2, 0.5)) + `<rect class="glint" x="${4.8 * U}" y="${4 * U}" width=".8" height=".8" fill="#FFFFFF"/>`
  const board = `<rect x="44" y="3" width="40" height="20" rx="1" fill="#FAFAF8" stroke="#8A8580" stroke-width="1"/><path d="M50 23L47 30M78 23L81 30" stroke="#8A8580" stroke-width="1"/><rect x="44" y="22.6" width="40" height="1.2" fill="#8A8580"/>`
  const marks =
    `<g fill="none" stroke="#2F6FB0" stroke-width=".8"><circle cx="52" cy="17" r="1.6"/><circle cx="60" cy="9" r="1.6"/><circle cx="72" cy="16" r="1.6"/></g>` +
    `<g stroke="${RED}" stroke-width=".8"><path d="M55 7l2.4 2.4M57.4 7L55 9.4M68 9l2.4 2.4M70.4 9L68 11.4"/></g>` +
    `<path class="play" d="M46 15Q48.5 8 52 10.6T58 13" fill="none" stroke="#1F1E1D" stroke-width=".7"/><path class="tip" d="M57 11.5L58.8 13.2 56.6 14" fill="none" stroke="#1F1E1D" stroke-width=".7"/>`
  // The arm from his right nub, the claw at its end, the marker in it, tip 3px past the claw.
  const marker =
    `<g class="creach"><rect class="carm" x="31.5" y="18.3" width="10" height="1.4" fill="${ORANGE}"/>` +
    `<g class="cpen"><rect x="30.9" y="17.7" width="1.8" height="2.6" fill="${ORANGE}"/><rect x="29" y="18.3" width="4.2" height="1.4" fill="#1F1E1D"/><rect x="33.2" y="18.6" width="1.3" height=".8" fill="#2F6FB0"/></g></g>`
  return svg(style, `${floor()}${board}${marks}${standing(look)}${marker}`)
}

// [drawing, what it shows, dark themes only].
const SCENES: [string, string, boolean?][] = [
  [weldingSvg(), 'Clawd welding in a mask'],
  [labSvg(), 'Clawd in a lab coat pouring a glowing beaker'],
  [generalSvg(), 'Clawd in navy dress whites saluting the American and Canadian flags'],
  [pilotSvg(), 'Clawd flying a biplane through the clouds'],
  [dartsSvg(), 'Clawd throwing darts at the board in the pub'],
  [architectSvg(), 'Clawd drawing a house onto a blueprint floor plan'],
  [astronautSvg(), 'Clawd at the window of a stainless rocket ship bound for Mars'],
  [shuttleSvg(), 'Clawd on a spacewalk by the Canadarm fixing the shuttle wing above the Earth, the Moon beyond'],
  [burglarSvg(), 'Clawd as a burglar in black, his flashlight finding a caped figure down a dark alley', true],
  [engineerSvg(), 'Clawd turning a valve on a steam pipe'],
  [chefSvg(), 'Clawd flipping an omelette at the stove'],
  [racerSvg(), 'Clawd racing a Formula One car past the kerbs and the checkered flag'],
  [pirateSvg(), 'Clawd on a pirate ship with a spyglass, a volcano erupting on the island ahead'],
  [golferSvg(), 'Clawd swinging a driver and sinking the ball by the flag'],
  [coachSvg(), 'Clawd drawing up a play on the whiteboard'],
]
const WORKING = workingSvg()

// How many waiting scenes there are, so the band can pick one per wait.
export const WAIT_COUNT = SCENES.length

// Marc: a scene picked from `seed`, never a dark-only one while the theme is light.
export function pickWait(seed: number, isLight: boolean): number {
  const allowed = SCENES.map((scene, i) => (isLight && scene[2] ? -1 : i)).filter(i => i >= 0)
  return allowed[Math.abs(Math.floor(seed)) % allowed.length] ?? 0
}

// What the band's Svg draws: `wait` picks the waiting scene (0 welding, 1 lab, then Marc's trades).
export function clawdScene(isWorking: boolean, wait: number): { source: string; width: number; height: number; alt: string } {
  const [source, alt] = SCENES[wait] ?? SCENES[0] ?? ['', '', false]
  return {
    source: isWorking ? WORKING : source,
    width: W,
    height: H,
    alt: isWorking ? 'Clawd dribbling and shooting' : alt,
  }
}
