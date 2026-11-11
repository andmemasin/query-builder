import TomSelect from 'tom-select/base';
import removeButton from 'tom-select/plugins/remove_button/plugin.js';

TomSelect.define('remove_button', removeButton);

/**
 * Searchable select used inside <query-builder>'s shadow root. It has no shadow root of its own,
 * so the builder's styles apply and Tom Select's dropdown stays inside the builder.
 *
 * Set `config` = {options: [{value, label}], value, multiple, create, createFilter, label, placeholder, texts}.
 * Fires `qb-change` with the selected option value(s) as strings.
 */
export class QbSelect extends HTMLElement {
    set config(config) {
        this._config = config;
        if (this.isConnected) this.sync();
    }

    connectedCallback() {
        this.sync();
    }

    disconnectedCallback() {
        this.ts?.destroy();
        this.ts = null;
        this.key = null;
        this.replaceChildren();
    }

    sync() {
        const c = this._config;
        if (!c) return;
        const want = c.multiple ? (c.value ?? []).map(String) : (c.value == null ? '' : String(c.value));
        const key = JSON.stringify([c.options.map(o => [String(o.value), o.label]), !!c.multiple, !!c.create, c.label, c.placeholder]);
        if (key !== this.key) {
            this.ts?.destroy();
            this.key = key;
            this.build(c, want);
            return;
        }
        if (JSON.stringify(this.ts.getValue()) !== JSON.stringify(want)) {
            for (const v of [want].flat()) if (v !== '' && !this.ts.options[v]) this.ts.addOption({ value: v, text: v });
            this.ts.setValue(want, true);
        }
    }

    build(c, want) {
        const select = document.createElement('select');
        select.multiple = !!c.multiple;
        // Tom Select's own control is the labelled combobox; the original select only holds the value.
        select.setAttribute('aria-hidden', 'true');
        this.replaceChildren(select);
        const options = c.options.map(o => ({ value: String(o.value), text: String(o.label) }));
        for (const v of [want].flat()) if (v !== '' && !options.some(o => o.value === v)) options.push({ value: v, text: v });
        const texts = c.texts ?? {};
        this.ts = new TomSelect(select, {
            options,
            items: [want].flat().filter(v => v !== ''),
            maxItems: c.multiple ? null : 1,
            create: !!c.create,
            createFilter: c.createFilter,
            persist: false,
            // Options are local, so filter on every keystroke; with the default 300 ms a quick Enter picks a stale match.
            refreshThrottle: 0,
            placeholder: c.placeholder ?? '',
            plugins: c.multiple ? { remove_button: { title: texts.remove ?? 'Remove' } } : [],
            render: {
                // Text nodes only: labels may come from untrusted data.
                no_results: () => textDiv('no-results', texts.noResults ?? 'No results'),
                option_create: (data) => textDiv('create', `${texts.addValue ?? 'Add'}: ${data.input}`),
            },
            onChange: (value) => this.dispatchEvent(new CustomEvent('qb-change', { detail: value })),
        });
        // Tom Select finds <label for> through document, which cannot see into a shadow root.
        this.ts.control_input.setAttribute('aria-label', c.label ?? '');
        this.ts.dropdown_content.setAttribute('aria-label', c.label ?? '');
    }
}

function textDiv(className, text) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}

if (!customElements.get('qb-select')) customElements.define('qb-select', QbSelect);
