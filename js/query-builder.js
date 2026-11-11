import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import styles from 'qb:styles';
import './qb-select.js';

const STRING_OPERATORS = ['equal', 'not_equal', 'in', 'not_in', 'begins_with', 'not_begins_with', 'contains', 'not_contains',
    'ends_with', 'not_ends_with', 'is_empty', 'is_not_empty', 'is_null', 'is_not_null'];
const NUMBER_OPERATORS = ['equal', 'not_equal', 'in', 'not_in', 'less', 'less_or_equal', 'greater', 'greater_or_equal',
    'between', 'not_between', 'is_null', 'is_not_null'];
const BOOLEAN_OPERATORS = ['equal', 'not_equal', 'is_null', 'is_not_null'];
const NO_VALUE = ['is_empty', 'is_not_empty', 'is_null', 'is_not_null'];
const PAIR = ['between', 'not_between'];
const LIST = ['in', 'not_in'];

export const DEFAULT_TEXTS = {
    group: 'Group',
    condition: 'Match',
    and: 'AND',
    or: 'OR',
    addCondition: 'Add condition',
    addGroup: 'Add group',
    removeCondition: 'Remove condition',
    removeGroup: 'Remove group',
    field: 'Field',
    selectField: 'Select a field',
    operator: 'Operator',
    value: 'Value',
    valueFrom: 'From',
    valueTo: 'To',
    unknownField: 'Unknown field',
    noResults: 'No results',
    addValue: 'Add',
    remove: 'Remove',
    yes: 'Yes',
    no: 'No',
    valueAnd: 'and',
    noRules: 'No conditions',
    operators: {
        equal: 'equals',
        not_equal: 'does not equal',
        in: 'is one of',
        not_in: 'is not one of',
        less: 'less than',
        less_or_equal: 'less than or equal to',
        greater: 'greater than',
        greater_or_equal: 'greater than or equal to',
        between: 'between',
        not_between: 'not between',
        begins_with: 'begins with',
        not_begins_with: 'does not begin with',
        contains: 'contains',
        not_contains: 'does not contain',
        ends_with: 'ends with',
        not_ends_with: 'does not end with',
        is_empty: 'is empty',
        is_not_empty: 'is not empty',
        is_null: 'is null',
        is_not_null: 'is not null',
    },
};

const CONTROL = 'h-9 rounded-(--qb-radius) border border-(--qb-border) bg-(--qb-bg) px-2 text-inherit focus-visible:outline-2 focus-visible:outline-(--qb-accent)';
const BUTTON = 'inline-flex h-9 cursor-pointer items-center rounded-(--qb-radius) border border-(--qb-border) bg-(--qb-bg) px-3 hover:bg-(--qb-group-bg) focus-visible:outline-2 focus-visible:outline-(--qb-accent)';
const REMOVE = 'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--qb-radius) text-lg leading-none text-(--qb-danger) hover:bg-(--qb-danger)/10 focus-visible:outline-2 focus-visible:outline-(--qb-accent)';

const isGroup = (node) => node !== null && typeof node === 'object' && Array.isArray(node.rules);
const isNumeric = (filter) => filter.type === 'integer' || filter.type === 'double';
const emptyCondition = () => ({ id: null, field: null, type: null, input: null, operator: null });

/** Converts a raw input or option key to the filter's type: numbers for integer/double, booleans for boolean. */
export function castValue(filter, raw) {
    if (isNumeric(filter)) return raw === '' || raw === null ? '' : Number(raw);
    if (filter.type === 'boolean') return raw === true || raw === 1 || raw === '1' || raw === 'true';
    return raw;
}

export function operatorsFor(filter) {
    const type = filter.type ?? 'string';
    const byType = type === 'string' ? STRING_OPERATORS : type === 'boolean' ? BOOLEAN_OPERATORS : NUMBER_OPERATORS;
    return Array.isArray(filter.operators) ? filter.operators.filter(o => byType.includes(o)) : byType;
}

function inputFor(filter) {
    if (filter.input) return filter.input;
    if (filter.type === 'boolean') return 'radio';
    if (filter.values) return 'select';
    return isNumeric(filter) ? 'number' : 'text';
}

/** Value shape for a filter and operator: 'none', 'one', 'pair' or 'list'. */
function shapeOf(filter, operator) {
    if (NO_VALUE.includes(operator)) return 'none';
    if (PAIR.includes(operator)) return 'pair';
    if (LIST.includes(operator) || filter.multiple || inputFor(filter) === 'checkbox') return 'list';
    return 'one';
}

