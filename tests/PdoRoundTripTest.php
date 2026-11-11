<?php

declare(strict_types=1);

namespace Andmemasin\QueryBuilder\Tests;

use Andmemasin\QueryBuilder\Translator;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\RequiresPhpExtension;
use PHPUnit\Framework\TestCase;

#[RequiresPhpExtension('pdo_sqlite')]
class PdoRoundTripTest extends TestCase
{
    private const PEOPLE = [
        [1, 'Joe', 25, 'tallinn', '2015-01-10'],
        [2, 'Bruce', 40, 'tartu', '2015-02-01'],
        [3, 'Paul', 17, '', '2014-12-31'],
        [4, 'Kurt Cobain', 27, null, '2015-01-30'],
        [5, 'Thomas', 74, 'tallinn', null],
    ];

    /**
     * @return array<string, array{array<string, mixed>, list<int>}>
     */
    public static function queries(): array
    {
        $and = fn(array ...$rules): array => ['condition' => 'AND', 'rules' => $rules];
        $or = fn(array ...$rules): array => ['condition' => 'OR', 'rules' => $rules];
        $rule = fn(string $field, string $operator, mixed $value = null): array
            => ['field' => $field, 'operator' => $operator, 'value' => $value];

        return [
            'equal' => [$and($rule('name', 'equal', 'Joe')), [1]],
            'not_equal' => [$and($rule('name', 'not_equal', 'Joe')), [2, 3, 4, 5]],
            'equal null' => [$and($rule('city', 'equal')), [4]],
            'not_equal null' => [$and($rule('city', 'not_equal')), [1, 2, 3, 5]],
            'less and greater_or_equal' => [$and($rule('age', 'less', 40), $rule('age', 'greater_or_equal', 25)), [1, 4]],
            'in' => [$and($rule('city', 'in', ['tallinn', 'tartu'])), [1, 2, 5]],
            'not_in' => [$and($rule('id', 'not_in', [1, 2])), [3, 4, 5]],
            'between' => [$and($rule('joined', 'between', ['2015-01-01', '2015-01-30'])), [1, 4]],
            'not_between' => [$and($rule('age', 'not_between', [18, 60])), [3, 5]],
            'begins_with' => [$and($rule('name', 'begins_with', 'Ku')), [4]],
            'contains' => [$and($rule('name', 'contains', 'o')), [1, 4, 5]],
            'not_ends_with' => [$and($rule('name', 'not_ends_with', 'e')), [3, 4, 5]],
            'is_empty' => [$and($rule('city', 'is_empty')), [3]],
            'is_null with stray value' => [$and($rule('joined', 'is_null', 'x')), [5]],
            'nested groups' => [
                $or($and($rule('city', 'equal', 'tallinn'), $rule('age', 'less', 30)), $and($rule('id', 'in', [3, 4]), $rule('city', 'is_not_null'))),
                [1, 3],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $rules
     * @param list<int> $expectedIds
     */
    #[DataProvider('queries')]
    public function testSelectsExpectedRows(array $rules, array $expectedIds): void
    {
        $pdo = new PDO('sqlite::memory:', options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('CREATE TABLE person (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, city TEXT, joined TEXT)');
        $insert = $pdo->prepare('INSERT INTO person VALUES (?, ?, ?, ?, ?)');
        foreach (self::PEOPLE as $person) {
            $insert->execute($person);
        }

        $translator = new Translator($rules, null, Translator::quoteMysqlIdentifier(...));
        $select = $pdo->prepare('SELECT `p`.`id` FROM person p WHERE ' . $translator->where() . ' ORDER BY id');
        $select->execute($translator->params());

        $this->assertSame($expectedIds, array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN)));
    }
}
