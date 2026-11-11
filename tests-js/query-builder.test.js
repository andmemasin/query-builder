import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
const { operatorsFor } = await import('../dist/query-builder.js');

const FILTERS = [
    { id: 'age', label: 'Age', type: 'integer', input: 'number' },
    { id: 'sex', label: 'Sex', type: 'integer', input: 'select', values: { 1: 'Male', 2: 'Female' } },
    { id: 'region', label: 'Region', type: 'string', input: 'select', values: [{ 1: 'North' }, { 4: 'West' }] },
    { id: 'name', label: 'Name', type: 'string' },
    { id: 'income', label: 'Income', type: 'double', operators: ['equal', 'between', 'contains'] },
    { id: 'consent', label: 'Consent', type: 'boolean' },
];

// The example from docs/design.md.
const EXAMPLE = {
    condition: 'AND', rules: [
        { id: 'age', field: 'age', type: 'integer', input: 'number', operator: 'between', value: [15, 74] },
        {
            condition: 'OR', rules: [
                { id: 'sex', field: 'sex', type: 'integer', input: 'select', operator: 'equal', value: 1 },
                { id: 'region', field: 'region', type: 'string', input: 'select', operator: 'in', value: ['1', '4'] },
            ],
        },
    ], valid: true,
};

after(() => {
    document.body.innerHTML = '';
    GlobalRegistrator.unregister();
});

async function mount(rules = null, filters = FILTERS) {
    document.body.innerHTML = '';
    const el = document.createElement('query-builder');
    el.filters = filters;
    if (rules) el.rules = rules;
    document.body.append(el);
    await el.updateComplete;
    return el;
}

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const button = (el, text) => $$(el, 'button').find(b => b.textContent.trim() === text);

async function addConditionWithField(el, id) {
    button(el, 'Add condition').click();
    await el.updateComplete;
    const picker = $$(el, 'qb-select').at(-1);
    picker.dispatchEvent(new CustomEvent('qb-change', { detail: id }));
    await el.updateComplete;
    return el.value.rules.at(-1);
}

async function type(input, text) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
}

test('round trip of the design example keeps the rules unchanged', async () => {
    const el = await mount(EXAMPLE);
    assert.deepEqual(el.value, EXAMPLE);
    assert.deepEqual(el.rules, EXAMPLE);
    assert.equal(el.valid, true);
});

test('rules and filters can be given as JSON attributes', async () => {
    document.body.innerHTML = `<query-builder filters='${JSON.stringify(FILTERS)}' rules='${JSON.stringify(EXAMPLE)}'></query-builder>`;
    const el = document.querySelector('query-builder');
    await el.updateComplete;
    assert.deepEqual(el.value, EXAMPLE);
    assert.equal($$(el, 'qb-select').length, 5);
});

test('starts with an empty, valid root group', async () => {
    const el = await mount();
    assert.deepEqual(el.value, { condition: 'AND', rules: [], valid: true });
});

test('condition case is kept as given', async () => {
    const el = await mount({ condition: 'or', rules: [] });
    assert.equal(el.value.condition, 'or');
    assert.equal(button(el, 'OR').getAttribute('aria-pressed'), 'true');
});

test('adding a condition, picking a field and typing a number', async () => {
    const el = await mount();
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));

    button(el, 'Add condition').click();
    await el.updateComplete;
    assert.equal(el.valid, false);
    assert.deepEqual(events.at(-1).rules.rules[0], { id: null, field: null, type: null, input: null, operator: null });

    const rule = await addConditionWithField(el, 'age');
    assert.deepEqual(rule, { id: 'age', field: 'age', type: 'integer', input: 'number', operator: 'equal' });
    $$(el, 'button').filter(b => b.getAttribute('aria-label') === 'Remove condition')[0].click();
    await el.updateComplete;

    await type($(el, 'input[aria-label="Value"]'), '42');
    await el.updateComplete;
    assert.deepEqual(el.value.rules, [{ id: 'age', field: 'age', type: 'integer', input: 'number', operator: 'equal', value: 42 }]);
    assert.equal(el.valid, true);
    assert.deepEqual(events.at(-1), { rules: el.value, valid: true });
});