/** Filter `values` (object, or list of one-entry objects) as [{value, label}]. */
function valuesFor(filter, texts) {
    if (!filter.values) {
        return filter.type === 'boolean' ? [{ value: true, label: texts.yes }, { value: false, label: texts.no }] : [];
    }
    const entries = Array.isArray(filter.values)
        ? filter.values.flatMap(v => (v !== null && typeof v === 'object' ? Object.entries(v) : [[v, v]]))
        : Object.entries(filter.values);
    return entries.map(([value, label]) => ({ value: castValue(filter, value), label: String(label) }));
}

function scalarOk(filter, value) {
    if (value === null || value === undefined || value === '' || Array.isArray(value) || typeof value === 'object') return false;
    if (!isNumeric(filter)) return true;
    const n = Number(value);
    return Number.isFinite(n) && (filter.type !== 'integer' || Number.isInteger(n));
}

let uid = 0;

/**
 * <query-builder>: edits jQuery QueryBuilder compatible rules JSON.
 *
 * Inputs: `filters`, `rules` (property or JSON attribute), `texts` (property), `readonly` (boolean attribute/property).
 * Outputs: `value` / `rules`, `valid`, and a `change` event with detail {rules, valid}.
 * With a `name` attribute it submits the rules JSON as a form field.
 */
export class QueryBuilder extends LitElement {
    static formAssociated = true;
    static styles = unsafeCSS(styles);
    static properties = {
        filters: { type: Array },
        rules: { type: Object, noAccessor: true },
        texts: { attribute: false },
        readonly: { type: Boolean, reflect: true },
    };

    constructor() {
        super();
        this.filters = [];
        this.texts = {};
        this.readonly = false;
        this.root = { condition: 'AND', rules: [] };
        this.given = null;
        this.ids = new WeakMap();
        this.internals = this.attachInternals?.();
    }

    /** Current rules with `valid`. Returns a copy; edit through the UI or assign a new value. */
    get rules() {
        return { ...structuredClone(this.root), valid: this.valid };
    }

    set rules(value) {
        this.given = value;
        let parsed = typeof value === 'string' ? (value.trim() === '' ? null : JSON.parse(value)) : value;
        parsed = isGroup(parsed) ? structuredClone(parsed) : { condition: 'AND', rules: [] };
        delete parsed.valid;
        parsed.condition ??= 'AND';
        this.root = parsed;
        this.requestUpdate();
    }

    get value() {
        return this.rules;
    }

    set value(value) {
        this.rules = value;
    }

    get valid() {
        return this.nodeValid(this.root, true);
    }

    get t() {
        const texts = this.texts ?? {};
        return { ...DEFAULT_TEXTS, ...texts, operators: { ...DEFAULT_TEXTS.operators, ...texts.operators } };
    }

    formResetCallback() {
        this.rules = this.given;
    }

    willUpdate() {
        this.internals?.setFormValue?.(JSON.stringify(this.rules));
    }

    filterOf(rule) {
        const filters = Array.isArray(this.filters) ? this.filters : [];
        if (rule.id !== null && rule.id !== undefined) {
            const byId = filters.find(f => String(f.id) === String(rule.id));
            if (byId) return byId;
        }
        if (rule.field === null || rule.field === undefined) return undefined;
        return filters.find(f => String(f.field ?? f.id) === String(rule.field));
    }

    nodeValid(node, isRoot = false) {
        if (isGroup(node)) return (isRoot || node.rules.length > 0) && node.rules.every(n => this.nodeValid(n));
        const filter = this.filterOf(node);
        if (!filter || !operatorsFor(filter).includes(node.operator)) return false;
        const value = node.value;
        switch (shapeOf(filter, node.operator)) {
            case 'none': return true;
            case 'one': return scalarOk(filter, value);
            case 'pair': return Array.isArray(value) && value.length === 2 && value.every(v => scalarOk(filter, v));
            default: return Array.isArray(value) && value.length > 0 && value.every(v => scalarOk(filter, v));
        }
    }

    edit(change) {
        if (this.readonly) return;
        change();
        this.requestUpdate();
        const rules = this.rules;
        this.dispatchEvent(new CustomEvent('change', { detail: { rules, valid: rules.valid }, bubbles: true, composed: true }));
    }

    setField(rule, id) {
        const filter = (this.filters ?? []).find(f => String(f.id) === String(id));
        this.edit(() => {
            for (const key of Object.keys(rule)) delete rule[key];
            if (!filter) return Object.assign(rule, emptyCondition());
            const operators = operatorsFor(filter);
            Object.assign(rule, {
                id: filter.id,
                field: filter.field ?? filter.id,
                type: filter.type ?? 'string',
                input: inputFor(filter),
                operator: operators[0] ?? null,
            });
        });
    }

    setOperator(rule, filter, operator) {
        this.edit(() => {
            if (shapeOf(filter, operator) !== shapeOf(filter, rule.operator) || shapeOf(filter, operator) === 'none') delete rule.value;
            rule.operator = operator;
        });
    }

