export type DeveloperConcurrencyControlProps = {
  value: number
  min: number
  max: number
  decrementLabel: string
  incrementLabel: string
  onValueChange: (value: number) => void
  testID: string
}
