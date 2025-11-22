(function () {
    'use strict';

    function normalizeToken(value) {
        if (value == null) {
            return '';
        }
        const text = String(value).trim();
        return text;
    }

    function defaultTokenize(value) {
        const text = normalizeToken(value);
        if (!text) {
            return [];
        }
        return text
            .split(/[\s,;、，；]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
    }

    const DEFAULT_SETTINGS = {
        delimiter: ';',
        placeholder: '',
        createOnBlur: true,
        restoreOnBackspace: true,
        liveTokenize: true,
        createFilter: null,
        inputAriaLabel: 'タグを入力',
        tokenize: defaultTokenize
    };

    function createEvent(name) {
        if (typeof Event === 'function') {
            return new Event(name, { bubbles: true });
        }
        const event = document.createEvent('Event');
        event.initEvent(name, true, true);
        return event;
    }

    class TomSelect {
        constructor(input, settings = {}) {
            if (!input || typeof input.addEventListener !== 'function') {
                throw new Error('TomSelect: input element is required');
            }
            if (typeof document === 'undefined') {
                throw new Error('TomSelect: document is not available');
            }
            this.input = input;
            this.settings = Object.assign({}, DEFAULT_SETTINGS, settings);
            if (typeof this.settings.tokenize !== 'function') {
                this.settings.tokenize = defaultTokenize;
            }
            this.items = [];
            this.itemElements = new Map();
            this.events = new Map();
            this.isDisabled = Boolean(input.disabled);
            this.setupDom();
            this.bindEvents();
            this.syncFromInitialValue();
            this.triggerLifecycle('onInitialize');
            this.trigger('initialize');
        }

        setupDom() {
            this.input.classList.add('ts-hidden-input');
            this.input.setAttribute('aria-hidden', 'true');
            this.input.tabIndex = -1;

            this.wrapper = document.createElement('div');
            this.wrapper.className = 'ts-wrapper';
            this.wrapper.dataset.tsWrapper = 'true';

            this.control = document.createElement('div');
            this.control.className = 'ts-control';
            this.control.setAttribute('role', 'combobox');
            this.control.setAttribute('aria-haspopup', 'listbox');

            this.valuesContainer = document.createElement('div');
            this.valuesContainer.className = 'ts-values';
            this.control.appendChild(this.valuesContainer);

            this.textInput = document.createElement('input');
            this.textInput.type = 'text';
            this.textInput.className = 'ts-input';
            this.textInput.tabIndex = -1;
            this.textInput.autocomplete = 'off';
            this.textInput.spellcheck = false;
            this.textInput.placeholder = this.settings.placeholder || this.input.placeholder || '';
            if (this.settings.inputAriaLabel) {
                this.textInput.setAttribute('aria-label', this.settings.inputAriaLabel);
            }
            this.control.appendChild(this.textInput);

            const parent = this.input.parentNode;
            if (parent) {
                parent.insertBefore(this.wrapper, this.input);
            }
            this.wrapper.appendChild(this.control);
            this.wrapper.appendChild(this.input);
        }

        bindEvents() {
            this.wrapper.addEventListener('mousedown', (event) => {
                if (event.target === this.input) {
                    return;
                }
                if (this.isDisabled) {
                    return;
                }
                event.preventDefault();
                this.focus();
            });

            this.textInput.addEventListener('focus', () => {
                this.wrapper.classList.add('ts-wrapper--focus');
            });

            this.textInput.addEventListener('blur', () => {
                this.wrapper.classList.remove('ts-wrapper--focus');
                if (this.settings.createOnBlur) {
                    this.commitInput();
                }
            });

            this.textInput.addEventListener('keydown', (event) => {
                if (this.isDisabled) {
                    return;
                }
                if (this.shouldCommitFromKey(event)) {
                    event.preventDefault();
                    this.commitInput();
                    return;
                }
                if (event.key === 'Backspace' && !this.textInput.value) {
                    const previousValue = this.items[this.items.length - 1];
                    if (!previousValue) {
                        return;
                    }
                    event.preventDefault();
                    const restored = this.removeItem(previousValue, { silent: false, announce: true });
                    if (restored && this.settings.restoreOnBackspace) {
                        this.textInput.value = previousValue;
                        this.textInput.setSelectionRange(previousValue.length, previousValue.length);
                    }
                }
            });

            this.textInput.addEventListener('input', () => {
                if (!this.settings.liveTokenize) {
                    return;
                }
                if (/[\s,;、，；]/.test(this.textInput.value)) {
                    this.commitInput();
                }
            });
        }

        shouldCommitFromKey(event) {
            if (!event) {
                return false;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                return true;
            }
            if (event.key === ',' || event.key === ';') {
                return true;
            }
            if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
                return true;
            }
            return false;
        }

        commitInput() {
            const value = this.textInput.value;
            const tokens = this.settings.tokenize(value);
            if (!tokens.length) {
                return;
            }
            let changed = false;
            tokens.forEach((token) => {
                const added = this.addItem(token, { silent: true });
                changed = added || changed;
            });
            this.textInput.value = '';
            if (changed) {
                this.triggerChange();
            }
        }

        addItem(value, options = {}) {
            const token = normalizeToken(value);
            if (!token) {
                return false;
            }
            if (typeof this.settings.createFilter === 'function' && !this.settings.createFilter(token)) {
                return false;
            }
            if (this.items.includes(token)) {
                return false;
            }
            this.items.push(token);
            const chip = this.createChip(token);
            this.valuesContainer.appendChild(chip);
            this.itemElements.set(token, chip);
            if (!options.silent) {
                this.triggerLifecycle('onItemAdd', token);
                this.trigger('item_add', token);
            }
            this.syncInputValue();
            if (!options.silent) {
                this.triggerChange();
            }
            return true;
        }

        createChip(token) {
            const chip = document.createElement('span');
            chip.className = 'ts-chip';
            chip.textContent = token;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ts-chip-remove';
            button.setAttribute('aria-label', `${token} を削除`);
            button.textContent = '×';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.removeItem(token);
                this.focus();
            });
            chip.appendChild(button);
            return chip;
        }

        removeItem(token, options = {}) {
            const index = this.items.indexOf(token);
            if (index === -1) {
                return false;
            }
            this.items.splice(index, 1);
            const chip = this.itemElements.get(token);
            if (chip && chip.parentNode) {
                chip.parentNode.removeChild(chip);
            }
            this.itemElements.delete(token);
            this.syncInputValue();
            if (!options.silent) {
                this.triggerLifecycle('onItemRemove', token);
                this.trigger('item_remove', token);
                this.triggerChange();
            }
            return true;
        }

        clear(silent = false) {
            const tokens = this.items.slice();
            tokens.forEach((token) => {
                this.removeItem(token, { silent: true });
            });
            if (!silent) {
                this.triggerChange();
            } else {
                this.syncInputValue();
            }
        }

        setValue(values, silent = false) {
            const tokens = Array.isArray(values) ? values : this.settings.tokenize(values);
            this.clear(true);
            tokens.forEach((token) => {
                this.addItem(token, { silent: true });
            });
            if (!silent) {
                this.triggerChange();
            } else {
                this.syncInputValue();
            }
        }

        syncFromInitialValue() {
            if (this.input.value) {
                this.setValue(this.settings.tokenize(this.input.value), true);
            }
        }

        syncInputValue() {
            const joined = this.getValue();
            if (this.input.value !== joined) {
                this.input.value = joined;
            }
        }

        getValue() {
            return this.items.join(this.settings.delimiter);
        }

        triggerChange() {
            this.syncInputValue();
            this.triggerLifecycle('onChange', this.getValue());
            this.trigger('change', this.getValue());
            this.input.dispatchEvent(createEvent('input'));
            this.input.dispatchEvent(createEvent('change'));
        }

        focus() {
            if (this.textInput && typeof this.textInput.focus === 'function') {
                this.textInput.focus();
            }
        }

        disable() {
            this.isDisabled = true;
            this.textInput.disabled = true;
            this.wrapper.classList.add('ts-wrapper--disabled');
        }

        enable() {
            this.isDisabled = false;
            this.textInput.disabled = false;
            this.wrapper.classList.remove('ts-wrapper--disabled');
        }

        on(event, handler) {
            if (typeof handler !== 'function') {
                return () => {};
            }
            if (!this.events.has(event)) {
                this.events.set(event, new Set());
            }
            this.events.get(event).add(handler);
            return () => this.off(event, handler);
        }

        off(event, handler) {
            if (!this.events.has(event)) {
                return;
            }
            this.events.get(event).delete(handler);
        }

        trigger(event, ...args) {
            const handlers = this.events.get(event);
            if (!handlers) {
                return;
            }
            handlers.forEach((handler) => {
                try {
                    handler.apply(this, args);
                } catch (error) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error('TomSelect: handler failed', error);
                    }
                }
            });
        }

        triggerLifecycle(hookName, ...args) {
            const handler = this.settings[hookName];
            if (typeof handler === 'function') {
                try {
                    handler.apply(this, args);
                } catch (error) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error('TomSelect: lifecycle handler failed', error);
                    }
                }
            }
        }

        destroy() {
            this.clear(true);
            this.wrapper.classList.remove('ts-wrapper--focus');
            if (this.wrapper && this.wrapper.parentNode) {
                this.wrapper.parentNode.insertBefore(this.input, this.wrapper);
                this.wrapper.parentNode.removeChild(this.wrapper);
            }
            this.input.classList.remove('ts-hidden-input');
            this.input.removeAttribute('aria-hidden');
            this.input.tabIndex = 0;
            this.events.clear();
        }
    }

    if (typeof window !== 'undefined') {
        window.TomSelect = TomSelect;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TomSelect;
    }
})();