test('between takes two values, null operators take none', async () => {
    const el = await mount();
    await addConditionWithField(el, 'age');
    const operator = $(el, 'select[aria-label="Operator"]');
    operator.value = 'between';
    operator.dispatchEvent(new Event('change'));
    await el.updateComplete;
    await type($(el, 'input[aria-label="From"]'), '15');
    await el.updateComplete;
    assert.equal(el.valid, false);
    await type($(el, 'input[aria-label="To"]'), '74');
    await el.updateComplete;
    assert.deepEqual(el.value.rules[0].value, [15, 74]);
    assert.equal(el.valid, true);

    operator.value = 'is_null';
    operator.dispatchEvent(new Event('change'));
    await el.updateComplete;
    assert.equal($(el, 'input[aria-label="From"]'), null);
    assert.equal('value' in el.value.rules[0], false);
    assert.equal(el.valid, true);
});

test('select values keep the filter type: numbers for integer, strings for string', async () => {
    const el = await mount();
    await addConditionWithField(el, 'sex');
    const operator = $(el, 'select[aria-label="Operator"]');
    operator.value = 'in';
    operator.dispatchEvent(new Event('change'));
    await el.updateComplete;
    $$(el, 'qb-select').at(-1).dispatchEvent(new CustomEvent('qb-change', { detail: ['1', '2'] }));
    await el.updateComplete;
    assert.deepEqual(el.value.rules[0].value, [1, 2]);

    await addConditionWithField(el, 'region');
    $$(el, 'qb-select').at(-1).dispatchEvent(new CustomEvent('qb-change', { detail: '4' }));
    await el.updateComplete;
    assert.deepEqual(el.value.rules[1].value, '4');
    assert.equal(el.valid, true);
});

test('boolean fields use yes/no radios and give booleans', async () => {
    const el = await mount();
    await addConditionWithField(el, 'consent');
    const radios = $$(el, 'input[type="radio"]');
    assert.equal(radios.length, 2);
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change'));
    await el.updateComplete;
    assert.equal(el.value.rules[0].value, false);
    assert.equal(el.valid, true);
});

test('operator list follows the type and the filter operators', () => {
    assert.deepEqual(operatorsFor({ type: 'boolean' }), ['equal', 'not_equal', 'is_null', 'is_not_null']);
    assert.ok(operatorsFor({ type: 'string' }).includes('contains'));
    assert.ok(!operatorsFor({ type: 'integer' }).includes('contains'));
    assert.deepEqual(operatorsFor({ type: 'double', operators: ['equal', 'between', 'contains'] }), ['equal', 'between']);
});

test('validity', async () => {
    const rule = (operator, value) => ({ id: 'age', field: 'age', type: 'integer', input: 'number', operator, value });
    const valid = async (rules) => (await mount({ condition: 'AND', rules })).valid;
    assert.equal(await valid([rule('equal', 5)]), true);
    assert.equal(await valid([rule('equal', 5.5)]), false, 'integer field with a fraction');
    assert.equal(await valid([rule('equal', '')]), false);
    assert.equal(await valid([rule('equal', [5])]), false);
    assert.equal(await valid([rule('between', [1])]), false);
    assert.equal(await valid([rule('in', [])]), false);
    assert.equal(await valid([rule('in', [1, 2])]), true);
    assert.equal(await valid([rule('contains', 'x')]), false, 'operator not allowed for integer');
    assert.equal(await valid([{ ...rule('contains', 1), id: 'income', field: 'income', type: 'double' }]), false, 'not in filter operators');
    assert.equal(await valid([{ condition: 'OR', rules: [] }]), false, 'empty nested group');
    assert.equal(await valid([{ condition: 'OR', rules: [rule('is_null')] }]), true);
});

test('rules for unknown fields are kept and count as invalid', async () => {
    const unknown = { id: 'gone', field: 'gone', type: 'string', input: 'text', operator: 'equal', value: 'x' };
    const el = await mount({ condition: 'AND', rules: [unknown] });
    assert.deepEqual(el.value.rules, [unknown]);
    assert.equal(el.valid, false);
    assert.match(el.shadowRoot.textContent, /Unknown field: gone/);
});

