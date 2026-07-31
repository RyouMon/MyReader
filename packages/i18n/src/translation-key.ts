type StringKey<T> = Extract<keyof T, string>

export type TranslationKey<T> = {
  [TKey in StringKey<T>]: T[TKey] extends string
    ? TKey
    : T[TKey] extends object
      ? `${TKey}.${TranslationKey<T[TKey]>}`
      : never
}[StringKey<T>]
