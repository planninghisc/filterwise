declare module 'vanta/dist/vanta.fog.min.js' {
  export default function VantaFog(opts: Record<string, unknown>): { destroy: () => void }
}

declare module 'vanta/dist/vanta.waves.min.js' {
  export default function VantaWaves(opts: Record<string, unknown>): { destroy: () => void }
}
