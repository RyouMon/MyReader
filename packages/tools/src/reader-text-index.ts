type NormalizedTextIndex = {
  text: string
  rawStarts: number[]
  rawEnds: number[]
}

export function normalizedTextIndex(rawText: string): NormalizedTextIndex {
  let text = ""
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  let rawOffset = 0

  for (const character of rawText) {
    const rawEnd = rawOffset + character.length
    if (/\s/u.test(character)) {
      if (text.endsWith(" ")) {
        rawEnds[rawEnds.length - 1] = rawEnd
      } else {
        text += " "
        rawStarts.push(rawOffset)
        rawEnds.push(rawEnd)
      }
    } else {
      text += character
      for (let index = 0; index < character.length; index += 1) {
        rawStarts.push(rawOffset)
        rawEnds.push(rawEnd)
      }
    }
    rawOffset = rawEnd
  }

  const start = text.startsWith(" ") ? 1 : 0
  const end = text.endsWith(" ") ? -1 : undefined
  return {
    text: text.slice(start, end),
    rawStarts: rawStarts.slice(start, end),
    rawEnds: rawEnds.slice(start, end),
  }
}
