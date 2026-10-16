;(() => {
  if (window.__readerImageActions) return
  window.__readerImageActions = true
  let timer
  let start
  let handled = false
  const imageAt = (target) => target?.closest?.("img, svg image")
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      cancel()
      handled = false
      const image = imageAt(event.target)
      if (!image || !event.isPrimary || event.button !== 0) return
      start = { x: event.clientX, y: event.clientY }
      timer = setTimeout(() => {
        const source =
          image.currentSrc ||
          image.getAttribute("src") ||
          image.getAttribute("href") ||
          image.getAttribute("xlink:href")
        if (!source) return
        const src = new URL(source, image.baseURI).href
        handled = true
        window.getSelection()?.removeAllRanges()
        if (window.webkit?.messageHandlers?.readerImage) {
          window.webkit.messageHandlers.readerImage.postMessage({ src })
        } else {
          window.ReaderImage?.onImage(src)
        }
      }, 500)
    },
    true,
  )
  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      )
        cancel()
    },
    true,
  )
  for (const name of ["pointerup", "pointercancel", "scroll"])
    document.addEventListener(name, cancel, true)
  document.addEventListener(
    "click",
    (event) => {
      if (!handled) return
      event.preventDefault()
      event.stopImmediatePropagation()
      handled = false
    },
    true,
  )
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (imageAt(event.target)) event.preventDefault()
    },
    true,
  )
  const style = document.createElement("style")
  style.textContent = "img,svg image{-webkit-touch-callout:none}"
  document.head.append(style)
})()
