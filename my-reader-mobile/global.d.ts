declare module "*.css";
declare module "@/src/i18n/locales/*.json" {
  const value: Record<string, unknown>;
  export default value;
}
