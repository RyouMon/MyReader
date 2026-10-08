module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "shared-does-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^my-reader(?:-mobile)?/" },
    },
    {
      name: "mobile-services-stay-below-ui",
      severity: "error",
      from: { path: "^my-reader-mobile/src/services/" },
      to: {
        path: "^my-reader-mobile/src/(?:app|features|components|domain|hooks)/",
      },
    },
    {
      name: "mobile-domain-stays-below-features",
      severity: "error",
      from: { path: "^my-reader-mobile/src/domain/" },
      to: { path: "^my-reader-mobile/src/(?:app|features|components)/" },
    },
    {
      name: "desktop-lib-stays-below-ui",
      severity: "error",
      from: { path: "^my-reader/src/lib/" },
      to: {
        path: "^my-reader/src/(?:components|hooks|routes|stores)/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "desktop-stores-stay-below-ui",
      severity: "error",
      from: { path: "^my-reader/src/stores/" },
      to: { path: "^my-reader/src/(?:components|hooks|routes)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules|/generated/|tauri-specta\\.ts$" },
    exclude:
      "(?:^|/)(?:__tests__|__mocks__|tests)/|\\.(?:test|spec)\\.[cm]?[jt]sx?$|\\.d\\.ts$|routeTree\\.gen\\.ts$",
    tsPreCompilationDeps: "specify",
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default"],
      mainFields: ["types", "module", "main"],
    },
  },
}
