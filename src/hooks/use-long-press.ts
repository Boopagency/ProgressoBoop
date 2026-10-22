import { useRef, type MouseEvent, type PointerEvent } from "react"

/** Quanto tempo segurar (ms). */
const HOLD_MS = 450
/** O dedo andou mais que isto (px): é rolagem, não toque longo. */
const MOVE_TOLERANCE = 10
const MOBILE_QUERY = "(max-width: 767px)"

/**
 * Segurar o dedo num item (só no toque e abaixo do `md`): chama `onLongPress`
 * e evita o menu do navegador e o toque que viria depois (num link do item).
 * Com mouse ou do `md` para cima, nada muda.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }

  return {
    onPointerDown(event: PointerEvent) {
      fired.current = false
      if (!enabled || event.pointerType === "mouse" || !window.matchMedia(MOBILE_QUERY).matches) return
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        timer.current = null
        fired.current = true
        navigator.vibrate?.(10)
        onLongPress()
      }, HOLD_MS)
    },
    onPointerMove(event: PointerEvent) {
      const start = origin.current
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event: MouseEvent) {
      if (fired.current || timer.current !== null) event.preventDefault()
    },
    onClickCapture(event: MouseEvent) {
      if (!fired.current) return
      fired.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
