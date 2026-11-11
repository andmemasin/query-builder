<?php

declare(strict_types=1);

namespace Andmemasin\QueryBuilder;

/**
 * Rewrites the fields of a rules tree in place.
 */
class RuleHelper
{
    /**
     * Prepends `$prefix.` to every condition field that has no dot yet.
     */
    public static function addPrefixToRules(Rule $rules, string $prefix): Rule
    {
        foreach ($rules->children as $child) {
            if ($child->condition !== null) {
                self::addPrefixToRules($child, $prefix);
            } elseif ($child->field !== null && !str_contains($child->field, '.')) {
                $child->field = $prefix . '.' . $child->field;
            }
        }
        return $rules;
    }

    /**
     * Removes every occurrence of `$prefix.` from condition fields.
     */
    public static function removePrefixFromRules(Rule $rules, string $prefix): Rule
    {
        foreach ($rules->children as $child) {
            if ($child->condition !== null) {
                self::removePrefixFromRules($child, $prefix);
            } elseif ($child->field !== null) {
                $child->field = str_replace($prefix . '.', '', $child->field);
            }
        }
        return $rules;
    }
}
