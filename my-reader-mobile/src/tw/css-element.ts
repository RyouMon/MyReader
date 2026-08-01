import { useCssElement } from "react-native-css"

type CssElementResult = ReturnType<typeof useCssElement>

/**
 * Keeps react-native-css's deeply recursive component mapping types at this
 * integration boundary instead of instantiating them for every app primitive.
 */
export const cssElement = useCssElement as unknown as (
  component: unknown,
  props: object,
  mapping: Readonly<Record<string, string>>,
) => CssElementResult
