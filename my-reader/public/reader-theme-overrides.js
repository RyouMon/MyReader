;(() => {
  const root = document.documentElement
  const body = document.body

  root.style.setProperty(
    "background-color",
    "var(--USER__backgroundColor)",
    "important",
  )
  root.style.setProperty("color", "var(--USER__textColor)", "important")
  body.style.setProperty(
    "background-color",
    "var(--USER__backgroundColor)",
    "important",
  )
  body.style.setProperty("color", "var(--USER__textColor)", "important")
  body.querySelectorAll("*:not(a)").forEach((element) => {
    element.style.setProperty("background-color", "transparent", "important")
    element.style.setProperty("color", "inherit", "important")
  })
})()
