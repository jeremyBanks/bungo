# `noTemplateCurlyInString.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-compiler/transforms/lint/noTemplateCurlyInString.test.ts --update-snapshots` to update.

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

## `no template curly in string`

### `0`

```

 unknown:3:26 lint/noTemplateCurlyInString ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ Unexpected template string expression.

    2 │         const user = "Faustina";
  > 3 │         const helloUser = "Hello, ${user}!";
      │                           ^^^^^^^^^^^^^^^^^ 
    4 │ 
    5 │         // mark consts as used

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✖ Found 1 problem

```

### `0: formatted`

```
const user = 'Faustina';
const helloUser = 'Hello, ${user}!';

// mark consts as used
console.log(user, helloUser);

```