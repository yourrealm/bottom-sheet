// Small deterministic generators so scenarios look real without shipping big fixtures.

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
export const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

export const people = [
  'Alva Berg', 'Noah Lind', 'Saga Ek', 'Omar Haddad', 'Mira Holm', 'Leo Strand', 'Ines Costa', 'Theo Vik',
  'Yuki Mori', 'Elsa Nyberg', 'Felix Dahl', 'Nora Falk', 'Ravi Shah', 'Ida Sund', 'Hugo Blom', 'Lina Åkesson',
  'Malik Osei', 'Wilma Roos', 'Sam Kade', 'Ebba Lund',
] as const

export const hues = [12, 28, 45, 95, 150, 175, 200, 220, 255, 285, 320, 345]

export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('')
}

const reviewBits = [
  'Cardamom buns are the real deal, still warm at nine.',
  'Gets busy around lunch, but the line moves fast.',
  'Quiet corner by the window is perfect for working.',
  'Oat flat white was excellent. Staff remembered my name.',
  'A bit pricey, though the portions make up for it.',
  'The garden seating in summer is lovely.',
  'Wi-Fi was spotty on a Saturday afternoon.',
  'Best sourdough on this side of the river.',
  'Came for the coffee, stayed for the lemon tart.',
  'Dog friendly, they even had water bowls out.',
  'Music was a little loud for a café.',
  'Friendly staff, quick service, clean tables.',
]

export function reviews(n: number) {
  const r = rng(7)
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: pick(r, people),
    stars: 3 + Math.floor(r() * 3),
    when: `${1 + Math.floor(r() * 11)} weeks ago`,
    text: `${pick(r, reviewBits)} ${r() > 0.5 ? pick(r, reviewBits) : ''}`.trim(),
    hue: pick(r, hues),
  }))
}

const commentBits = [
  'This light is unreal 😍',
  'Where was this taken?',
  'Saving this for my next trip.',
  'The colours in the third one!',
  'Okay this is my new wallpaper',
  'Took me a second to realise this was a phone shot',
  'Reminds me of summers up north',
  'How early did you have to get up for this?',
  'Love the composition here',
  'Need a print of this',
  'That fog though',
  'Booking tickets right now',
  'The reflection in the water is perfect',
  'Is this film or digital?',
]

export function comments(n: number) {
  const r = rng(42)
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: pick(r, people),
    text: pick(r, commentBits) + (r() > 0.7 ? ` ${pick(r, commentBits)}` : ''),
    when: `${1 + Math.floor(r() * 23)}h`,
    likes: Math.floor(r() * 300),
    hue: pick(r, hues),
  }))
}

const words = ['Neon', 'Velvet', 'Paper', 'Glass', 'Static', 'Midnight', 'Copper', 'Silver', 'Ocean', 'Ember', 'Quiet', 'Golden']
const nouns = ['Hearts', 'Lines', 'Rooms', 'Signals', 'Tides', 'Cities', 'Echoes', 'Gardens', 'Engines', 'Skies']
const artists = ['The Long Weekends', 'Mona Vale', 'Kite Season', 'Ola Reyes', 'Northbound', 'Juno & the Pines', 'Lowlight']

export function tracks(n: number) {
  const r = rng(99)
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    title: `${pick(r, words)} ${pick(r, nouns)}`,
    artist: pick(r, artists),
    length: `${2 + Math.floor(r() * 3)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
    hue: pick(r, hues),
  }))
}
