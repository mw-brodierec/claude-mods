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
const standing = (face: string) =>
  `<g class="clawd"><g transform="translate(4 12.5)"><g fill="${ORANGE}">${body}${[2, 4, 6, 8].map(x => px(x, 5, 1, 2)).join('')}</g>${face}</g></g>`

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

const WAITING = [weldingSvg(), labSvg()]
const WORKING = workingSvg()

// What the band's Svg draws: `wait` picks the waiting scene (0 welding, 1 lab).
export function clawdScene(isWorking: boolean, wait: number): { source: string; width: number; height: number; alt: string } {
  return {
    source: isWorking ? WORKING : (WAITING[wait] ?? WAITING[0] ?? ''),
    width: W,
    height: H,
    alt: isWorking ? 'Clawd dribbling and shooting' : wait === 1 ? 'Clawd in a lab coat pouring a glowing beaker' : 'Clawd welding in a mask',
  }
}
