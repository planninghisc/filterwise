declare module 'vanta/dist/vanta.fog.min.js' {
  export default function VantaFog(opts: Record<string, unknown>): { destroy: () => void }
}
