import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'

export interface SignaturePadHandle {
  toDataURL: () => string
  isEmpty: () => boolean
  clear: () => void
}

const SignaturePad = forwardRef<SignaturePadHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const empty = useRef(true)

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    isEmpty: () => empty.current,
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      empty.current = true
    },
  }))

  // Mantém a resolução real do canvas alinhada ao tamanho exibido — sem isso,
  // girar o tablet muda o tamanho visual mas não o buffer interno, e o mapeamento
  // de toque fica desalinhado (a área parece travada, não responde ao dedo).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function applyContextDefaults() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#1a1a1a'
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const ratio = window.devicePixelRatio || 1
      canvas!.width = rect.width * ratio
      canvas!.height = rect.height * ratio
      const ctx = canvas!.getContext('2d')
      ctx?.scale(ratio, ratio)
      applyContextDefaults()
      empty.current = true
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    // orientationchange às vezes dispara antes do layout assentar — reconfere logo depois
    const onOrientation = () => setTimeout(resize, 150)
    window.addEventListener('orientationchange', onOrientation)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      if ('touches' in e) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const { x, y } = getPos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      empty.current = false
      const { x, y } = getPos(e)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    const stop = () => { drawing.current = false }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', stop)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', stop)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', stop)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', stop)
    }
  }, [])

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white">
      <canvas
        ref={canvasRef}
        className="w-full touch-none cursor-crosshair block"
        style={{ height: 150 }}
      />
    </div>
  )
})

SignaturePad.displayName = 'SignaturePad'
export default SignaturePad
