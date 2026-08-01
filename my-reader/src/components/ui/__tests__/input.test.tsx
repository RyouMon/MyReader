import { render } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"

import { Input } from "../input"

describe("Input", () => {
  it("should expose the input element when given a ref", () => {
    const ref = createRef<HTMLInputElement>()

    render(<Input ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
