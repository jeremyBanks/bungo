# `index.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-parser/index.test.ts --update-snapshots` to update.

## `experimental > class-properties > no-ctor`

```javascript
Program {
  comments: Array []
  corrupt: false
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
      index: 28
      line: 4
    }
    start: Object {
      column: 0
      index: 0
      line: 1
    }
  }
  diagnostics: Array [
    Object {
      origins: Array [Object {category: 'js-parser'}]
      description: Object {
        category: 'parse/js'
        message: PARTIAL_BLESSED_DIAGNOSTIC_MESSAGE {value: 'Classes may not have a non-static field named \'constructor\''}
      }
      location: Object {
        filename: 'input.js'
        mtime: undefined
        sourceType: 'script'
        end: Object {
          column: 13
          index: 25
          line: 2
        }
        start: Object {
          column: 2
          index: 14
          line: 2
        }
      }
    }
  ]
  body: Array [
    ClassDeclaration {
      id: BindingIdentifier {
        name: 'Foo'
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 9
            index: 9
            line: 1
          }
          start: Object {
            column: 6
            index: 6
            line: 1
          }
        }
      }
      loc: Object {
        filename: 'input.js'
        end: Object {
          column: 1
          index: 27
          line: 3
        }
        start: Object {
          column: 0
          index: 0
          line: 1
        }
      }
      meta: ClassHead {
        implements: undefined
        superClass: undefined
        superTypeParameters: undefined
        typeParameters: undefined
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 1
            index: 27
            line: 3
          }
          start: Object {
            column: 0
            index: 0
            line: 1
          }
        }
        body: Array [
          ClassProperty {
            key: StaticPropertyKey {
              value: Identifier {
                name: 'constructor'
                loc: Object {
                  filename: 'input.js'
                  end: Object {
                    column: 13
                    index: 25
                    line: 2
                  }
                  start: Object {
                    column: 2
                    index: 14
                    line: 2
                  }
                }
              }
              variance: undefined
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 13
                  index: 25
                  line: 2
                }
                start: Object {
                  column: 2
                  index: 14
                  line: 2
                }
              }
            }
            value: undefined
            definite: undefined
            typeAnnotation: undefined
            loc: Object {
              filename: 'input.js'
              end: Object {
                column: 13
                index: 25
                line: 2
              }
              start: Object {
                column: 2
                index: 14
                line: 2
              }
            }
            meta: ClassPropertyMeta {
              abstract: false
              accessibility: undefined
              optional: false
              readonly: false
              static: false
              typeAnnotation: undefined
              start: Object {
                column: 2
                index: 14
                line: 2
              }
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 13
                  index: 25
                  line: 2
                }
                start: Object {
                  column: 2
                  index: 14
                  line: 2
                }
              }
            }
          }
        ]
      }
    }
  ]
}
```
