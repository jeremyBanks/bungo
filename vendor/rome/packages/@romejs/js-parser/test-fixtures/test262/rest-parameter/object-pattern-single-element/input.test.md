# `index.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-parser/index.test.ts --update-snapshots` to update.

## `test262 > rest-parameter > object-pattern-single-element`

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
      column: 0
      index: 37
      line: 2
    }
    start: Object {
      column: 0
      index: 0
      line: 1
    }
  }
  body: Array [
    FunctionDeclaration {
      id: BindingIdentifier {
        name: 'singleElement'
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 22
            index: 22
            line: 1
          }
          start: Object {
            column: 9
            index: 9
            line: 1
          }
        }
      }
      loc: Object {
        filename: 'input.js'
        end: Object {
          column: 36
          index: 36
          line: 1
        }
        start: Object {
          column: 0
          index: 0
          line: 1
        }
      }
      body: BlockStatement {
        body: Array []
        directives: Array []
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 36
            index: 36
            line: 1
          }
          start: Object {
            column: 34
            index: 34
            line: 1
          }
        }
      }
      head: FunctionHead {
        async: false
        generator: false
        hasHoistedVars: false
        params: Array []
        predicate: undefined
        returnType: undefined
        thisType: undefined
        typeParameters: undefined
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 34
            index: 34
            line: 1
          }
          start: Object {
            column: 22
            index: 22
            line: 1
          }
        }
        rest: BindingObjectPattern {
          rest: undefined
          loc: Object {
            filename: 'input.js'
            end: Object {
              column: 32
              index: 32
              line: 1
            }
            start: Object {
              column: 26
              index: 26
              line: 1
            }
          }
          meta: PatternMeta {
            optional: undefined
            typeAnnotation: undefined
            loc: Object {
              filename: 'input.js'
              end: Object {
                column: 32
                index: 32
                line: 1
              }
              start: Object {
                column: 26
                index: 26
                line: 1
              }
            }
          }
          properties: Array [
            BindingObjectPatternProperty {
              key: StaticPropertyKey {
                value: Identifier {
                  name: 'a'
                  loc: Object {
                    filename: 'input.js'
                    end: Object {
                      column: 28
                      index: 28
                      line: 1
                    }
                    start: Object {
                      column: 27
                      index: 27
                      line: 1
                    }
                  }
                }
                variance: undefined
                loc: Object {
                  filename: 'input.js'
                  end: Object {
                    column: 28
                    index: 28
                    line: 1
                  }
                  start: Object {
                    column: 27
                    index: 27
                    line: 1
                  }
                }
              }
              value: BindingIdentifier {
                name: 'b'
                loc: Object {
                  filename: 'input.js'
                  end: Object {
                    column: 31
                    index: 31
                    line: 1
                  }
                  start: Object {
                    column: 30
                    index: 30
                    line: 1
                  }
                }
              }
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 31
                  index: 31
                  line: 1
                }
                start: Object {
                  column: 27
                  index: 27
                  line: 1
                }
              }
            }
          ]
        }
      }
    }
  ]
}
```
