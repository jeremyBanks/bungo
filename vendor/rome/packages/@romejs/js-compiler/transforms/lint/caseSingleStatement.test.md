# `caseSingleStatement.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-compiler/transforms/lint/caseSingleStatement.test.ts --update-snapshots` to update.

## `case single statement`

### `0`

```
✔ No known problems!

```

### `0: formatted`

```
switch (foo) {
  case true:
  case false:
    return 'yes';
}

```

### `1`

```
✔ No known problems!

```

### `1: formatted`

```
switch (foo) {
  case true: {}
}

```

### `2`

```
✔ No known problems!

```

### `2: formatted`

```
switch (foo) {
  case true:
}

```

### `3`

```

 unknown:1:35 lint/caseSingleStatement FIXABLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ A switch case should only have a single statement. If you want more then wrap it in a block.

    switch (foo) {case true: case false: let foo = ''; foo;}
                                       ^^^^^^^^^^^^^^^^^^^^ 

  ℹ Possible fix

    1 │ + case·false: {
    2 │ + ····let foo = '';
    3 │ + ··· foo;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✖ Found 1 problem

```

### `3: formatted`

```
switch (foo) {
  case true:
  case false: {
    let foo = '';
    foo;
  }
}

```

## `format disabled in project config should not regenerate the file`

### `0`

```
✔ No known problems!

```

### `0: formatted`

```
foobar('yes');

```

## `format enabled in project config should result in regenerated file`

### `0`

```
✔ No known problems!

```

### `0: formatted`

```
foobar('yes');

```