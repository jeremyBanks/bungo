# `noCompareNegZero.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-compiler/transforms/lint/noCompareNegZero.test.ts --update-snapshots` to update.

## `disallows comparing negative zero`

### `0`

```

 unknown:1:1 lint/noCompareNegZero ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ Do not use the '>=' operator to compare against -0

    (1 >= -0)
     ^^^^^^^ 

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✖ Found 1 problem

```

### `0: formatted`

```
1 >= -0;

```

### `1`

```
✔ No known problems!

```

### `1: formatted`

```
1 >= 0;

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