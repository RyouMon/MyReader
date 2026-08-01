import { render } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"

import { Dialog, DialogOverlay, DialogPortal } from "../dialog"

describe("DialogOverlay", () => {
  it("should expose the overlay element when given a ref", () => {
    const ref = createRef<HTMLDivElement>()

    render(
      <Dialog open>
        <DialogPortal>
          <DialogOverlay ref={ref} />
        </DialogPortal>
      </Dialog>
    )

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})
