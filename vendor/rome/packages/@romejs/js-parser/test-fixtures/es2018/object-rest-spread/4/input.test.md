# `index.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-parser/index.test.ts --update-snapshots` to update.

## `es2018 > object-rest-spread > 4`

```javascript
Program {
  comments: Array []
  corrupt: false
  diagnostics: Array []
  directives: Array []
  filename: 'input.js'
  hasHoistedVars: false
  interpreter: undefined
  mtime: undefined
  sourceType: 'script'
  syntax: Array []
  loc: Object {
    filename: 'input.js'
    end: Object {
      column: 14
      index: 14
      line: 1
    }
    start: Object {
      column: 0
      index: 0
      line: 1
    }
  }
  body: Array [
    VariableDeclarationStatement {
      loc: Object {
        filename: 'input.js'
        end: Object {
          column: 14
          index: 14
          line: 1
        }
        start: Object {
          column: 0
          index: 0
          line: 1
        }
      }
      declaration: VariableDeclaration {
        kind: 'let'
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 14
            index: 14
            line: 1
          }
          start: Object {
            column: 0
            index: 0
            line: 1
          }
        }
        declarations: Array [
          VariableDeclarator {
            id: BindingIdentifier {
              name: 'z'
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 5
                  index: 5
                  line: 1
                }
                start: Object {
                  column: 4
                  index: 4
                  line: 1
                }
              }
            }
            loc: Object {
              filename: 'input.js'
              end: Object {
                column: 14
                index: 14
                line: 1
              }
              start: Object {
                column: 4
                index: 4
                line: 1
              }
            }
            init: ObjectExpression {
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 14
                  index: 14
                  line: 1
                }
                start: Object {
                  column: 8
                  index: 8
                  line: 1
                }
              }
              properties: Array [
                SpreadProperty {
                  loc: Object {
                    filename: 'input.js'
                    end: Object {
                      column: 13
                      index: 13
                      line: 1
                    }
                    start: Object {
                      column: 9
                      index: 9
                      line: 1
                    }
                  }
                  argument: ReferenceIdentifier {
                    name: 'x'
                    loc: Object {
                      filename: 'input.js'
                      end: Object {
                        column: 13
                        index: 13
                        line: 1
                      }
                      start: Object {
                        column: 12
                        index: 12
                        line: 1
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```
