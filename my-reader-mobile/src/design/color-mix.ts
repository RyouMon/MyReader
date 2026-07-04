function parseHexChannel(pair: string): number | null {
  const value = Number.parseInt(pair, 16)
  return Number.isFinite(value) ? value : null
}

function parseHexColor(color: string): [number, number, number] | null {
  const value = color.trim().replace(/^#/, "")
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : value

  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return null
  }

  const red = parseHexChannel(normalized.slice(0, 2))
  const green = parseHexChannel(normalized.slice(2, 4))
  const blue = parseHexChannel(normalized.slice(4, 6))
  return red === null || green === null || blue === null
    ? null
    : [red, green, blue]
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0")
}

/**
 * Mixes ink into a background using simple RGB interpolation.
 *
 * This small helper intentionally avoids the reader chrome palette module; that
 * module pulls in material color utilities, while hot-path cover components only
 * need stable theme-token mixing.
 */
export function mixInk(ink: string, background: string, inkPercent: number) {
  const inkRgb = parseHexColor(ink)
  const backgroundRgb = parseHexColor(background)
  if (!inkRgb || !backgroundRgb) {
    return ink
  }

  const amount = Math.min(1, Math.max(0, inkPercent / 100))
  const [red, green, blue] = backgroundRgb.map(
    (channel, index) => channel + (inkRgb[index]! - channel) * amount,
  )
  return `#${toHexChannel(red!)}${toHexChannel(green!)}${toHexChannel(blue!)}`
}
