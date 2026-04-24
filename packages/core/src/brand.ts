export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export function brand<TBrand extends string>(value: string): Brand<string, TBrand> {
  return value as Brand<string, TBrand>;
}
