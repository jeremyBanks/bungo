const cases: Record<
  string,
  { input: Record<string, string>; expectedMoves?: Record<string, string> }
> = {
  empty: {
    input: {},
  },

  "binary orbit": {
    input: {
      "/a.ts": `import "b.ts"`,
      "/b.ts": `import "a.ts"`,
    },
  },

  "ternary orbit": {
    input: {
      "/a.ts": `import "b.ts"`,
      "/b.ts": `import "c.ts"`,
      "/c.ts": `import "a.ts"`,
    },
  },

  "with a friend": {
    input: {
      "/grandparent.ts": `import "/parent.ts"`,
      "/parent.ts": `import "/son.ts"; import "/daughter.ts";`,
      "/son.ts": `import "/friend.ts"; import "/daughter.ts"; import "/teacher.ts"`,
      "/daughter.ts": `import "/son.ts"; import "/teacher.ts"`,
      "/friend.ts": `import "/son.ts"`,
      "/teacher.ts": `export {}`,
    },
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
  },
};

export default cases;
