# Design

Status: agreed 2026-11-11. Two parts in one repository, no framework dependency:

1. **PHP:** rules JSON to a SQL `WHERE` clause with named parameters, usable with plain PDO.
2. **Browser:** a `<query-builder>` web component that edits rules JSON.

Both parts share one contract, the rules JSON below. Neither part depends on the other.

## Contract: rules JSON

The format is the one used by jQuery QueryBuilder, so rules stored by existing applications keep working unchanged.

```json
{"condition": "AND", "rules": [
  {"id": "age", "field": "age", "type": "integer", "input": "number", "operator": "between", "value": [15, 74]},
  {"condition": "OR", "rules": [
    {"id": "sex", "field": "sex", "type": "integer", "input": "select", "operator": "equal", "value": 1},
    {"id": "region", "field": "region", "type": "string", "input": "select", "operator": "in", "value": ["1", "4"]}
  ]}
], "valid": true}
```

- A **group** has `condition` (`AND` or `OR`; case is kept as given) and `rules` (a list of groups and conditions). Groups nest to any depth.
- A **condition** has `field` and `operator`, usually `value`, and the descriptive keys `id`, `type`, `input`.
- `valid` on the root says whether the editor considered the rules complete.
- Consumers decide what `field` means (a column name, or an id they map to a column before translating).

Operators and their value shape:

| Operator | SQL | Value |
|---|---|---|
| `equal` / `not_equal` | `= ?` / `<> ?` | scalar |
| `less`, `less_or_equal`, `greater`, `greater_or_equal` | `<`, `<=`, `>`, `>=` | scalar |
| `in` / `not_in` | `IN (?, ?)` / `NOT IN (?, ?)` | list |
| `between` / `not_between` | `BETWEEN ? AND ?` / `NOT BETWEEN ? AND ?` | list of two |
| `begins_with` / `not_begins_with` | `LIKE` / `NOT LIKE` with `value%` | string |
| `contains` / `not_contains` | `LIKE` / `NOT LIKE` with `%value%` | string |
| `ends_with` / `not_ends_with` | `LIKE` / `NOT LIKE` with `%value` | string |
| `is_empty` / `is_not_empty` | `= ""` / `<> ""` | none |
| `is_null` / `is_not_null` | `IS NULL` / `IS NOT NULL` | none |

## Part 1: PHP

Namespace `Andmemasin\QueryBuilder`, PHP 8.2+, no runtime dependencies.

Public API (kept close to what applications call today, so moving to this package is a namespace change):

- `Rule`: value object built from the decoded array (`new Rule(array $attributes)`); public `condition`, `rules` (raw), `children` (`Rule[]`), `id`, `field`, `type`, `input`, `operator`, `value`, `valid`. A rule with `condition` set is a group.
- `Translator`: `new Translator(array|Rule $rules, ?string $paramPrefix = null, ?callable $fieldQuoter = null)`; `where(): string`; `params(): array<string, mixed>`; `static quoteMysqlIdentifier(string $field): string` (each dot segment wrapped in backticks, backticks doubled; usable as `Translator::quoteMysqlIdentifier(...)`).
- `RuleHelper`: `static addPrefixToRules(Rule $rules, string $prefix): Rule` (adds `prefix.` to fields that have no dot), `static removePrefixFromRules(Rule $rules, string $prefix): Rule` (removes `prefix.`).

Behaviour (the parity contract; existing applications depend on every point):

- Output for a group: `(` + parts joined by ` <condition> ` + `)`; nested groups give nested parentheses. A group without children gives `''`.
- Each condition: `<field> <sql>`; field passed through the quoter when one is given, otherwise as is.
- Parameters are named `:<prefix>_<n>`, prefix `p` by default, `n` counting from 0 across the whole tree in document order (nested groups continue the count).
- List operators get one parameter per element, joined by `, ` (`in`) or ` AND ` (`between`).
- `LIKE` operators bind the wrapped value (`joe%`, `%joe%`, `%joe`).
- Values are bound as given (no casting); consumers cast when they need to.
- `equal` / `not_equal` with value `null` become `IS NULL` / `IS NOT NULL` with no parameter.
- Operators without a value (`is_empty`, `is_not_empty`, `is_null`, `is_not_null`) never add parameters, even if a value is present.
- Conditions without `field` or `operator` are skipped.
- An unknown operator throws `InvalidArgumentException` (the only intended difference from current behaviour, which fails with an undefined-index error).

Tests: PHPUnit. A fixture file of input rules with the expected `where()` and `params()` covers every point above; the expected values must equal what applications get today. Plus a PDO round trip on SQLite (create a table, insert rows, run the translated `WHERE`, check the selected ids). PHPStan at level 8.

## Part 2: browser component `<query-builder>`

- Written with Lit; searchable selects with Tom Select. No jQuery, no React.
- Shadow DOM with its own CSS built from Tailwind, so it looks the same on any page (Bootstrap pages today, Tailwind or Filament pages later). Colours and spacing exposed as CSS custom properties (`--qb-*`) for theming.
- Built with a bundler into one self-contained ES module `dist/query-builder.js` (Lit, Tom Select and CSS inside). `dist/` is committed so consumers need no Node and no build. Source in `js/`, build config in the repository root.
- Form-associated custom element (`ElementInternals`): with a `name` attribute it submits the rules JSON as a normal form field. No hidden input needed.

Inputs:

- `filters` (property, or `filters` attribute with JSON): field definitions in the jQuery QueryBuilder filter shape, so existing configuration can be passed as is: `id`, `label`, `type` (`string`, `integer`, `double`, `date`, `boolean`), `input` (`text`, `number`, `select`, `radio`, `checkbox`), `values` (object `{value: label}` or list of `{value: label}`), `operators` (allowed subset), `multiple`.
- `rules` (property, or `rules` attribute with JSON): initial rules.
- `texts` (property): UI strings; English defaults.

Outputs:

- `value` / `rules` property: current rules JSON (with `valid`).
- `valid` property: whether every condition is complete (field, operator, value of the right shape).
- `change` event after every edit, `detail: {rules, valid}`.

Covers: nested AND/OR groups (add, remove), add and remove conditions, searchable field picker, operator list filtered by field type and the filter's `operators`, value inputs per operator (single value, two values for `between`, multiple for `in`, none for null/empty operators), select values from `values`. Numbers stay numbers in the output for `integer`/`double` fields.

Not in the first version: drag and drop, async value search, custom operators.

Tests: `node --test` with a DOM implementation for the component logic (rules in, edit, rules out, validity, form value), plus one check in a real browser of the built `dist/query-builder.js` (including Tom Select dropdowns inside the shadow root).

## Repository layout

```
src/            PHP
tests/          PHPUnit tests and fixtures
js/             component source
tests-js/       node tests
dist/           built component (committed)
docs/
```
