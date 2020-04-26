export default [
  {
    original: {
      "/src/main.ts": `
          import "./cli.ts";
          import "./business.ts";
      `,
      "/src/cli.ts": `
        import "./string-utils.ts";
      `,
      "/src/tool.ts": `
        import "./math-utils.ts";
      `,
      "/src/math-utils.ts": `
        export sin = Math.sin;
      `,
      "/src/string-utils.ts": `
        export const EMPTY = "";
      `,
      "/src/business.ts": `
        import "./user.ts";
        import "./property.ts";
      `,
      "/src/user.ts": `
        import "./string-utils.ts";
      `,
      "/src/property.ts": `
        import "./math-utils.ts";
      `,
    },
  },
];