test('labels and values are rendered as text, not HTML', async () => {
    const el = await mount({ condition: 'AND', rules: [{ id: 'x', field: '<img src=x onerror=alert(1)>', operator: 'equal' }] }, [
        { id: 'r', label: '<b>bold</b>', type: 'string', input: 'radio', values: { a: '<i>A</i>' } },
    ]);
    assert.equal($(el, 'img'), null);
    await addConditionWithField(el, 'r');
    assert.equal($(el, 'i'), null);
    assert.match(el.shadowRoot.textContent, /<i>A<\/i>/);
});

test('removing a group and texts override', async () => {
    const el = await mount(EXAMPLE);
    el.texts = { removeGroup: 'Drop group', operators: { between: 'from..to' } };
    await el.updateComplete;
    assert.ok([...$(el, 'select[aria-label="Operator"]').options].some(o => o.textContent === 'from..to'));
    $$(el, 'button').find(b => b.getAttribute('aria-label') === 'Drop group').click();
    await el.updateComplete;
    assert.equal(el.value.rules.length, 1);
});

test('sets the rules JSON as its form value', async () => {
    // happy-dom has no ElementInternals; this stub records what the component hands to the form.
    // The real FormData submission is checked in a browser with demo/index.html.
    const formValues = [];
    HTMLElement.prototype.attachInternals = () => ({ setFormValue: (value) => formValues.push(value) });
    try {
        const el = document.createElement('query-builder');
        el.filters = FILTERS;
        el.rules = EXAMPLE;
        document.body.replaceChildren(el);
        await el.updateComplete;
        assert.deepEqual(JSON.parse(formValues.at(-1)), EXAMPLE);
        button(el, 'Add condition').click();
        await el.updateComplete;
        assert.equal(JSON.parse(formValues.at(-1)).rules.length, 3);
    } finally {
        delete HTMLElement.prototype.attachInternals;
    }
});

test('readonly shows the rules as text without editing controls', async () => {
    const unknown = { id: 'gone', field: 'gone', type: 'string', input: 'text', operator: 'equal', value: 'x' };
    const rules = { ...EXAMPLE, rules: [...EXAMPLE.rules, unknown, { id: 'name', field: 'name', operator: 'contains', value: '<b>x</b>' }] };
    document.body.innerHTML = `<query-builder readonly filters='${JSON.stringify(FILTERS)}'></query-builder>`;
    const el = document.querySelector('query-builder');
    el.rules = rules;
    await el.updateComplete;
    assert.equal(el.readonly, true);
    assert.deepEqual($$(el, 'button, input, select, qb-select'), []);
    assert.equal($(el, 'b'), null);
    assert.equal(el.shadowRoot.textContent.replace(/\s+/g, ' ').trim(),
        'Age between 15 and 74 AND (Sex equals Male OR Region is one of North, West) AND Unknown field: gone AND Name contains "<b>x</b>"');
    assert.deepEqual(el.value.rules, rules.rules);
});

test('readonly with no rules shows a placeholder', async () => {
    const el = await mount();
    el.readonly = true;
    await el.updateComplete;
    assert.equal(el.shadowRoot.textContent.trim(), 'No conditions');
});

test('readonly reflects between attribute and property and toggles the mode', async () => {
    const el = await mount(EXAMPLE);
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    assert.equal(el.readonly, false);
    assert.ok(button(el, 'Add condition'));

    el.readonly = true;
    await el.updateComplete;
    assert.equal(el.hasAttribute('readonly'), true);
    assert.equal(button(el, 'Add condition'), undefined);

    el.removeAttribute('readonly');
    await el.updateComplete;
    assert.equal(el.readonly, false);
    assert.ok(button(el, 'Add condition'));

    el.setAttribute('readonly', '');
    await el.updateComplete;
    assert.equal(el.readonly, true);
    assert.deepEqual($$(el, 'button, input, select, qb-select'), []);
    el.edit(() => el.root.rules.pop());
    assert.deepEqual(events, []);
    assert.deepEqual(el.value, EXAMPLE);
});