    setValue(rule, value, index = null) {
        this.edit(() => {
            if (index === null) {
                rule.value = value;
                return;
            }
            const pair = Array.isArray(rule.value) ? [...rule.value] : ['', ''];
            pair[index] = value;
            rule.value = pair;
        });
    }

    idOf(rule) {
        if (!this.ids.has(rule)) this.ids.set(rule, `qb${++uid}`);
        return this.ids.get(rule);
    }

    render() {
        if (!this.readonly) return this.renderGroup(this.root, null);
        return html`<div class="leading-snug">${this.root.rules.length
            ? this.renderText(this.root, true) : html`<span class="opacity-60">${this.t.noRules}</span>`}</div>`;
    }

    /** Read-only view: the rules as one compact line of text, nested groups in parentheses. */
    renderText(node, isRoot = false) {
        const t = this.t;
        if (isGroup(node)) {
            const condition = String(node.condition).toUpperCase() === 'OR' ? t.or : t.and;
            const parts = node.rules.map((n, i) => html`${i ? html` <span class="font-semibold text-(--qb-accent)">${condition}</span> ` : nothing}${this.renderText(n)}`);
            return isRoot ? parts : html`(${parts})`;
        }
        const filter = this.filterOf(node);
        if (!filter) {
            return node.id == null && node.field == null
                ? html`<span class="opacity-60">${t.selectField}</span>`
                : html`<span class="text-(--qb-danger)">${t.unknownField}: ${String(node.field ?? node.id)}</span>`;
        }
        const options = valuesFor(filter, t);
        const text = (v) => options.find(o => String(o.value) === String(v))?.label
            ?? (options.length || isNumeric(filter) ? String(v) : `"${v}"`);
        const value = node.value;
        let shown = nothing;
        switch (shapeOf(filter, node.operator)) {
            case 'none': break;
            case 'pair': shown = Array.isArray(value) ? `${text(value[0])} ${t.valueAnd} ${text(value[1])}` : ''; break;
            case 'list': shown = (Array.isArray(value) ? value : [value]).filter(v => v != null).map(text).join(', '); break;
            default: shown = value == null ? '' : text(value);
        }
        return html`<span class="font-medium">${filter.label ?? filter.id}</span> ${t.operators[node.operator] ?? node.operator ?? ''} ${shown}`;
    }

    renderGroup(group, parent) {
        const t = this.t;
        const current = String(group.condition).toUpperCase();
        return html`
            <div role="group" aria-label=${t.group}
                class="flex flex-col gap-(--qb-gap) rounded-(--qb-radius) border border-(--qb-border) bg-(--qb-group-bg) p-(--qb-gap)">
                <div class="flex flex-wrap items-center gap-(--qb-gap)">
                    <div role="group" aria-label=${t.condition} class="inline-flex">
                        ${['AND', 'OR'].map(c => html`
                            <button type="button" aria-pressed=${String(current === c)}
                                class="${BUTTON} first:rounded-r-none last:rounded-l-none last:-ml-px aria-pressed:border-(--qb-accent) aria-pressed:bg-(--qb-accent) aria-pressed:text-(--qb-accent-text)"
                                @click=${() => this.edit(() => { group.condition = c; })}>${c === 'AND' ? t.and : t.or}</button>`)}
                    </div>
                    <button type="button" class=${BUTTON} @click=${() => this.edit(() => group.rules.push(emptyCondition()))}>${t.addCondition}</button>
                    <button type="button" class=${BUTTON}
                        @click=${() => this.edit(() => group.rules.push({ condition: 'AND', rules: [emptyCondition()] }))}>${t.addGroup}</button>
                    ${parent ? html`
                        <button type="button" class="${REMOVE} ml-auto" aria-label=${t.removeGroup} title=${t.removeGroup}
                            @click=${() => this.edit(() => parent.rules.splice(parent.rules.indexOf(group), 1))}>&times;</button>` : nothing}
                </div>
                ${group.rules.length ? html`
                    <ul class="flex flex-col gap-(--qb-gap) border-l-2 border-(--qb-border) pl-(--qb-gap)">
                        ${repeat(group.rules, node => node, node => html`
                            <li>${isGroup(node) ? this.renderGroup(node, group) : this.renderCondition(node, group)}</li>`)}
                    </ul>` : nothing}
            </div>`;
    }

