<?php

declare(strict_types=1);

namespace Andmemasin\QueryBuilder\Tests;

use Andmemasin\QueryBuilder\Rule;
use Andmemasin\QueryBuilder\RuleHelper;
use Andmemasin\QueryBuilder\Translator;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class TranslatorTest extends TestCase
{
    /**
     * Each fixture: rules, paramPrefix, optional quoter ("mysql"), removePrefix, addPrefix, and expected where and params.
     *
     * @return array<string, array{array<string, mixed>}>
     */
    public static function fixtures(): array
    {
        $json = file_get_contents(__DIR__ . '/fixtures/translations.json');
        self::assertIsString($json);
        $cases = [];
        foreach (json_decode($json, true, flags: JSON_THROW_ON_ERROR) as $fixture) {
            $cases[$fixture['name']] = [$fixture];
        }
        return $cases;
    }

    /**
     * @param array<string, mixed> $fixture
     */
    #[DataProvider('fixtures')]
    public function testFixture(array $fixture): void
    {
        $rules = new Rule($fixture['rules']);
        if (isset($fixture['removePrefix'])) {
            $rules = RuleHelper::removePrefixFromRules($rules, $fixture['removePrefix']);
        }
        if (isset($fixture['addPrefix'])) {
            $rules = RuleHelper::addPrefixToRules($rules, $fixture['addPrefix']);
        }
        $quoter = ($fixture['quoter'] ?? null) === 'mysql' ? Translator::quoteMysqlIdentifier(...) : null;

        $translator = new Translator($rules, $fixture['paramPrefix'], $quoter);

        $this->assertSame($fixture['where'], $translator->where());
        $this->assertSame($fixture['params'], $translator->params());
    }

    public function testArrayAndRuleInputGiveTheSameResult(): void
    {
        $rules = ['condition' => 'AND', 'rules' => [
            ['field' => 'a', 'operator' => 'in', 'value' => [1, 2]],
            ['condition' => 'OR', 'rules' => [['field' => 'b', 'operator' => 'contains', 'value' => 'x']]],
        ]];
        $fromArray = new Translator($rules);
        $fromRule = new Translator(new Rule($rules));

        $this->assertSame('(a IN (:p_0, :p_1) AND (b LIKE :p_2))', $fromArray->where());
        $this->assertSame($fromArray->where(), $fromRule->where());
        $this->assertSame($fromArray->params(), $fromRule->params());
    }

    public function testUnknownOperatorThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown operator "nope"');
        new Translator(['condition' => 'AND', 'rules' => [['field' => 'a', 'operator' => 'nope', 'value' => 1]]]);
    }

    public function testFieldQuoterAcceptsAnyCallable(): void
    {
        $rules = ['condition' => 'AND', 'rules' => [['field' => 't.name', 'operator' => 'equal', 'value' => 'joe']]];
        $translator = new Translator($rules, null, fn(string $field): string => "[$field]");

        $this->assertSame('([t.name] = :p_0)', $translator->where());
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function mysqlIdentifiers(): array
    {
        return [
            'plain' => ['col', '`col`'],
            'dotted' => ['t.col', '`t`.`col`'],
            'three parts' => ['db.t.col', '`db`.`t`.`col`'],
            'backtick doubled' => ['a`b', '`a``b`'],
            'injection attempt' => ['x` = 1 OR `1', '`x`` = 1 OR ``1`'],
        ];
    }

    #[DataProvider('mysqlIdentifiers')]
    public function testQuoteMysqlIdentifier(string $field, string $expected): void
    {
        $this->assertSame($expected, Translator::quoteMysqlIdentifier($field));
    }

    public function testRuleKeepsIntegerIdAndStringifiesIntegerField(): void
    {
        $rule = new Rule(['id' => 110, 'field' => 110, 'operator' => 'equal', 'value' => 3]);

        $this->assertSame(110, $rule->id);
        $this->assertSame('110', $rule->field);
        $this->assertNull($rule->condition);
    }
}
