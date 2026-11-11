<?php

declare(strict_types=1);

namespace Andmemasin\QueryBuilder;

/**
 * One node of decoded rules JSON: a group (has `condition`) or a condition (has `field` and `operator`).
 */
class Rule
{
    public ?bool $valid;
    public ?string $condition;

    public int|string|null $id;
    public ?string $field;
    public ?string $type;
    public ?string $input;
    public ?string $operator;
    public mixed $value;

    /** @var array<mixed> rules as given in the input */
    public array $rules;

    /** @var list<Rule> the array entries of `rules` as objects */
    public array $children = [];

    /**
     * @param array<string, mixed> $attributes one decoded rules JSON node
     */
    public function __construct(array $attributes = [])
    {
        $this->valid = $attributes['valid'] ?? null;
        $this->condition = $attributes['condition'] ?? null;
        $this->id = $attributes['id'] ?? null;
        $field = $attributes['field'] ?? null;
        // stored JSON may hold numeric field ids
        $this->field = is_int($field) ? (string) $field : $field;
        $this->type = $attributes['type'] ?? null;
        $this->input = $attributes['input'] ?? null;
        $this->operator = $attributes['operator'] ?? null;
        $this->value = $attributes['value'] ?? null;
        $this->rules = $attributes['rules'] ?? [];

        foreach ($this->rules as $rule) {
            if (is_array($rule)) {
                $this->children[] = new self($rule);
            }
        }
    }
}
