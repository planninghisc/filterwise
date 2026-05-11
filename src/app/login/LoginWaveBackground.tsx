'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import VantaFog from 'vanta/dist/vanta.fog.min.js'

export default function LoginWaveBackground() {
  const vantaRef = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(true)

  useEffect(() => {
    const el = vantaRef.current
    if (!el) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      setFallback(true)
      return
    }

    let destroyed = false
    let effect: { destroy: () => void } | null = null

    try {
      effect = VantaFog({
        el,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        highlightColor: 0xffc300,
        midtoneColor: 0xff1f00,
        lowlightColor: 0x2d00ff,
        baseColor: 0xffebeb,
        blurFactor: 0.6,
        zoom: 1,
        speed: 1,
        scale: 2,
        scaleMobile: 4,
      })
      if (destroyed) {
        effect.destroy()
        effect = null
      } else {
        setFallback(false)
      }
    } catch (e) {
      console.error('[Vanta FOG]', e)
      setFallback(true)
    }

    return () => {
      destroyed = true
      effect?.destroy()
      effect = null
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[color:var(--fw-bg)]" aria-hidden>
      <div
        ref={vantaRef}
        className="pointer-events-auto absolute inset-0 h-full min-h-[100dvh] w-full touch-none"
      />

      <div
        className={`absolute inset-0 bg-gradient-to-br from-orange-50/55 via-[color:var(--fw-bg)] to-orange-50/35 transition-opacity duration-[800ms] ease-out ${
          fallback ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
