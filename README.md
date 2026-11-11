# andmemasin/query-builder

Framework-free query rules for PHP and the browser.

- **PHP:** turn rules JSON into a SQL `WHERE` clause with named parameters for PDO.
- **Browser:** `<query-builder>`, a web component to edit the rules, shipped prebuilt in `dist/`.

The rules JSON is compatible with jQuery QueryBuilder's format. See [docs/design.md](docs/design.md).

```bash
composer require andmemasin/query-builder
```

## PHP

```php
use Andmemasin\QueryBuilder\Translator;

$rules = json_decode($json, true);
$translator = new Translator($rules, 'p', Translator::quoteMysqlIdentifier(...));

$stmt = $pdo->prepare('SELECT * FROM people WHERE ' . $translator->where());
$stmt->execute($translator->params());
```

## Browser

Load `dist/query-builder.js` (one self-contained ES module, no build needed) and put the element in a form:

```html
<script type="module" src="/assets/query-builder.js"></script>

<form method="post">
  <query-builder name="rules"
    filters='[{"id":"age","label":"Age","type":"integer"},{"id":"name","label":"Name","type":"string"}]'
    rules='{"condition":"AND","rules":[{"id":"age","field":"age","type":"integer","input":"number","operator":"greater","value":18}]}'>
  </query-builder>
</form>
```

The form submits the rules JSON under `name`. From script: `element.value` (rules JSON with `valid`), `element.valid`, and a `change` event with `detail: {rules, valid}`. Colours can be themed with `--qb-*` CSS custom properties. See `demo/index.html`.

Development: `npm install`, `npm test` (builds `dist/` and runs the node tests); PHP tests with `vendor/bin/phpunit`.

License: MIT.
