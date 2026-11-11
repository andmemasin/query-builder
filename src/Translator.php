<?php

declare(strict_types=1);

namespace Andmemasin\QueryBuilder;

use Closure;
use InvalidArgumentException;

/**
 * Translates rules into a SQL WHERE clause with named parameters.
 *
 * ```php
 * $translator = new Translator(json_decode($json, true));
 * $statement = $pdo->prepare('SELECT * FROM person WHERE ' . $translator->where());
 * $statement->execute($translator->params());
 * ```
 */
class Translator
{
    /** SQL per operator; `?` marks where the parameter names go */
    private const SQL = [
        'equal' => '= ?',
        'not_equal' => '<> ?',
        'less' => '< ?',
        'less_or_equal' => '<= ?',
        'greater' => '> ?',
        'greater_or_equal' => '>= ?',
        'in' => 'IN (?)',
        'not_in' => 'NOT IN (?)',
        'between' => 'BETWEEN ?',
        'not_between' => 'NOT BETWEEN ?',
        'begins_with' => 'LIKE ?',
        'not_begins_with' => 'NOT LIKE ?',
        'contains' => 'LIKE ?',
        'not_contains' => 'NOT LIKE ?',
        'ends_with' => 'LIKE ?',
        'not_ends_with' => 'NOT LIKE ?',
        'is_empty' => '= ""',
        'is_not_empty' => '<> ""',
        'is_null' => 'IS NULL',
        'is_not_null' => 'IS NOT NULL',
    ];

    /** operators that take a list, with the separator between parameter names */
    private const LIST_SEPARATORS = [
        'in' => ', ',
        'not_in' => ', ',
        'between' => ' AND ',
        'not_between' => ' AND ',
    ];

    /** LIKE operators: text put before and after the value */
    private const LIKE_WRAPS = [
        'begins_with' => ['', '%'],
        'not_begins_with' => ['', '%'],
        'contains' => ['%', '%'],
        'not_contains' => ['%', '%'],
        'ends_with' => ['%', ''],
        'not_ends_with' => ['%', ''],
    ];

    private string $paramPrefix;

    private ?Closure $fieldQuoter;

    private string $where;

    /** @var array<string, mixed> */
    private array $params = [];

    /**
     * @param array<string, mixed>|Rule $rules decoded rules JSON, or a Rule built from it
     * @param string|null $paramPrefix parameter names become `:<prefix>_<n>`; pick distinct prefixes
     *   when params of several translators end up in one query. Defaults to `p`.
     * @param (callable(string): string)|null $fieldQuoter quotes each field before it goes into the SQL,
     *   e.g. `Translator::quoteMysqlIdentifier(...)`; null puts fields in as given
     * @throws InvalidArgumentException on an unknown operator
     */
    public function __construct(array|Rule $rules, ?string $paramPrefix = null, ?callable $fieldQuoter = null)
    {
        $this->paramPrefix = $paramPrefix ?? 'p';
        $this->fieldQuoter = $fieldQuoter === null ? null : $fieldQuoter(...);
        $this->where = $this->group(is_array($rules) ? new Rule($rules) : $rules);
    }

    /**
     * The WHERE clause, without the `WHERE` keyword; empty when there is nothing to filter on.
     */
    public function where(): string
    {
        return $this->where;
    }

    /**
     * Values to bind, keyed by parameter name (`:p_0`, `:p_1`, ...).
     *
     * @return array<string, mixed>
     */
    public function params(): array
    {
        return $this->params;
    }

    /**
     * Quotes a MySQL/MariaDB identifier: each dot separated part goes in backticks, backticks
     * inside are doubled, so `t.col` becomes `` `t`.`col` ``.
     */
    public static function quoteMysqlIdentifier(string $field): string
    {
        $parts = array_map(fn(string $part): string => '`' . str_replace('`', '``', $part) . '`', explode('.', $field));
        return implode('.', $parts);
    }

    private function group(Rule $group): string
    {
        if ($group->children === []) {
            return '';
        }
        $parts = [];
        foreach ($group->children as $child) {
            if ($child->condition !== null) {
                $parts[] = $this->group($child);
            } elseif ($child->field !== null && $child->operator !== null) {
                $parts[] = $this->condition($child->field, $child->operator, $child->value);
            }
        }
        return '(' . implode(' ' . $group->condition . ' ', $parts) . ')';
    }

    private function condition(string $field, string $operator, mixed $value): string
    {
        $sql = self::SQL[$operator] ?? throw new InvalidArgumentException("Unknown operator \"$operator\"");
        if ($this->fieldQuoter !== null) {
            $field = ($this->fieldQuoter)($field);
        }
        if ($value === null && ($operator === 'equal' || $operator === 'not_equal')) {
            return $field . ($operator === 'equal' ? ' IS NULL' : ' IS NOT NULL');
        }
        if (!str_contains($sql, '?')) {
            return $field . ' ' . $sql;
        }

        $names = [];
        foreach ($value === null ? [] : (is_array($value) ? $value : [$value]) as $item) {
            $name = ':' . $this->paramPrefix . '_' . count($this->params);
            $this->params[$name] = $item;
            $names[] = $name;
        }

        if (isset(self::LIST_SEPARATORS[$operator])) {
            return $field . ' ' . str_replace('?', implode(self::LIST_SEPARATORS[$operator], $names), $sql);
        }
        if ($names === []) {
            // shortcut: no value leaves the `?` in place, as applications get it today; validate rules before translating
            return $field . ' ' . $sql;
        }
        if (isset(self::LIKE_WRAPS[$operator])) {
            [$before, $after] = self::LIKE_WRAPS[$operator];
            $this->params[$names[0]] = $before . $this->params[$names[0]] . $after;
        }
        // a list given to a single value operator binds every item but uses the first
        return $field . ' ' . str_replace('?', $names[0], $sql);
    }
}