    renderCondition(rule, group) {
        const t = this.t;
        const filter = this.filterOf(rule);
        const remove = html`
            <button type="button" class="${REMOVE} mt-1 ml-auto" aria-label=${t.removeCondition} title=${t.removeCondition}
                @click=${() => this.edit(() => group.rules.splice(group.rules.indexOf(rule), 1))}>&times;</button>`;
        const isNew = rule.id == null && rule.field == null;
        if (!filter && !isNew) {
            return html`<div class="flex flex-wrap items-center gap-(--qb-gap)">
                <span class="text-(--qb-danger)">${t.unknownField}: ${String(rule.field ?? rule.id)}</span>${remove}</div>`;
        }
        const filters = Array.isArray(this.filters) ? this.filters : [];
        return html`
            <div class="flex flex-wrap items-start gap-(--qb-gap)">
                <qb-select class="block w-56 max-w-full"
                    .config=${{
                        options: filters.map(f => ({ value: f.id, label: f.label ?? f.id })),
                        value: filter?.id ?? null,
                        label: t.field,
                        placeholder: t.selectField,
                        texts: t,
                    }}
                    @qb-change=${(e) => this.setField(rule, e.detail)}></qb-select>
                ${filter ? html`
                    <select class=${CONTROL} aria-label=${t.operator}
                        @change=${(e) => this.setOperator(rule, filter, e.target.value)}>
                        ${rule.operator && !operatorsFor(filter).includes(rule.operator) ? html`<option selected value=${rule.operator}>${rule.operator}</option>` : nothing}
                        ${operatorsFor(filter).map(o => html`<option value=${o} ?selected=${o === rule.operator}>${t.operators[o] ?? o}</option>`)}
                    </select>
                    ${this.renderValue(rule, filter)}` : nothing}
                ${remove}
            </div>`;
    }

    renderValue(rule, filter) {
        const t = this.t;
        const shape = shapeOf(filter, rule.operator);
        const input = inputFor(filter);
        const options = valuesFor(filter, t);
        const fromOption = (s) => options.find(o => String(o.value) === s)?.value ?? castValue(filter, s);
        if (shape === 'none') return nothing;
        if (shape === 'pair') {
            const pair = Array.isArray(rule.value) ? rule.value : [];
            return html`${this.renderInput(rule, filter, pair[0], t.valueFrom, 0)}${this.renderInput(rule, filter, pair[1], t.valueTo, 1)}`;
        }
        if (shape === 'list') {
            const list = Array.isArray(rule.value) ? rule.value : [];
            if (input === 'checkbox' && options.length) {
                return this.renderChoices(rule, options, 'checkbox', (o) => list.some(v => String(v) === String(o.value)),
                    (o, checked) => this.setValue(rule, checked ? [...list, o.value] : list.filter(v => String(v) !== String(o.value))));
            }
            return html`<qb-select class="block min-w-56 max-w-full"
                .config=${{
                    options,
                    value: list,
                    multiple: true,
                    create: options.length === 0,
                    createFilter: isNumeric(filter) ? (s) => scalarOk(filter, s.trim()) : null,
                    label: t.value,
                    texts: t,
                }}
                @qb-change=${(e) => this.setValue(rule, e.detail.map(fromOption))}></qb-select>`;
        }
        if (options.length && input === 'radio') {
            return this.renderChoices(rule, options, 'radio', (o) => String(o.value) === String(rule.value), (o) => this.setValue(rule, o.value));
        }
        if (options.length) {
            return html`<qb-select class="block w-56 max-w-full"
                .config=${{ options, value: rule.value ?? null, label: t.value, placeholder: t.value, texts: t }}
                @qb-change=${(e) => this.setValue(rule, e.detail === '' ? '' : fromOption(e.detail))}></qb-select>`;
        }
        return this.renderInput(rule, filter, rule.value, t.value, null);
    }

    renderInput(rule, filter, value, label, index) {
        return html`<input class="${CONTROL} w-40" type=${isNumeric(filter) ? 'number' : 'text'}
            step=${filter.type === 'integer' ? '1' : 'any'} aria-label=${label} .value=${value ?? ''}
            @input=${(e) => {
                // Partly typed numbers (like "1.") read as empty; keep the last good value until the input is valid again.
                if (e.target.validity?.badInput) return;
                this.setValue(rule, castValue(filter, e.target.value), index);
            }}>`;
    }

    renderChoices(rule, options, type, isChecked, onChange) {
        const name = this.idOf(rule);
        return html`<fieldset class="flex min-h-9 flex-wrap items-center gap-x-3">
            <legend class="sr-only">${this.t.value}</legend>
            ${options.map(o => html`<label class="inline-flex items-center gap-1">
                <input type=${type} name=${name} class="accent-(--qb-accent)" .checked=${isChecked(o)}
                    @change=${(e) => onChange(o, e.target.checked)}>${o.label}</label>`)}
        </fieldset>`;
    }
}

if (!customElements.get('query-builder')) customElements.define('query-builder', QueryBuilder);
