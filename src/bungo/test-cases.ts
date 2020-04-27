const cases: Record<
  string,
  { input: Record<string, string>; expectedMoves?: Record<string, string> }
> = {
  empty: {
    input: {},
    expectedMoves: {}
  },

  "binary orbit": {
    input: {
      "/a.ts": `import "b.ts"`,
      "/b.ts": `import "a.ts"`,
    },
    expectedMoves: {
      "/a.ts": "/a.ts",
      "/b.ts": "/b.ts",
    },
  },

  "ternary orbit": {
    input: {
      "/a.ts": `import "b.ts"`,
      "/b.ts": `import "c.ts"`,
      "/c.ts": `import "a.ts"`,
    },
    expectedMoves: {
      "/a.ts": "/a.ts",
      "/b.ts": "/b.ts",
      "/c.ts": "/c.ts",
    },
  },

  "parent and two": {
    input: {
      "/mom.ts": `import "/daughter.ts"`,
      "/dad.ts": `import "/son.ts"`,
      "/son.ts": `import "/daughter.ts"`,
      "/daughter.ts": `import "/son.ts"`,
    }
  },

  "simple project": {
    input: {
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
    expectedMoves: {
      "/src/tool.ts": "/tool.ts",
      "/src/math-utils.ts": "/math-utils.ts",
      "/src/main.ts": "/main.ts",
      "/src/cli.ts": "/main/cli.ts",
      "/src/string-utils.ts": "/main/string-utils.ts",
      "/src/business.ts": "/main/business.ts",
      "/src/user.ts": "/main/business/user.ts",
      "/src/property.ts": "/main/business/property.ts",
    },
  },
};

export default cases;
