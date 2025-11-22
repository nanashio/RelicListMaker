import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function runScript(relativePath, contextOverrides = {}) {
  const absolutePath = path.join(projectRoot, relativePath);
  const code = readFileSync(absolutePath, 'utf8');
  Object.assign(global, contextOverrides);
  vm.runInThisContext(code, { filename: absolutePath });
}

class MockElement {
  constructor(tagName = 'div', className = '', text = '') {
    this.tagName = String(tagName).toUpperCase();
    const initialClasses =
      typeof className === 'string' && className.trim() ? className.trim().split(/\s+/) : [];
    this._classes = new Set(initialClasses);
    Object.defineProperty(this, 'className', {
      get: () => Array.from(this._classes).join(' '),
      set: (value) => {
        const text = typeof value === 'string' ? value.trim() : '';
        this._classes = new Set(text ? text.split(/\s+/) : []);
      }
    });
    this.className = Array.from(this._classes).join(' ');
    this.textContent = text || '';
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.eventListeners = {};
    this.value = '';
    this.disabled = false;
    this.id = '';
    this.classList = {
      add: (cls) => {
        this._classes.add(cls);
        this.className = Array.from(this._classes).join(' ');
      },
      remove: (cls) => {
        this._classes.delete(cls);
        this.className = Array.from(this._classes).join(' ');
      },
      toggle: (cls, force) => {
        if (force === undefined) {
          if (this._classes.has(cls)) {
            this._classes.delete(cls);
          } else {
            this._classes.add(cls);
          }
        } else if (force) {
          this._classes.add(cls);
        } else {
          this._classes.delete(cls);
        }
        this.className = Array.from(this._classes).join(' ');
      },
      contains: (cls) => this._classes.has(cls)
    };
  }

  matches(selector) {
    if (!selector) {
      return false;
    }

    const text = selector.trim();
    if (!text) {
      return false;
    }

    const attrPattern = /\[([^=\]\s]+)(?:=([^\]]+))?\]/g;
    const attributeChecks = [];
    let baseSelector = text.replace(attrPattern, (match, name, value) => {
      attributeChecks.push({ name, value });
      return '';
    });

    baseSelector = baseSelector.trim();

    let baseMatched = false;
    if (!baseSelector || baseSelector === '*') {
      baseMatched = true;
    } else if (baseSelector.startsWith('.')) {
      const classNames = baseSelector
        .slice(1)
        .split('.')
        .filter(Boolean);
      baseMatched = classNames.length > 0 && classNames.every((cls) => this._classes.has(cls));
    } else if (baseSelector.startsWith('#')) {
      baseMatched = this.id === baseSelector.slice(1);
    } else {
      baseMatched = this.tagName === baseSelector.toUpperCase();
    }

    if (!baseMatched) {
      return false;
    }

    const resolveAttributeValue = (name) => {
      if (Object.prototype.hasOwnProperty.call(this.attributes, name)) {
        return this.attributes[name];
      }
      if (name.startsWith('data-')) {
        const dataKey = name
          .slice(5)
          .split('-')
          .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
          .join('');
        if (Object.prototype.hasOwnProperty.call(this.dataset, dataKey)) {
          return this.dataset[dataKey];
        }
      }
      return undefined;
    };

    return attributeChecks.every(({ name, value }) => {
      const actual = resolveAttributeValue(name.trim());
      if (value == null) {
        return actual !== undefined;
      }
      const normalizedExpected = value.trim().replace(/^['"]|['"]$/g, '');
      if (actual === undefined) {
        return false;
      }
      return String(actual) === normalizedExpected;
    });
  }

  appendChild(child) {
    if (!child) {
      return child;
    }
    if (child.parentNode) {
      const index = child.parentNode.children.indexOf(child);
      if (index >= 0) {
        child.parentNode.children.splice(index, 1);
      }
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceWith(replacement) {
    if (!this.parentNode) {
      return;
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      if (replacement.parentNode) {
        const idx = replacement.parentNode.children.indexOf(replacement);
        if (idx >= 0) {
          replacement.parentNode.children.splice(idx, 1);
        }
      }
      replacement.parentNode = this.parentNode;
      siblings.splice(index, 1, replacement);
    }
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'id') {
      this.id = value;
    }
  }

  getAttribute(name) {
    if (Object.prototype.hasOwnProperty.call(this.attributes, name)) {
      return this.attributes[name];
    }
    return '';
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') {
      this.id = '';
    }
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(handler);
  }

  dispatchEvent(type, event) {
    (this.eventListeners[type] || []).forEach((handler) => handler(event));
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  querySelectorAll(selector, accumulator = []) {
    for (const child of this.children) {
      if (child.matches(selector)) {
        accumulator.push(child);
      }
      child.querySelectorAll(selector, accumulator);
    }
    return accumulator;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }
}

function createMockDocument() {
  const body = new MockElement('body');
  return {
    createElement: (tagName) => new MockElement(tagName),
    createDocumentFragment: () => new MockElement('#fragment'),
    body,
    addEventListener: () => {}
  };
}

describe('gallery state store', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('creates store and updates descriptor', () => {
    runScript('templates/gallery/state/store.js');
    const factory = global.window.galleryStateStoreFactory;
    assert.ok(factory, 'state store factory should be defined');

    const initial = {
      datasets: [{ label: 'Alpha', csv: 'a.csv', kind: 'normal' }],
      activeDatasetIndex: 0,
      labelSymbols: ['①', '②'],
      imageDir: 'images',
      csvPath: 'alpha.csv'
    };
    const store = factory.createStateStore(initial);
    const subscriberCalls = [];
    store.subscribe(({ dataset }) => subscriberCalls.push(dataset.activeIndex));

    assert.equal(store.core.imageDir, 'images');
    assert.equal(store.dataset.list.length, 1);

    store.setDatasets([{ label: 'Beta', csv: 'b.csv', kind: 'normal' }]);
    assert.equal(store.dataset.list[0].label, 'Beta');

    store.setActiveDatasetIndex(10);
    assert.equal(store.dataset.activeIndex, 0);
    assert.ok(subscriberCalls.includes(0));

    store.updateDescriptor({
      label: 'Gamma',
      csvPath: 'gamma.csv',
      imageDir: 'gamma-images',
      kind: 'merged',
      sources: [{ csv: 'gamma.csv', imgDir: 'gamma-images' }]
    });

    assert.equal(store.dataset.label, 'Gamma');
    assert.equal(store.core.csvPath, 'gamma.csv');
    assert.equal(store.core.imageDir, '');
    assert.equal(store.dataset.sources.length, 1);
  });
});

describe('gallery app state api', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('provides helpers for manipulating core state', () => {
    runScript('templates/gallery/state/store.js');
    runScript('templates/gallery/app/stateApi.js');

    const storeFactory = global.window.galleryStateStoreFactory;
    const apiFactory = global.window.galleryAppStateFactory;

    const store = storeFactory.createStateStore({
      labelSymbols: ['Ⅰ'],
      masterOptions: ['Alpha'],
      masterDemeritOptions: ['Penalty'],
      datasets: [],
      activeDatasetIndex: 0
    });

    const api = apiFactory.createStateApi({ stateStore: store });

    api.clearRecordsAndItems();
    assert.deepEqual(api.state.records, []);
    assert.deepEqual(api.state.items, []);

    api.setRecords([{ Image: 'first.png' }]);
    assert.equal(api.state.records.length, 1);
    api.setItems(['item-node']);
    assert.deepEqual(api.state.items, ['item-node']);

    api.setMasterOptions(['Beta', 'Gamma']);
    assert.deepEqual(api.state.masterOptions, ['Beta', 'Gamma']);

    api.setMasterDemeritOptions(['Penalty Fix']);
    assert.deepEqual(api.state.masterDemeritOptions, ['Penalty Fix']);

    api.markMasterDatalistPrepared(true);
    assert.equal(api.state.masterDatalistPrepared, true);

    api.markMasterDemeritDatalistPrepared(true);
    assert.equal(api.state.masterDemeritDatalistPrepared, true);

    const levelMap = new Map([['A', ['1']]]);
    api.setMasterLevels(levelMap);
    assert.strictEqual(api.state.masterLevels, levelMap);

    api.setMasterLevelsLoaded(true);
    assert.equal(api.state.masterLevelsLoaded, true);

    const pending = Promise.resolve();
    api.setMasterLevelsPromise(pending);
    assert.strictEqual(api.state.masterLevelsPromise, pending);
    api.clearMasterLevelsPromise();
    assert.equal(api.state.masterLevelsPromise, null);

    api.addLabelSymbol('Ⅱ');
    api.ensureLabelSymbolsLength(3);
    assert.ok(api.state.labelSymbols.length >= 3);

    api.setShowOcr(true);
    assert.equal(api.state.showOcr, true);
  });
});

describe('gallery dom utils', () => {
  let domUtils;
  let selectorMap;
  let idMap;

  function createMockElement() {
    const classSet = new Set();
    return {
      id: '',
      textContent: '',
      style: {},
      isConnected: true,
      classList: {
        add: (className) => classSet.add(className),
        toggle: (className, force) => {
          const shouldHaveClass = force === undefined ? !classSet.has(className) : Boolean(force);
          if (shouldHaveClass) {
            classSet.add(className);
          } else {
            classSet.delete(className);
          }
        },
        contains: (className) => classSet.has(className)
      }
    };
  }

  beforeEach(() => {
    global.window = {};
    selectorMap = new Map();
    idMap = new Map();
    global.document = {
      querySelector: (selector) => selectorMap.get(selector) || null,
      getElementById: (id) => idMap.get(id) || null,
      createElement: (tagName) => {
        const element = createMockElement();
        element.createdTagName = tagName;
        element.isConnected = false;
        return element;
      }
    };
    runScript('templates/gallery/utils/dom.js');
    domUtils = global.window.galleryDomUtils;
  });

  afterEach(() => {
    delete global.document;
  });

  test('manipulation helpers update element state', () => {
    const element = createMockElement();
    element.textContent = 'keep me';

    domUtils.setHidden(element, true);
    assert.equal(element.classList.contains('hidden'), true);

    domUtils.clearChildren(element);
    assert.equal(element.textContent, '');

    domUtils.updateStatusElement(element, 'Ready', { isError: true, display: 'inline' });
    assert.equal(element.textContent, 'Ready');
    assert.equal(element.style.display, 'inline');
    assert.equal(element.classList.contains('error'), true);

    domUtils.updateStatusElement(element, 'Ready', { isError: false });
    assert.equal(element.classList.contains('error'), false);

    domUtils.updateStatusElement(element, '', {});
    assert.equal(element.style.display, 'none');

    domUtils.applyInlineStyles(element, { color: 'red', padding: null });
    assert.equal(element.style.color, 'red');
    assert.equal(Object.prototype.hasOwnProperty.call(element.style, 'padding'), false);
  });

  test('ensureElement reuses existing element and augments metadata', () => {
    const element = createMockElement();
    element.isConnected = true;

    const result = domUtils.ensureElement(element, {
      id: 'existing',
      classNames: ['alpha', 'beta']
    });

    assert.strictEqual(result, element);
    assert.equal(result.id, 'existing');
    assert.equal(result.classList.contains('alpha'), true);
    assert.equal(result.classList.contains('beta'), true);
  });

  test('ensureElement resolves via selectors or creates with fallback', () => {
    const fromSelector = createMockElement();
    selectorMap.set('.target', fromSelector);

    const resolved = domUtils.ensureElement(null, {
      selector: '.target',
      id: 'selected',
      classNames: ['picked']
    });
    assert.strictEqual(resolved, fromSelector);
    assert.equal(resolved.id, 'selected');
    assert.equal(resolved.classList.contains('picked'), true);

    const created = domUtils.ensureElement(null, {
      id: 'created',
      classNames: ['made'],
      tagName: 'section'
    });

    assert.equal(created.id, 'created');
    assert.equal(created.createdTagName, 'section');
    assert.equal(created.classList.contains('made'), true);
    assert.equal(created.isConnected, false);
  });

  test('factory createDomUtils accepts explicit document override', () => {
    const factory = global.window.galleryDomUtilsFactory;
    assert.ok(factory && typeof factory.createDomUtils === 'function');

    const externalElement = createMockElement();
    externalElement.isConnected = true;

    const customDocument = {
      querySelector: (selector) => (selector === '#custom' ? externalElement : null),
      getElementById: () => null,
      createElement: (tagName) => {
        const element = createMockElement();
        element.createdTagName = tagName;
        element.createdByFactory = true;
        return element;
      }
    };

    const customUtils = factory.createDomUtils({ document: customDocument });

    const resolved = customUtils.ensureElement(null, {
      selector: '#custom',
      id: 'from-factory'
    });
    assert.strictEqual(resolved, externalElement);
    assert.equal(resolved.id, 'from-factory');

    const created = customUtils.ensureElement(null, {
      tagName: 'article',
      classNames: ['factory-product']
    });
    assert.equal(created.createdTagName, 'article');
    assert.equal(created.classList.contains('factory-product'), true);
    assert.equal(created.createdByFactory, true);
  });
});

describe('gallery data utils', () => {
  let dataUtils;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/utils/data.js');
    dataUtils = global.window.galleryDataUtils;
  });

  test('sanitizeLevelList trims and removes empty entries', () => {
    const values = [' 10 ', null, '', 'Alpha', '  ', undefined, '＋２', 0];
    const sanitized = dataUtils.sanitizeLevelList(values);
    assert.deepEqual(sanitized, ['10', 'Alpha', '＋２', '0']);
  });

  test('normalizeLevelNumericValue handles full-width signs and invalid input', () => {
    assert.equal(dataUtils.normalizeLevelNumericValue(' ＋12 '), 12);
    assert.equal(dataUtils.normalizeLevelNumericValue('﹣7'), -7);
    assert.equal(dataUtils.normalizeLevelNumericValue(''), null);
    assert.equal(dataUtils.normalizeLevelNumericValue('abc'), null);
  });

  test('sortLevelsAscending orders numeric values before text while preserving raw input', () => {
    const values = ['Flat', ' +2 ', '-1', 'A', '10', 'beta'];
    const sorted = dataUtils.sortLevelsAscending(values);
    assert.deepEqual(sorted, ['-1', ' +2 ', '10', 'A', 'beta', 'Flat']);
  });
  test('parseMasterOptions normalizes unique entries', () => {
    const parsed = dataUtils.parseMasterOptions([' Foo ', { name: 'Bar' }, '', null, 'Foo']);
    assert.deepEqual(parsed, ['Foo', 'Bar']);
    const parsedFromString = dataUtils.parseMasterOptions('Alpha,Beta');
    assert.deepEqual(parsedFromString, ['Alpha', 'Beta']);
  });

  test('parseMasterLevels creates normalized map', () => {
    const source = {
      ' EffectA ': ['＋１', '＋２', '＋２'],
      effectB: 'low|high'
    };
    const result = dataUtils.parseMasterLevels(source);
    assert.ok(result instanceof Map);
    assert.deepEqual(result.get('effecta'), ['＋１', '＋２']);
    assert.deepEqual(result.get('effectb'), ['high', 'low']);
  });

  test('normalizeRecordRelicTypeField maps snake_case field to RelicType', () => {
    const record = { Image: 'deep.png', relic_type: 'deep' };
    const normalized = dataUtils.normalizeRecordRelicTypeField(record);
    assert.equal(normalized.RelicType, 'deep');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'relic_type'), false);
  });

  test('normalizeRecordRelicTypeField renames space separated key to RelicType', () => {
    const record = { Image: 'space.png', 'Relic Type': 'normal' };
    const normalized = dataUtils.normalizeRecordRelicTypeField(record);
    assert.equal(normalized.RelicType, 'normal');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'Relic Type'), false);
  });

  test('normalizeRecordRelicTypeField keeps canonical value when duplicate legacy keys exist', () => {
    const record = { Image: 'keep.png', RelicType: 'deep', 'relic-type': 'normal' };
    const normalized = dataUtils.normalizeRecordRelicTypeField(record);
    assert.equal(normalized.RelicType, 'deep');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'relic-type'), false);
  });

  test('normalizeRelicTypeColumns converts legacy keys without overriding existing values', () => {
    const records = [
      { Image: 'normal.png', RelicType: 'normal', 'relic type': 'legacy' },
      { Image: 'deep.png', relictype: 'deep' },
      { Image: 'space.png', 'Relic Type': 'normal' },
      { Image: 'dash.png', 'relic-type': 'deep' },
      { Image: 'other.png', Note: 'keep' }
    ];
    const normalized = dataUtils.normalizeRelicTypeColumns(records);
    assert.equal(normalized[0].RelicType, 'normal');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'relic type'), false);
    assert.equal(normalized[1].RelicType, 'deep');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[1], 'relictype'), false);
    assert.equal(normalized[2].RelicType, 'normal');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[2], 'Relic Type'), false);
    assert.equal(normalized[3].RelicType, 'deep');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[3], 'relic-type'), false);
    assert.equal(normalized[4].Note, 'keep');
  });
});

describe('gallery record utils', () => {
  let recordUtils;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/utils/records.js');
    const factory = global.window.galleryRecordUtilsFactory;
    if (factory && typeof factory.createRecordUtils === 'function') {
      recordUtils = factory.createRecordUtils();
    } else {
      recordUtils = global.window.galleryRecordUtils;
    }
  });

  test('getRecordByIndex safely resolves entries', () => {
    const records = [{ name: 'alpha' }, { name: 'beta' }];
    assert.strictEqual(recordUtils.getRecordByIndex(records, 0).name, 'alpha');
    assert.strictEqual(recordUtils.getRecordByIndex(records, 5), null);
    assert.strictEqual(recordUtils.getRecordByIndex(null, 0), null);
  });

  test('updateRecordField sets and clears values', () => {
    const records = [{ value: 'keep' }];
    assert.equal(recordUtils.updateRecordField(records, 0, 'value', 'next'), true);
    assert.equal(records[0].value, 'next');
    assert.equal(recordUtils.updateRecordField(records, 0, 'value', ''), true);
    assert.equal(Object.prototype.hasOwnProperty.call(records[0], 'value'), false);
    assert.equal(recordUtils.updateRecordField(records, 3, 'value', 'x'), false);
  });

  test('createFlagManager normalizes tokens', () => {
    const records = [{ Flag: 'YES' }, { Flag: '' }];
    const manager = recordUtils.createFlagManager(records, 'Flag', ['yes', 'true', '1']);
    assert.equal(manager.isSet(records[0]), true);
    assert.equal(manager.isSet(records[1]), false);
    assert.equal(manager.set(1, true), true);
    assert.equal(records[1].Flag, true);
    assert.equal(manager.set(1, false), true);
    assert.equal(Object.prototype.hasOwnProperty.call(records[1], 'Flag'), false);
  });
});

describe('gallery filter utils', () => {
  let filterUtils;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/utils/filter.js');
    filterUtils = global.window.galleryFilterUtils;
  });

  test('buildItemSearchCaches aggregates tokens and statuses', () => {
    const caches = filterUtils.buildItemSearchCaches({
      baseTokens: ['Alpha', 'beta'],
      effects: [
        {
          prediction: '炎上',
          raw: 'RawText',
          correction: 'Correction',
          status: 'pass',
          level: 'L1',
          levelOptions: 'L1|L2',
          levelCorrection: 'L2'
        },
        {
          prediction: '',
          raw: '',
          correction: '',
          status: '',
          level: '',
          levelOptions: '',
          levelCorrection: ''
        }
      ]
    });
    assert.ok(caches.searchCache.includes('alpha'));
    assert.ok(caches.searchCache.includes('beta'));
    assert.equal(caches.statusCache.includes('|pass|'), true);
    assert.equal(caches.statusCache.includes('|pending|'), true);
    assert.deepEqual(caches.effectStates, ['pass', 'pending']);
  });

  test('filterItems evaluates visibility rules', () => {
    const items = [
      {
        duplicate: true,
        searchCache: ' alpha relic ',
        statusCache: '|pending|',
        effectStates: ['pending', 'pending', 'pending'],
        favorite: false,
        itemColor: 'red'
      },
      {
        duplicate: false,
        searchCache: ' alpha relic ',
        statusCache: '|pass|corrected|',
        effectStates: ['pass', 'corrected', 'pass'],
        favorite: true,
        itemColor: 'red'
      },
      {
        duplicate: false,
        searchCache: ' beta relic ',
        statusCache: '|pending|',
        effectStates: ['pending', 'pending', 'pending'],
        favorite: true,
        itemColor: ''
      }
    ];
    const baseFilters = { term: 'alpha', filter: 'all', colorFilter: 'all', includeDuplicates: false };
    const allResults = filterUtils.filterItems(items, baseFilters);
    assert.deepEqual(allResults, [false, true, false]);

    const resolvedResults = filterUtils.filterItems(items, {
      term: '',
      filter: 'resolved',
      colorFilter: 'red',
      includeDuplicates: true
    });
    assert.deepEqual(resolvedResults, [false, true, false]);

    const favoritesOnly = filterUtils.filterItems(items, {
      term: '',
      filter: 'favorite',
      colorFilter: 'none',
      includeDuplicates: true
    });
    assert.deepEqual(favoritesOnly, [false, false, true]);
  });
});


describe('tag input controller', () => {
  let documentMock;

  beforeEach(() => {
    documentMock = createMockDocument();
    global.window = {};
    global.document = documentMock;
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  test('falls back to native input when TomSelect is unavailable', () => {
    runScript('templates/gallery/components/tagInput.js');
    const factory = global.window.galleryComponents.createTagInputController;
    const controller = factory({});
    const input = new MockElement('input', 'item-tags-input');
    controller.syncValue(input, ['alpha', 'beta']);
    assert.equal(input.value, 'alpha beta');
    assert.equal(controller.usesNativeInput, true);
  });

  test('syncValue delegates to TomSelect instance silently', () => {
    runScript('templates/gallery/components/tagInput.js');
    const factory = global.window.galleryComponents.createTagInputController;
    const instances = [];
    class FakeTomSelect {
      constructor(input) {
        this.input = input;
        this.setValueCalls = [];
        instances.push(this);
      }

      setValue(tokens, silent) {
        this.setValueCalls.push({ tokens, silent });
      }

      on() {
        return () => {};
      }
    }

    const container = new MockElement('div', 'item-tags-control');
    const input = new MockElement('input', 'item-tags-input');
    container.appendChild(input);

    const controller = factory({
      TomSelect: FakeTomSelect,
      parseTagTokens: (value) => (Array.isArray(value) ? value : String(value || '').split(/\s+/).filter(Boolean)),
      formatTagTokens: (tokens) => tokens.join(' '),
      documentRef: documentMock
    });

    controller.syncValue(input, ['alpha']);
    assert.equal(controller.usesNativeInput, false);
    assert.equal(instances.length, 1);
    assert.deepEqual(instances[0].setValueCalls, [{ tokens: ['alpha'], silent: true }]);
  });
});

describe('gallery view', () => {
  function createStubElement(tag) {
    const element = {};
    let textContentValue = '';
    const classSet = new Set();
    let classNameValue = '';

    const updateClassName = () => {
      classNameValue = Array.from(classSet).join(' ');
    };

    Object.defineProperty(element, 'className', {
      get() {
        return classNameValue;
      },
      set(value) {
        classSet.clear();
        if (value) {
          String(value)
            .split(/\s+/)
            .filter(Boolean)
            .forEach((className) => classSet.add(className));
        }
        updateClassName();
      }
    });

    Object.defineProperty(element, 'textContent', {
      get() {
        return textContentValue;
      },
      set(value) {
        textContentValue = value == null ? '' : String(value);
        element.children.length = 0;
        element.firstChild = null;
      }
    });

    Object.defineProperty(element, 'id', {
      get() {
        return element.attributes.id || '';
      },
      set(value) {
        if (value == null) {
          delete element.attributes.id;
        } else {
          element.attributes.id = String(value);
        }
      }
    });

    element.tagName = String(tag || '').toUpperCase();
    element.children = [];
    element.dataset = {};
    element.style = {};
    element.attributes = {};
    element.parentNode = null;
    element.nodeType = 1;
    element.isConnected = false;
    element.firstChild = null;
    element.ownerDocument = null;

    element.classList = {
      add(className) {
        if (className && !classSet.has(className)) {
          classSet.add(className);
          updateClassName();
        }
      },
      remove(className) {
        if (classSet.delete(className)) {
          updateClassName();
        }
      },
      contains(className) {
        return classSet.has(className);
      },
      toggle(className, force) {
        if (force === undefined) {
          if (classSet.has(className)) {
            classSet.delete(className);
            updateClassName();
            return false;
          }
          classSet.add(className);
          updateClassName();
          return true;
        }
        if (force) {
          this.add(className);
          return true;
        }
        this.remove(className);
        return false;
      }
    };

    element.setAttribute = (name, value) => {
      element.attributes[name] = String(value);
      if (name === 'id') {
        element.id = value;
      }
    };

    element.getAttribute = (name) => element.attributes[name];

    const attachChild = (child, index = element.children.length) => {
      if (!child) {
        return null;
      }
      if (child.parentNode && child.parentNode !== element && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      child.parentNode = element;
      child.isConnected = element.isConnected;
      element.children.splice(index, 0, child);
      element.firstChild = element.children[0] || null;
      return child;
    };

    element.appendChild = (child) => {
      if (!child) {
        return null;
      }
      if (child.nodeType === 11 && Array.isArray(child.childNodes)) {
        child.childNodes.slice().forEach((node) => {
          attachChild(node);
        });
        child.childNodes.length = 0;
        child.firstChild = null;
        return child;
      }
      return attachChild(child);
    };

    element.insertBefore = (child, reference) => {
      if (!child) {
        return null;
      }
      if (!reference) {
        return element.appendChild(child);
      }
      const index = element.children.indexOf(reference);
      if (index === -1) {
        return element.appendChild(child);
      }
      return attachChild(child, index);
    };

    element.removeChild = (child) => {
      const index = element.children.indexOf(child);
      if (index === -1) {
        return null;
      }
      element.children.splice(index, 1);
      child.parentNode = null;
      child.isConnected = false;
      element.firstChild = element.children[0] || null;
      return child;
    };

    element.remove = () => {
      if (element.parentNode && typeof element.parentNode.removeChild === 'function') {
        element.parentNode.removeChild(element);
      }
    };

    element.querySelectorAll = (selector) => {
      const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
      if (!selectors.length) {
        return [];
      }
      const matchers = selectors.map((sel) => {
        if (sel.startsWith('.')) {
          const className = sel.slice(1);
          return (node) => node.classList && node.classList.contains(className);
        }
        if (sel.startsWith('#')) {
          const id = sel.slice(1);
          return (node) => (node.attributes && node.attributes.id === id) || node.id === id;
        }
        const tagName = sel.toUpperCase();
        return (node) => node.tagName === tagName;
      });
      const results = [];
      const traverse = (node) => {
        node.children.forEach((child) => {
          if (matchers.some((fn) => fn(child))) {
            results.push(child);
          }
          if (child.children && child.children.length) {
            traverse(child);
          }
        });
      };
      traverse(element);
      return results;
    };

    element.querySelector = (selector) => element.querySelectorAll(selector)[0] || null;

    element.closest = (selector) => {
      if (!selector.startsWith('.')) {
        return null;
      }
      const target = selector.slice(1);
      let current = element;
      while (current) {
        if (current.classList && current.classList.contains(target)) {
          return current;
        }
        current = current.parentNode || null;
      }
      return null;
    };

    return element;
  }

  function createDocumentStub() {
    const docObject = {};

    const createElement = (tag) => {
      const element = createStubElement(tag);
      element.ownerDocument = docObject;
      return element;
    };

    const createDocumentFragment = () => ({
      nodeType: 11,
      childNodes: [],
      firstChild: null,
      appendChild(node) {
        if (!node) {
          return null;
        }
        if (node.nodeType === 11 && Array.isArray(node.childNodes)) {
          node.childNodes.slice().forEach((child) => this.appendChild(child));
          node.childNodes.length = 0;
          node.firstChild = null;
          return node;
        }
        this.childNodes.push(node);
        if (!this.firstChild) {
          this.firstChild = node;
        }
        return node;
      }
    });

    const body = createElement('body');
    body.isConnected = true;

    const collectMatches = (selector) => {
      if (!selector) {
        return [];
      }
      const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
      if (!selectors.length) {
        return [];
      }
      const matchers = selectors.map((sel) => {
        if (sel.startsWith('.')) {
          const className = sel.slice(1);
          return (node) => node.classList && node.classList.contains(className);
        }
        if (sel.startsWith('#')) {
          const id = sel.slice(1);
          return (node) => (node.attributes && node.attributes.id === id) || node.id === id;
        }
        const tagName = sel.toUpperCase();
        return (node) => node.tagName === tagName;
      });
      const results = [];
      const traverse = (node) => {
        node.children.forEach((child) => {
          if (matchers.some((fn) => fn(child))) {
            results.push(child);
          }
          if (child.children && child.children.length) {
            traverse(child);
          }
        });
      };
      traverse(body);
      return results;
    };

    Object.assign(docObject, {
      createElement,
      createDocumentFragment,
      querySelector: (selector) => collectMatches(selector)[0] || null,
      querySelectorAll: (selector) => collectMatches(selector),
      getElementById: (id) => collectMatches(`#${id}`)[0] || null,
      body
    });

    body.ownerDocument = docObject;

    return docObject;
  }

  function defaultCreateElement(tag, className, text) {
    const element = global.document.createElement(tag);
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach((name) => element.classList.add(name));
    }
    if (text != null) {
      element.textContent = text;
    }
    return element;
  }

  let galleryFactory;

  beforeEach(() => {
    global.window = {};
    global.document = createDocumentStub();
    runScript('templates/gallery/utils/data.js');
    runScript('templates/gallery/utils/filter.js');
    runScript('templates/gallery/render/itemEnhancers.js');
    runScript('templates/gallery/render/itemFactory.js');
    runScript('templates/gallery/render/galleryView.js');
    galleryFactory = global.window.galleryRenderFactory;
  });

  afterEach(() => {
    delete global.document;
  });

  test('buildGallery respects duplicate toggle', () => {
    const state = {
      records: [
        { Image: 'alpha.png' },
        { Image: 'beta.png', Duplicate: true }
      ],
      items: [],
      labelSymbols: [],
      imageDir: 'images',
      showOcr: false
    };
    const datasetState = { kind: 'normal', list: [], activeIndex: 0 };
    const galleryElement = createStubElement('div');
    global.document.body.appendChild(galleryElement);
    const statusElement = createStubElement('div');
    global.document.body.appendChild(statusElement);
    const dom = {
      gallery: galleryElement,
      galleryStatus: statusElement,
      summary: null,
      showDuplicatesToggle: { checked: false },
      showOcrToggle: { checked: false },
      searchInput: { value: '' },
      filterSelect: { value: 'all' },
      colorFilter: { value: 'all' }
    };
    const duplicateStore = new Map();
    const duplicates = {
      has: (key) => duplicateStore.get(key) === true,
      set: (key, value) => {
        if (!key) {
          return;
        }
        if (value) {
          duplicateStore.set(key, true);
        } else {
          duplicateStore.delete(key);
        }
      }
    };
    const statusCalls = [];

    const galleryView = galleryFactory.createGalleryView({
      state,
      datasetState,
      dom,
      duplicates,
      itemColorOptions: [
        { key: 'red', label: '赤', className: 'item-color-red' },
        { key: 'blue', label: '青', className: 'item-color-blue' }
      ],
      createEffect: () => null,
      bindImage: () => {},
      createElement: defaultCreateElement,
      joinPath: (base, leaf) => {
        if (!base) {
          return leaf || '';
        }
        if (!leaf) {
          return base;
        }
        return `${base}/${leaf}`;
      },
      getFileName: (path) => {
        if (!path) {
          return '';
        }
        const textValue = String(path);
        const parts = textValue.split(/[\\/]/);
        return parts[parts.length - 1] || '';
      },
      showStatus: (message) => {
        statusCalls.push(message);
      },
      clearStatus: () => {
        statusCalls.push('clear');
      },
      getRecordByIndex: (index) => state.records[index] || null,
      isRecordDuplicate: (record) => Boolean(record && record.Duplicate),
      isRecordFavorite: (record) => Boolean(record && record.Favorite)
    });

    galleryView.buildGallery();
    assert.equal(state.items.length, 1);
    assert.equal(dom.gallery.children.length, 1);
    assert.ok(dom.summary, 'summary element should exist after initial build');
    assert.equal(dom.summary.textContent, '全体 1 件 / 確認済み 0 件 / 未レビュー 1 件');

    dom.showDuplicatesToggle.checked = true;
    galleryView.buildGallery();
    assert.equal(state.items.length, 2);
    assert.equal(dom.gallery.children.length, 2);
    assert.equal(dom.summary.textContent, '全体 2 件 / 確認済み 0 件 / 未レビュー 2 件');

    galleryView.applyFilters();
    assert.equal(dom.summary.textContent, '全体 2 件 / 確認済み 0 件 / 未レビュー 2 件');

    galleryView.setOcrVisibility(true);
    assert.equal(state.showOcr, true);
    assert.equal(dom.showOcrToggle.checked, true);
    assert.ok(statusCalls.includes('clear'), 'clearStatus should be invoked when items render');
  });

  test('gallery view allows injecting custom item enhancer factory', () => {
    const state = {
      records: [{ Image: 'alpha.png' }],
      items: [],
      labelSymbols: [],
      imageDir: 'images',
      showOcr: false
    };
    const datasetState = { kind: 'normal', list: [], activeIndex: 0 };
    const galleryElement = createStubElement('div');
    global.document.body.appendChild(galleryElement);
    const statusElement = createStubElement('div');
    global.document.body.appendChild(statusElement);
    const dom = {
      gallery: galleryElement,
      galleryStatus: statusElement,
      summary: null,
      showDuplicatesToggle: { checked: false },
      showOcrToggle: { checked: false },
      searchInput: { value: '' },
      filterSelect: { value: 'all' },
      colorFilter: { value: 'all' }
    };
    const duplicateStore = new Map();
    const duplicates = {
      has: (key) => duplicateStore.get(key) === true,
      set: (key, value) => {
        if (!key) {
          return;
        }
        if (value) {
          duplicateStore.set(key, true);
        } else {
          duplicateStore.delete(key);
        }
      }
    };

    const receivedFactoryConfig = [];
    const extraCalls = [];

    const galleryView = galleryFactory.createGalleryView({
      state,
      datasetState,
      dom,
      duplicates,
      itemColorOptions: [],
      createEffect: () => null,
      bindImage: () => {},
      createElement: defaultCreateElement,
      joinPath: (base, leaf) => {
        if (!base) {
          return leaf || '';
        }
        if (!leaf) {
          return base;
        }
        return `${base}/${leaf}`;
      },
      getFileName: (path) => String(path || ''),
      showStatus: () => {},
      clearStatus: () => {},
      getRecordByIndex: (index) => state.records[index] || null,
      isRecordDuplicate: (record) => Boolean(record && record.Duplicate),
      isRecordFavorite: (record) => Boolean(record && record.Favorite),
      createItemEnhancers: (config) => {
        receivedFactoryConfig.push(config);
        const additionals = Array.isArray(config.additionalEnhancers)
          ? config.additionalEnhancers.slice()
          : [];
        return [
          (item, context) => {
            item.dataset.fromFactory = String(context.recordIndex);
          },
          ...additionals
        ];
      },
      itemEnhancers: [
        (item) => {
          extraCalls.push(item);
          item.dataset.extra = 'true';
        }
      ]
    });

    galleryView.buildGallery();

    assert.equal(receivedFactoryConfig.length, 1);
    assert.equal(typeof receivedFactoryConfig[0].syncDuplicateState, 'function');
    assert.equal(receivedFactoryConfig[0].additionalEnhancers.length, 1);

    assert.equal(state.items.length, 1);
    const item = state.items[0];
    assert.equal(item.dataset.fromFactory, '0');
    assert.equal(item.dataset.extra, 'true');
    assert.equal(extraCalls.length, 1);
  });

  test('applyItemTags keeps focused input text until editing ends', () => {
    const state = {
      records: [{ Image: 'alpha.png', Tags: 'alpha' }],
      items: [],
      labelSymbols: [],
      imageDir: 'images',
      showOcr: false
    };
    const datasetState = { kind: 'normal', list: [], activeIndex: 0 };
    const galleryElement = createStubElement('div');
    global.document.body.appendChild(galleryElement);
    const statusElement = createStubElement('div');
    global.document.body.appendChild(statusElement);
    const dom = {
      gallery: galleryElement,
      galleryStatus: statusElement,
      summary: null,
      showDuplicatesToggle: { checked: false },
      showOcrToggle: { checked: false },
      searchInput: { value: '' },
      filterSelect: { value: 'all' },
      colorFilter: { value: 'all' }
    };
    const duplicates = {
      has: () => false,
      set: () => {}
    };

    const galleryView = galleryFactory.createGalleryView({
      state,
      datasetState,
      dom,
      duplicates,
      itemColorOptions: [],
      createEffect: () => null,
      bindImage: () => {},
      createElement: defaultCreateElement,
      joinPath: (_base, leaf) => leaf || '',
      getFileName: (path) => String(path || ''),
      showStatus: () => {},
      clearStatus: () => {},
      getRecordByIndex: (index) => state.records[index] || null,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false
    });

    galleryView.buildGallery();
    const item = dom.gallery.children[0];
    const input = item.querySelector('.item-tags-input');
    assert.ok(input, 'タグ入力が生成されていること');

    input.value = 'alpha ';
    input.dataset.editingTags = 'true';

    galleryView.applyItemTags(item, 'alpha beta');
    assert.equal(input.value, 'alpha ', '編集中は正規化で上書きされない');
    assert.equal(item.dataset.tags, 'alpha beta');
    delete input.dataset.editingTags;
    galleryView.applyItemTags(item, 'alpha beta');
    assert.equal(input.value, 'alpha beta', 'フォーカスが外れたら表示を同期');
  });

});

describe('item enhancers factory', () => {
  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/render/itemEnhancers.js');
  });

  afterEach(() => {
    delete global.window;
  });

  test('createItemEnhancers composes defaults and additionals', () => {
    const calls = [];
    const enhancerFactory = global.window.galleryRenderFactory;
    const enhancers = enhancerFactory.createItemEnhancers({
      syncDuplicateState: () => calls.push('duplicate'),
      syncFavoriteState: (item, context) => calls.push(`favorite-${context.recordIndex}`),
      syncItemColorState: () => calls.push('color'),
      refreshItemCaches: () => calls.push('caches'),
      additionalEnhancers: [
        (item) => {
          calls.push(`extra-${item.id}`);
        }
      ]
    });

    const item = { id: 'item-1' };
    const context = { recordIndex: 5 };
    enhancers.forEach((fn) => fn(item, context));

    assert.deepEqual(calls, ['duplicate', 'favorite-5', 'color', 'caches', 'extra-item-1']);
  });

  test('createItemEnhancers honors includeDefaultEnhancers flag', () => {
    const calls = [];
    const enhancerFactory = global.window.galleryRenderFactory;
    const enhancers = enhancerFactory.createItemEnhancers({
      includeDefaultEnhancers: false,
      baseEnhancers: [
        (item, context) => {
          calls.push(`base-${context.visibleIndex}`);
        }
      ],
      additionalEnhancers: [
        () => {
          calls.push('addon');
        }
      ]
    });

    const item = { id: 'item-2' };
    const context = { visibleIndex: 2 };
    enhancers.forEach((fn) => fn(item, context));

    assert.deepEqual(calls, ['base-2', 'addon']);
  });
});


describe('gallery dataset utils', () => {
  let datasetUtils;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/dataset/utils.js');
    datasetUtils = global.window.galleryDatasetUtils;
  });

  afterEach(() => {
    delete global.window;
  });

  test('parseDatasets normalizes entries and filters invalid', () => {
    const json = JSON.stringify([
      { csv: 'alpha.csv' },
      { csv: 'beta.csv', imgDir: ' images ', label: ' Beta ', folder: ' sub ' },
      {
        csv: '',
        kind: 'merged',
        sources: [{ csv: 'child.csv', imgDir: 'child', label: ' Child ' }]
      },
      null,
      { label: 'invalid' }
    ]);

    const list = datasetUtils.parseDatasets(json);
    assert.equal(list.length, 3);
    assert.deepEqual(list[0], {
      label: '',
      csv: 'alpha.csv',
      imgDir: '',
      folder: '',
      index: 0,
      kind: '',
      sources: []
    });
    assert.deepEqual(list[1], {
      label: 'Beta',
      csv: 'beta.csv',
      imgDir: 'images',
      folder: 'sub',
      index: 1,
      kind: '',
      sources: []
    });
    assert.equal(list[2].kind, 'merged');
    assert.deepEqual(list[2].sources, [
      { label: 'Child', csv: 'child.csv', imgDir: 'child', folder: '', index: 0 }
    ]);
    assert.equal(list[2].relicType, 'merged');
  });

  test('resolveDatasetState derives merged descriptors', () => {
    const dataset = {
      label: 'Merged',
      folder: 'datasets',
      kind: 'merged',
      csv: '',
      imgDir: 'ignored',
      sources: [
        { label: 'Left', csv: 'left.csv', imgDir: 'left', folder: 'a' },
        { label: 'Right', csv: 'right.csv', imgDir: 'right', folder: 'b' }
      ]
    };

    const descriptor = datasetUtils.resolveDatasetState(dataset);
    assert.equal(descriptor.label, 'Merged');
    assert.equal(descriptor.csvPath, 'merged-dataset.csv');
    assert.equal(descriptor.imageDir, '');
    assert.equal(descriptor.kind, 'merged');
    assert.deepEqual(descriptor.sources, [
      { label: 'Left', csv: 'left.csv', imgDir: 'left', folder: 'a', index: 0 },
      { label: 'Right', csv: 'right.csv', imgDir: 'right', folder: 'b', index: 1 }
    ]);
  });

  test('parseDatasetIndex clamps values to range', () => {
    assert.equal(datasetUtils.parseDatasetIndex('3', 5), 3);
    assert.equal(datasetUtils.parseDatasetIndex('-1', 4), 0);
    assert.equal(datasetUtils.parseDatasetIndex('10', 4), 3);
    assert.equal(datasetUtils.parseDatasetIndex('NaN', 0), -1);
  });

  test('areSourcesEqual detects index differences', () => {
    const base = [
      { label: 'Left', csv: 'left.csv', imgDir: 'left', folder: 'a', index: 0 },
      { label: 'Right', csv: 'right.csv', imgDir: 'right', folder: 'b', index: 1 }
    ];
    const clone = datasetUtils.cloneDatasetSources(base);
    assert.ok(datasetUtils.areSourcesEqual(base, clone));

    const reordered = datasetUtils.cloneDatasetSources(base);
    reordered.reverse();
    assert.equal(datasetUtils.areSourcesEqual(base, reordered), false);

    const changedIndex = datasetUtils.cloneDatasetSources(base);
    changedIndex[1].index = 2;
    assert.equal(datasetUtils.areSourcesEqual(base, changedIndex), false);
  });
});


describe('gallery dataset manager', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('switchDataset triggers reload only when necessary', async () => {
    runScript('templates/gallery/state/store.js');
    runScript('templates/gallery/dataset/manager.js');

    const storeFactory = global.window.galleryStateStoreFactory;
    const datasetFactory = global.window.galleryDatasetManagerFactory;

    const initial = {
      datasets: [
        { label: 'Alpha', csv: 'alpha.csv', kind: 'normal', imageDir: 'images' },
        { label: 'Beta', csv: 'beta.csv', kind: 'normal', imageDir: 'images' }
      ],
      activeDatasetIndex: 0,
      labelSymbols: []
    };
    const store = storeFactory.createStateStore(initial);

    const activity = [];
    const manager = datasetFactory.createDatasetManager({
      stateStore: store,
      datasetState: store.dataset,
      state: store.core,
      resolveDatasetState: (dataset) => ({
        label: dataset.label,
        kind: dataset.kind || 'normal',
        csvPath: dataset.csv,
        imageDir: dataset.imageDir || '.',
        sources: dataset.sources || []
      }),
      areSourcesEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      applyDatasetState: () => activity.push('apply'),
      clearForReload: () => activity.push('clear'),
      loadInitialData: async () => activity.push('load')
    });

    await manager.switchDataset(0);
    assert.deepEqual(activity, ['apply', 'clear', 'load']);

    activity.length = 0;
    await manager.switchDataset(1);
    assert.deepEqual(activity, ['apply', 'clear', 'load']);
  });
});

describe('gallery storage utils', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('parseCsvRecords and loadMergedRecords snapshot', async () => {
    runScript('templates/gallery/storage/utils.js');
    const utils = global.window.galleryStorageUtils;
    assert.ok(utils, 'storage utils should exist');

    const csv = 'Name,Value\nA,1\nB,2\n';
    const records = utils.parseCsvRecords(csv);
    assert.deepEqual(records, [
      { Name: 'A', Value: '1' },
      { Name: 'B', Value: '2' }
    ]);

    const sources = [
      { label: 'Alpha', csv: 'alpha.csv', imgDir: 'img' },
      { label: 'Beta', csv: 'beta.csv', imgDir: 'img' }
    ];

    const csvMap = {
      'alpha.csv': 'Image\nalpha.png\n',
      'beta.csv': 'Image\nbeta.png\n'
    };

    global.fetch = async (url) => ({
      ok: true,
      async text() {
        return csvMap[url];
      }
    });

    const merged = await utils.loadMergedRecords(sources);
    assert.deepEqual(merged, [
      {
        Image: 'img/alpha.png',
        BaseImage: 'alpha.png',
        Dataset: 'Alpha',
        DatasetFolder: '',
        DatasetIndex: 0,
        SourceCsv: 'alpha.csv',
        SourceImageDir: 'img'
      },
      {
        Image: 'img/beta.png',
        BaseImage: 'beta.png',
        Dataset: 'Beta',
        DatasetFolder: '',
        DatasetIndex: 1,
        SourceCsv: 'beta.csv',
        SourceImageDir: 'img'
      }
    ]);
  });

  test('createOpfsManager respects dataset kind', async () => {
    runScript('templates/gallery/storage/utils.js');
    const utils = global.window.galleryStorageUtils;

    const messages = [];
    let fetchCalls = 0;
    const payloads = [];
    const records = [
      {
        Image: 'sample.png',
        Duplicate: false,
        Effect1Level: '',
        Effect1LevelOptions: 'none',
        Effect1LevelSource: ''
      }
    ];
    global.fetch = async (_url, init = {}) => {
      fetchCalls += 1;
      if (init && init.body) {
        try {
          payloads.push(JSON.parse(init.body));
        } catch (error) {
          payloads.push(null);
        }
      }
      return { ok: true, async text() { return ''; } };
    };

    const manager = utils.createOpfsManager({
      getRecords: () => records,
      getDatasetState: () => ({ kind: 'normal', label: 'Alpha' }),
      getCsvPath: () => 'alpha.csv',
      resolveCsvSavePath: (value) => value,
      setStorageStatus: (message) => messages.push(message)
    });

    await manager.flushNow();
    assert.ok(messages.some((message) => message.startsWith('保存しました')));
    assert.equal(fetchCalls, 1);
    assert.equal(records[0].Effect1Level, 'none');
    assert.equal(records[0].Effect1LevelSource, 'none');
    assert.equal(Array.isArray(payloads) && payloads.length, 1);
    assert.equal(payloads[0].records[0].Effect1Level, 'none');
    assert.equal(payloads[0].records[0].Effect1LevelSource, 'none');

    const blocked = utils.createOpfsManager({
      getRecords: () => records,
      getDatasetState: () => ({ kind: 'merged', label: 'Merged' }),
      getCsvPath: () => 'merged.csv',
      resolveCsvSavePath: (value) => value,
      setStorageStatus: (message) => messages.push(message)
    });
    await blocked.flushNow();
    assert.equal(fetchCalls, 1, 'should not call fetch for merged dataset');
  });
});

describe('gallery storage manager', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('wraps underlying storage implementation', async () => {
    runScript('templates/gallery/storage/utils.js');
    runScript('templates/gallery/storage/manager.js');

    let saveCalls = 0;
    const stubManager = {
      supported: true,
      usesOpfs: true,
      usesLocalBackup: false,
      fileName: 'results.csv',
      scheduleSave: () => {
        saveCalls += 1;
      },
      async tryLoad(name) {
        return name === 'results.csv' ? 'csv-data' : null;
      }
    };

    const managerFactory = global.window.galleryStorageManagerFactory;
    const manager = managerFactory.createStorageManager({
      storageUtils: {
        createOpfsManager: () => stubManager
      },
      getRecords: () => [],
      getDatasetState: () => ({ kind: 'normal' }),
      getCsvPath: () => 'results.csv',
      resolveCsvSavePath: (value) => value,
      setStorageStatus: () => {}
    });

    manager.scheduleSave();
    assert.equal(saveCalls, 1);

    const loaded = await manager.tryLoad('results.csv');
    assert.equal(loaded, 'csv-data');
    assert.equal(manager.supported, true);
    assert.equal(manager.usesOpfs, true);
    assert.equal(manager.fileName, 'results.csv');
  });
});

describe('gallery app controller', () => {
  beforeEach(() => {
    global.window = {};
  });

  test('initialize runs steps in order', async () => {
    runScript('templates/gallery/app/controller.js');
    const controllerFactory = global.window.galleryAppFactory;
    assert.ok(controllerFactory);

    const steps = [];
    const controller = controllerFactory.createAppController({
      attachEventHandlers: () => steps.push('attach'),
      prepareInitialDataset: () => steps.push('prepare'),
      setupDatasetSelector: () => steps.push('setup'),
      ensureMasterLevels: async () => steps.push('levels'),
      ensureMasterOptions: async () => steps.push('options'),
      datasetState: { list: [{ label: 'Alpha' }], activeIndex: 0 },
      switchDataset: async () => steps.push('switch'),
      loadInitialData: async () => steps.push('load')
    });

    await controller.initialize();
    assert.deepEqual(steps, ['attach', 'prepare', 'setup', 'levels', 'options', 'switch']);
  });
});


describe('gallery effect view model', () => {
  let viewModel;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/render/effectViewModel.js');
    viewModel = global.window.galleryRenderFactory.effectViewModel;
  });

  afterEach(() => {
    delete global.window;
  });

  test('createEffectContext returns null when record has no displayable data', () => {
    const record = {
      Effect1: '',
      RawText1: '',
      Effect1Score: null
    };
    const context = viewModel.createEffectContext(record, 1, 'Ⅰ', 'image.png', 0, {
      normalizeStatus: () => 'pending'
    });
    assert.equal(context, null);
  });

  test('createEffectContext normalizes fields without correction columns', () => {
    const record = {
      Effect1: 'Power Boost',
      RawText1: 'Raw Effect',
      Effect1Score: '72.4',
      Effect1Level: 'L1',
      Effect1LevelOptions: 'L1| L2 |',
      Effect1Status: 'pending'
    };

    const context = viewModel.createEffectContext(record, 1, 'Ⅰ', 'Image.PNG', 5, {
      normalizeStatus: (value) => (value === 'pending' ? 'pending' : 'pass')
    });

    assert.equal(context.recordIndex, 5);
    assert.equal(context.imageNameLower, 'image.png');
    assert.equal(context.predictionText, 'Power Boost');
    assert.equal(context.scoreDisplay, '72.4%');
    assert.deepEqual(context.levelOptions, ['L1', 'L2']);
    assert.equal(context.statusValue, 'pending');
    assert.equal(context.displayLevel, 'L1');
    assert.equal(context.correctionValue, '');
  });

  test('createEffectContext handles demerit entries', () => {
    const record = {
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: '55.2',
      Demerit1Status: 'pending'
    };

    const context = viewModel.createEffectContext(record, 1, 'Ⅰ', 'Penalty.png', 2, {
      normalizeStatus: (value) => value,
      kind: 'demerit'
    });

    assert.ok(context, 'context should be created for demerit records');
    assert.equal(context.isDemerit, true);
    assert.equal(context.effectKind, 'demerit');
    assert.equal(context.predictionText, 'Heavy Burden');
    assert.equal(context.rawText, 'Heavy Burden');
    assert.equal(context.scoreDisplay, '55.2%');
    assert.equal(context.statusValue, 'pending');
    assert.equal(context.correctionValue, '');
    assert.deepEqual(context.levelOptions, []);
    assert.equal(context.lowConfidence, true);
  });

  test('buildLevelChoices merges original and correction values', () => {
    const context = {
      levelOptions: ['High', 'Low', 'High'],
      levelValue: 'Base',
      levelValueLower: 'base',
      preserveOriginalLevel: false,
      levelCorrection: 'Expert'
    };

    const result = viewModel.buildLevelChoices(context, {
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : [])
    });

    assert.deepEqual(result, ['Expert', 'High', 'Low']);
  });

  test('parseLevelOptions normalizes string and array sources', () => {
    assert.deepEqual(viewModel.parseLevelOptions('A| B |'), ['A', 'B']);
    assert.deepEqual(viewModel.parseLevelOptions(['', 'C', null, 'D']), ['C', 'D']);
    assert.deepEqual(viewModel.parseLevelOptions('none|L1'), ['L1']);
    assert.deepEqual(viewModel.parseLevelOptions(['none', 'Lv2']), ['Lv2']);
    assert.deepEqual(viewModel.parseLevelOptions(['none']), []);
    assert.deepEqual(viewModel.parseLevelOptions(null), []);
  });
});

describe('gallery effect factory', () => {
  let effectFactory;
  let applyCalls;

  beforeEach(() => {
    global.window = {};
    global.document = createMockDocument();
    applyCalls = [];
    runScript('templates/gallery/render/effectViewModel.js');
    runScript('templates/gallery/render/effectFactory.js');
    const factory = global.window.galleryRenderFactory;
    effectFactory = factory.createEffectFactory({
      state: { showOcr: true, masterOptions: [], masterDemeritOptions: [], labelSymbols: ['Ⅰ'] },
      datasetState: { kind: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: (...args) => applyCalls.push(args),
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  test('createEffect builds element and applies master options', () => {
    const record = {
      Effect1: 'Power',
      RawText1: 'Raw',
      Effect1Score: 95,
      Effect1Level: 'L1',
      Effect1LevelOptions: 'L1|L2',
      Effect1Status: 'pending',
      BaseImage: 'base.png'
    };
    const effect = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    assert.ok(effect, 'effect should be created');
    assert.equal(effect.dataset.slot, '1');
    assert.equal(effect.dataset.predictionValue, 'Power');
    assert.ok(applyCalls.length === 1, 'applyMasterLevelOptions should be invoked');
    const [, levelInput, effectName, helpers] = applyCalls[0];
    assert.equal(levelInput.tagName, 'SELECT');
    assert.equal(effectName, 'Power');
    assert.equal(typeof helpers.setCorrectionLevelCandidates, 'function');
    assert.equal(typeof helpers.rebuildLevelSelectOptions, 'function');
  });

  test('level correction does not override master lookup key', () => {
    const record = {
      Effect1: '炎攻撃力上昇',
      RawText1: 'Raw',
      Effect1Score: 80,
      Effect1Level: 'L3',
      Effect1LevelOptions: 'L1|L2|L3',
      Effect1Status: 'pending',
      BaseImage: 'base.png'
    };
    const effect = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    assert.ok(effect, 'effect should be created with level correction');
    assert.ok(applyCalls.length === 1, 'applyMasterLevelOptions should be invoked');
    const [, , effectName] = applyCalls[0];
    assert.equal(effectName, '炎攻撃力上昇');
  });

  test('createEffect builds demerit entry without level controls', () => {
    const record = {
      Demerit1: 'Penalty',
      Demerit1RawText: 'Penalty OCR',
      Demerit1Score: 42.5,
      Demerit1Status: 'pending'
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: {
        showOcr: true,
        masterOptions: [],
        masterDemeritOptions: ['Penalty'],
        labelSymbols: ['Ⅰ']
      },
      datasetState: { kind: 'normal', relicType: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(effect, 'demerit effect should be created');
    assert.equal(effect.classList.contains('effect--demerit'), true);
    assert.equal(effect.dataset.kind, 'demerit');
    assert.equal(effect.querySelector('.level-input'), null);
    assert.equal(applyCalls.length, 0, 'applyMasterLevelOptions should not run for demerits');
    const correctionInput = effect.querySelector('.correction-input');
    assert.ok(correctionInput, 'correction input should exist');
    assert.equal(correctionInput.attributes.list, 'master-demerit-id');
    assert.equal(correctionInput.disabled, true);
    assert.equal(correctionInput.value, '');
    assert.equal(correctionInput.placeholder, '通常遺物ではデメリットなし');
    const passButton = effect.querySelector('.review-button.pass');
    assert.ok(passButton, 'pass button should exist');
    assert.equal(passButton.disabled, true);
    assert.equal(effect.style.display, 'none');
    assert.equal(effect.attributes['aria-hidden'], 'true');
    assert.equal(effect.dataset.hiddenDemerit, 'true');
  });

  test('createEffect creates hidden demerit placeholder when record lacks data', () => {
    const record = { RelicType: '通常' };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: {
        showOcr: true,
        masterOptions: [],
        masterDemeritOptions: ['Penalty'],
        labelSymbols: ['Ⅰ']
      },
      datasetState: { kind: 'normal', relicType: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(effect, 'empty demerit placeholder should be created');
    const input = effect.querySelector('.correction-input');
    assert.ok(input, 'placeholder should include correction input');
    assert.equal(input.disabled, true);
    assert.equal(input.placeholder, '通常遺物ではデメリットなし');
    assert.equal(effect.dataset.hiddenDemerit, 'true');
    assert.equal(effect.style.display, 'none');
  });

  test('syncDemeritAvailability reveals placeholder after relic type change to deep', () => {
    const record = { RelicType: 'normal' };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Penalty'],
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(effect, 'placeholder should be created for later toggling');
    const input = effect.querySelector('.correction-input');
    const passButton = effect.querySelector('.review-button.pass');
    assert.equal(input.disabled, true);
    assert.equal(effect.dataset.hiddenDemerit, 'true');

    record.RelicType = '深層遺物';
    localFactory.syncDemeritAvailability(effect, { refreshStatus: true });

    assert.equal(effect.dataset.hiddenDemerit, undefined);
    assert.equal(effect.style.display, '');
    assert.equal(input.disabled, false);
    assert.equal(input.readOnly, false);
    assert.equal(input.tabIndex, 0);
    assert.equal(passButton.disabled, false);
    assert.equal(input.placeholder, 'デメリット候補から選択');
    assert.equal(input.attributes['aria-readonly'], undefined);
  });

  test('syncDemeritAvailability marks demerit status as pass for normal relics', () => {
    const record = { RelicType: '通常遺物', Demerit1Status: 'pending' };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Penalty'],
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });

    localFactory.syncDemeritAvailability(effect, { refreshStatus: true });

    assert.equal(record.Demerit1Status, 'pass');
    assert.equal(effect.dataset.status, 'pass');
    assert.equal(effect.dataset.hiddenDemerit, 'true');
  });

  test('syncDemeritAvailability clears pending demerit review after switching from deep to normal', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: 'Test Effect',
      Effect1Level: '＋1',
      Demerit1: 'Heavy Burden',
      Demerit1Status: 'pending'
    };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {
        'test effect': { hasDemerit: true, levels: ['＋1'] }
      },
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });

    record.RelicType = '通常遺物';
    localFactory.syncDemeritAvailability(effect, { refreshStatus: true });

    assert.equal(record.Demerit1Status, 'pass');
    assert.equal(effect.dataset.status, 'pass');
    const input = effect.querySelector('.correction-input');
    assert.equal(input.disabled, true);
    assert.equal(input.placeholder, '通常遺物ではデメリットなし');
  });

  test('syncDemeritAvailability toggles paired effect class when demerit visibility changes', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: 'Test Effect',
      Effect1Level: '＋3',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 42.1
    };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {},
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });

    const primaryEffect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    const demeritEffect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    const container = new MockElement('div', 'effect-container');
    container.appendChild(primaryEffect);
    container.appendChild(demeritEffect);

    primaryEffect.classList.add('effect--with-demerit');
    assert.equal(primaryEffect.classList.contains('effect--with-demerit'), true);
    assert.equal(demeritEffect.style.display === '' || demeritEffect.style.display === undefined, true);

    record.RelicType = '通常';
    localFactory.syncDemeritAvailability(demeritEffect, { refreshStatus: true });
    assert.equal(demeritEffect.style.display, 'none');
    assert.equal(primaryEffect.classList.contains('effect--with-demerit'), false);

    record.RelicType = '深層遺物';
    localFactory.syncDemeritAvailability(demeritEffect, { refreshStatus: true });
    assert.equal(demeritEffect.style.display, '');
    assert.equal(primaryEffect.classList.contains('effect--with-demerit'), true);
  });

  test('deep relic disables demerit controls when no matching level is available', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: 'Test Effect',
      Effect1Level: '＋2',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 45.5
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: {
        showOcr: true,
        masterOptions: [],
        masterDemeritOptions: ['Heavy Burden'],
        masterDemeritRules: {
          'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
        },
        labelSymbols: ['Ⅰ']
      },
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(effect, 'demerit effect should be created');
    const correctionInput = effect.querySelector('.correction-input');
    assert.ok(correctionInput, 'correction input should exist');
    assert.equal(correctionInput.disabled, true);
    assert.equal(correctionInput.placeholder, '指定レベルのデメリットなし');
    const passButton = effect.querySelector('.review-button.pass');
    assert.ok(passButton, 'pass button should exist');
    assert.equal(passButton.disabled, true);
    assert.equal(effect.style.display, '');
    assert.equal(effect.attributes['aria-hidden'], undefined);
    assert.equal(effect.dataset.hiddenDemerit, undefined);
    assert.equal(effect.classList.contains('effect--demerit-noinput'), true);
    assert.equal(effect.classList.contains('low-confidence'), true);
  });

  test('deep relic treats hyphen placeholder effect as demerit exempt', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: ' - ',
      Effect1Level: '＋4',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 40
    };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {
        'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
      },
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    const correctionInput = effect.querySelector('.correction-input');
    assert.ok(correctionInput, 'correction input should exist');
    assert.equal(correctionInput.disabled, true);
    assert.equal(correctionInput.placeholder, 'デメリット対象外');
    const passButton = effect.querySelector('.review-button.pass');
    assert.ok(passButton, 'pass button should exist');
    assert.equal(passButton.disabled, true);
    assert.equal(effect.style.display, '');
    assert.equal(effect.dataset.hiddenDemerit, undefined);
    assert.equal(effect.classList.contains('effect--demerit-noinput'), true);
    assert.equal(effect.classList.contains('low-confidence'), true);
  });

  test('deep relic enables demerit controls when matching level is available', () => {
    const record = {
      RelicType: '深層',
      Effect1: 'Test Effect',
      Effect1Level: '＋3',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 35.2
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: {
        showOcr: true,
        masterOptions: [],
        masterDemeritOptions: ['Heavy Burden'],
        masterDemeritRules: {
          'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
        },
        labelSymbols: ['Ⅰ']
      },
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(effect, 'demerit effect should be created');
    const correctionInput = effect.querySelector('.correction-input');
    assert.ok(correctionInput, 'correction input should exist');
    assert.equal(correctionInput.disabled, false);
    assert.equal(correctionInput.readOnly, false);
    assert.equal(correctionInput.tabIndex, 0);
    assert.equal(correctionInput.placeholder, 'デメリット候補から選択');
    const passButton = effect.querySelector('.review-button.pass');
    assert.ok(passButton, 'pass button should exist');
    assert.equal(passButton.disabled, false);
    assert.equal(effect.style.display, '');
    assert.equal(effect.attributes['aria-hidden'], undefined);
    assert.equal(effect.dataset.hiddenDemerit, undefined);
    assert.equal(effect.classList.contains('effect--demerit-noinput'), false);
  });

  test('merged dataset deep relic keeps demerit availability using type-specific rules', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: 'Test Effect',
      Effect1Level: '＋3',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 38.7,
      Demerit1Status: 'pending'
    };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {},
      masterDemeritRulesByType: {
        deep: {
          'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
        }
      },
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'merged', relicType: 'merged' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });

    const item = new MockElement('div', 'item');
    const primaryEffect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    const demeritEffect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    item.appendChild(primaryEffect);
    item.appendChild(demeritEffect);

    localFactory.syncDemeritAvailability(demeritEffect, { refreshStatus: true });

    const correctionInput = demeritEffect.querySelector('.correction-input');
    const passButton = demeritEffect.querySelector('.review-button.pass');
    assert.ok(correctionInput, 'correction input should exist');
    assert.equal(correctionInput.placeholder, 'デメリット候補から選択');
    assert.ok(passButton, 'pass button should exist');
    assert.equal(passButton.disabled, true);
  });

  test('syncDemeritAvailability disables controls after level loses demerit match', () => {
    const record = {
      RelicType: '深層遺物',
      Effect1: 'Test Effect',
      Effect1Level: '＋3',
      Effect1Status: 'pending',
      Demerit1: 'Heavy Burden',
      Demerit1RawText: 'Heavy Burden',
      Demerit1Score: 35.2,
      Demerit1Status: 'pending'
    };
    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {
        'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
      },
      labelSymbols: ['Ⅰ'],
      records: [record]
    };
    const localFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'deep' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const effect = localFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    const correctionInput = effect.querySelector('.correction-input');
    const passButton = effect.querySelector('.review-button.pass');
    assert.equal(correctionInput.disabled, false);
    assert.equal(correctionInput.readOnly, false);
    assert.equal(correctionInput.tabIndex, 0);
    assert.equal(passButton.disabled, false);

    record.Effect1Level = '＋1';
    effect.dataset.levelCorrection = '＋1';
    effect.dataset.levelCorrectionValue = '＋1';
    localFactory.syncDemeritAvailability(effect, { refreshStatus: true });

    assert.equal(correctionInput.disabled, true);
    assert.equal(correctionInput.readOnly, true);
    assert.equal(correctionInput.tabIndex, -1);
    assert.equal(correctionInput.placeholder, '指定レベルのデメリットなし');
    assert.equal(passButton.disabled, true);
    assert.equal(effect.style.display, '');
    assert.equal(effect.dataset.hiddenDemerit, undefined);
  });

  test('createEffect does not nest demerit and allows separate creation', () => {
    const record = {
      Effect1: 'Power Boost',
      RawText1: 'OCR Text',
      Effect1Score: 88.2,
      Effect1Status: 'pending',
      Demerit1: 'Penalty',
      Demerit1RawText: 'Penalty OCR',
      Demerit1Score: 35.5,
      Demerit1Status: 'pending'
    };
    const effect = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    assert.ok(effect, 'effect should be created');
    assert.equal(effect.querySelector('.effect--demerit'), null, 'effect should not nest demerit');
    const demerit = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
    assert.ok(demerit, 'demerit element should be created separately');
    assert.equal(demerit.classList.contains('effect--demerit'), true);
  });

  test('updateEffectStatus updates dataset and button selection', () => {
    const effect = new MockElement('div', 'effect pending');
    const indicator = new MockElement('span', 'status-indicator');
    const passButton = new MockElement('button', 'review-button');
    passButton.dataset.value = 'pass';
    effect.appendChild(indicator);
    effect.appendChild(passButton);
    effectFactory.updateEffectStatus(effect, 'pass');
    assert.equal(effect.dataset.status, 'pass');
    assert.equal(effect.classList.contains('pending'), false);
    assert.equal(indicator.textContent, '確認済み');
    assert.equal(passButton.classList.contains('selected'), true);
  });

  test('setCorrectionLevelCandidates sanitizes and stores candidates', () => {
    const effect = new MockElement('div', 'effect');
    const input = new MockElement('input', 'correction-input');
    effect.appendChild(input);
    const result = effectFactory.setCorrectionLevelCandidates(effect, [' 2 ', '', null, '1']);
    assert.deepEqual(result, ['1', '2']);
    assert.equal(input.dataset.levelCandidates, JSON.stringify(['1', '2']));
  });

  test('rebuildLevelSelectOptions merges base and extra options', () => {
    const effect = new MockElement('div', 'effect');
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.preserveOriginalLevel = 'true';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['Base', 'Alt']);
    const select = new MockElement('select', 'level-input');
    effectFactory.rebuildLevelSelectOptions(effect, select, null, ['Extra']);
    assert.equal(select.children.length, 4);
    const optionValues = select.children.map((child) => child.textContent);
    assert.deepEqual(optionValues, ['', 'Alt', 'Base', 'Extra']);
    assert.equal(select.value, 'Base');
    assert.equal(effect.dataset.levelOptionsDisplay, 'Alt|Base|Extra');
    assert.equal(effect.dataset.levelOptions, 'alt|base|extra');
  });

  test('rebuildLevelSelectOptions treats none placeholder as blank label', () => {
    const effect = new MockElement('div', 'effect');
    effect.dataset.levelOriginalValue = 'none';
    effect.dataset.preserveOriginalLevel = 'true';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['none']);
    const select = new MockElement('select', 'level-input');
    effectFactory.rebuildLevelSelectOptions(effect, select);
    assert.equal(select.children.length, 1);
    const [onlyOption] = select.children;
    assert.equal(onlyOption.value, 'none');
    assert.equal(onlyOption.textContent, '');
    assert.equal(select.value, '');
    assert.equal(select.disabled, true);
    assert.equal(effect.dataset.levelOptionsDisplay, '');
  });

  test('createCorrectionInput toggles manual input based on master availability', () => {
    const disabledInput = effectFactory.createCorrectionInput({ isDemerit: false }, '', 'Fallback');
    assert.equal(disabledInput.disabled, true);
    assert.equal(disabledInput.placeholder, 'マスターデータ未設定');
    assert.equal(disabledInput.readOnly, true);
    assert.equal(disabledInput.tabIndex, -1);
    assert.equal(disabledInput.attributes['aria-readonly'], 'true');

    const customFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: {
        showOcr: true,
        masterOptions: ['Alpha'],
        masterDemeritOptions: [],
        labelSymbols: ['Ⅰ']
      },
      datasetState: { kind: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const enabledInput = customFactory.createCorrectionInput({ isDemerit: false }, 'Chosen', 'Fallback');
    assert.equal(enabledInput.disabled, false);
    assert.equal(enabledInput.placeholder, 'master_relicsから選択');
    assert.equal(enabledInput.attributes.list, 'master-id');
    assert.equal(enabledInput.value, 'Chosen');
    assert.equal(enabledInput.readOnly, false);
    assert.equal(enabledInput.tabIndex, 0);
    assert.equal(enabledInput.attributes['aria-readonly'], undefined);
  });

  test('parseLevelOptions is delegated to effect view model', () => {
    const viewModel = global.window.galleryRenderFactory.effectViewModel;
    assert.strictEqual(effectFactory.parseLevelOptions, viewModel.parseLevelOptions);
  });

});

describe('gallery item factory', () => {
  let createElement;
  let bindCalls;
  let effectCalls;
  let itemFactoryNamespace;
  let itemFactory;

  beforeEach(() => {
    global.window = {};
    global.document = createMockDocument();
    runScript('templates/gallery/render/itemFactory.js');
    itemFactoryNamespace = global.window.galleryRenderFactory;
    bindCalls = [];
    effectCalls = [];
    createElement = (tagName, className = '', text = '') => new MockElement(tagName, className, text);
    itemFactory = itemFactoryNamespace.createItemFactory({
      datasetState: { kind: 'merged' },
      createElement,
      createFragment: () => new MockElement('#fragment'),
      bindImage: (image) => {
        bindCalls.push(image);
        image.dataset.bound = 'true';
      },
      createEffect: (record, slot, symbol, imageName, recordIndex, options) => {
        effectCalls.push({ record, slot, symbol, imageName, recordIndex, options });
        const element = new MockElement('section', `effect slot-${slot}`);
        element.dataset.slot = String(slot);
        element.dataset.kind = options && options.kind ? options.kind : 'effect';
        return element;
      },
      colorOptions: [
        { key: 'red', label: '赤', className: 'item-color-red' },
        { key: 'blue', label: '青', className: 'item-color-blue' }
      ],
      getImagePath: (imageName) => `images/${imageName}`,
      getDisplayName: (imageName) => imageName.toUpperCase(),
      getLabelSymbols: () => ['Ⅰ', 'Ⅱ']
    });
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  test('createItem assembles both columns with effects and metadata', () => {
    const record = {
      Image: 'alpha.png',
      BaseImage: '',
      Dataset: 'Merged A',
      DatasetFolder: 'runs/a',
      Effect1: 'Power',
      Effect2: 'Guard'
    };
    const item = itemFactory.createItem(record, 0, 1, 5);
    assert.ok(item, 'item should be created');
    assert.equal(item.dataset.imageName, 'alpha.png');
    assert.equal(effectCalls.length, 4, 'effect and demerit entries should be requested for each symbol');
    assert.deepEqual(
      effectCalls.map((entry) => ({
        symbol: entry.symbol,
        slot: entry.slot,
        imageName: entry.imageName,
        kind: entry.options && entry.options.kind ? entry.options.kind : 'effect'
      })),
      [
        { symbol: 'Ⅰ', slot: 1, imageName: 'alpha.png', kind: 'effect' },
        { symbol: 'Ⅰ', slot: 1, imageName: 'alpha.png', kind: 'demerit' },
        { symbol: 'Ⅱ', slot: 2, imageName: 'alpha.png', kind: 'effect' },
        { symbol: 'Ⅱ', slot: 2, imageName: 'alpha.png', kind: 'demerit' }
      ]
    );

    const leftColumn = item.children[0];
    assert.equal(leftColumn.className.includes('item-left'), true);
    const image = leftColumn.children[0];
    assert.equal(image.tagName, 'IMG');
    assert.equal(image.dataset.full, 'images/alpha.png');
    assert.equal(image.dataset.bound, 'true');
    assert.equal(bindCalls.length, 1, 'bindImage should be called once');

    const controls = leftColumn.children[1];
    const metaInfo = controls.querySelector('.item-meta');
    const datasetBadge = metaInfo.querySelector('.dataset-label');
    assert.ok(datasetBadge, 'dataset badge should exist for merged dataset');
    assert.equal(datasetBadge.textContent, 'Merged A');
    assert.equal(datasetBadge.attributes.title, 'Merged A (runs/a)');

    const rightColumn = item.children[1];
    assert.equal(rightColumn.children.length, 4, 'effect and demerit entries should be appended');
    assert.ok(rightColumn.children.every((child) => child.tagName === 'SECTION'));
    assert.deepEqual(
      rightColumn.children.map((child) => child.dataset.kind || 'effect'),
      ['effect', 'demerit', 'effect', 'demerit']
    );
    assert.equal(rightColumn.children[0].classList.contains('effect--with-demerit'), true);
    assert.equal(rightColumn.children[2].classList.contains('effect--with-demerit'), true);
  });

  test('createItem falls back to placeholder when no effect is returned', () => {
    const placeholderFactory = itemFactoryNamespace.createItemFactory({
      datasetState: { kind: 'normal' },
      createElement,
      createFragment: () => new MockElement('#fragment'),
      bindImage: () => {},
      createEffect: () => null,
      colorOptions: [],
      getImagePath: (imageName) => imageName,
      getDisplayName: (imageName) => imageName,
      getLabelSymbols: () => ['Ⅰ']
    });
    const item = placeholderFactory.createItem({ Image: 'beta.png' }, 2, 0, 0);
    const rightColumn = item.children[1];
    assert.equal(rightColumn.children.length, 1);
    const placeholder = rightColumn.children[0];
    assert.equal(placeholder.className.includes('no-effect'), true);
    assert.equal(placeholder.textContent, '効果情報がありません。');
  });

  test('createItem omits demerit link when placeholder is hidden', () => {
    runScript('templates/gallery/render/effectViewModel.js');
    runScript('templates/gallery/render/effectFactory.js');

    const record = {
      Image: 'gamma.png',
      Effect1: 'Power Up',
      RawText1: 'Power Up',
      Effect1Score: 88,
      Effect1Level: '＋1',
      Effect1Status: 'pending',
      RelicType: '通常'
    };

    const state = {
      showOcr: true,
      masterOptions: [],
      masterDemeritOptions: ['Heavy Burden'],
      masterDemeritRules: {},
      labelSymbols: ['Ⅰ'],
      records: [record]
    };

    const effectFactory = global.window.galleryRenderFactory.createEffectFactory({
      state,
      datasetState: { kind: 'normal', relicType: 'normal' },
      masterDatalistId: 'master-id',
      demeritDatalistId: 'master-demerit-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });

    const localFactory = itemFactoryNamespace.createItemFactory({
      datasetState: { kind: 'normal', relicType: 'normal' },
      createElement,
      createFragment: () => new MockElement('#fragment'),
      bindImage: () => {},
      createEffect: (...args) => effectFactory.createEffect(...args),
      colorOptions: [],
      getImagePath: (imageName) => imageName,
      getDisplayName: (imageName) => imageName,
      getLabelSymbols: () => ['Ⅰ']
    });

    const item = localFactory.createItem(record, 0, 1, 1);
    const rightColumn = item.children[1];
    const effect = rightColumn.children[0];
    const demerit = rightColumn.children[1];

    assert.ok(effect, 'main effect should exist');
    assert.ok(demerit, 'demerit placeholder should exist');
    assert.equal(demerit.dataset.hiddenDemerit, 'true');
    assert.equal(demerit.style.display, 'none');
    assert.equal(effect.classList.contains('effect--with-demerit'), false);
  });

  test('createItem uses demerit fallback when main effect is missing', () => {
    const fallbackCalls = [];
    const fallbackFactory = itemFactoryNamespace.createItemFactory({
      datasetState: { kind: 'normal' },
      createElement,
      createFragment: () => new MockElement('#fragment'),
      bindImage: () => {},
      createEffect: (record, slot, symbol, imageName, recordIndex, options) => {
        fallbackCalls.push(options && options.kind ? options.kind : 'effect');
        if (options && options.kind === 'demerit') {
          const element = new MockElement('section', 'effect slot-demerit');
          element.dataset.kind = 'demerit';
          element.dataset.slot = String(slot);
          return element;
        }
        return null;
      },
      colorOptions: [],
      getImagePath: (imageName) => imageName,
      getDisplayName: (imageName) => imageName,
      getLabelSymbols: () => ['Ⅰ']
    });

    const record = {
      Image: 'gamma.png',
      Demerit1: 'Penalty',
      Demerit1RawText: 'Penalty OCR',
      Demerit1Score: 50
    };

    const item = fallbackFactory.createItem(record, 0, 1, 1);
    const rightColumn = item.children[1];
    assert.deepEqual(fallbackCalls, ['effect', 'demerit']);
    assert.equal(rightColumn.children.length, 1);
    const demerit = rightColumn.children[0];
    assert.equal(demerit.dataset.kind, 'demerit');
    assert.equal(demerit.dataset.slot, '1');
  });

  test('item enhancers run after item creation', () => {
    const enhancerCalls = [];
    const enhancerFactory = itemFactoryNamespace.createItemFactory({
      datasetState: { kind: 'normal' },
      createElement,
      createFragment: () => new MockElement('#fragment'),
      bindImage: () => {},
      createEffect: () => null,
      colorOptions: [],
      getImagePath: (imageName) => imageName,
      getDisplayName: (imageName) => imageName,
      getLabelSymbols: () => [],
      itemEnhancers: [
        (item, context) => {
          enhancerCalls.push({ item, context });
          if (item) {
            item.dataset.enhanced = 'true';
          }
        }
      ]
    });

    const record = { Image: 'delta.png' };
    const item = enhancerFactory.createItem(record, 3, 2, 6);
    assert.equal(item.dataset.enhanced, 'true');
    assert.equal(enhancerCalls.length, 1);
    assert.equal(enhancerCalls[0].context.recordIndex, 3);
    assert.equal(enhancerCalls[0].context.visibleIndex, 2);
    assert.equal(enhancerCalls[0].context.visibleTotal, 6);
  });

  test('createItemContext exposes dataset metadata and resolved paths', () => {
    const context = itemFactory.createItemContext(
      {
        Image: 'gamma.png',
        BaseImage: 'gamma_base.png',
        Dataset: 'Merged B',
        DatasetFolder: 'runs/b'
      },
      5,
      3,
      10
    );
    assert.equal(context.imagePath, 'images/gamma.png');
    assert.equal(context.displayName, 'gamma_base.png');
    assert.equal(context.datasetName, 'Merged B');
    assert.equal(context.datasetFolder, 'runs/b');
    assert.equal(context.visibleIndex, 3);
    assert.equal(context.visibleTotal, 10);
  });
});

describe('record action handlers', () => {
  let handlerFactory;

  beforeEach(() => {
    global.window = {};
    runScript('templates/gallery/events/recordActionHandlers.js');
    handlerFactory = global.window.galleryEventHandlersFactory;
  });

  afterEach(() => {
    delete global.window;
  });

  function buildBaseDeps(record, item, extra = {}) {
    return {
      duplicates: { set: () => true },
      scheduleSave: () => {},
      applyFilters: () => {},
      buildGallery: () => {},
      applyItemColor: () => {},
      applyItemRelicType: () => {},
      applyItemTags: () => {},
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      refreshItemCaches: () => {},
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      normalizeItemColor: (value) => (value ? value.toLowerCase() : ''),
      normalizeItemRelicType: (value) => (value ? value.toLowerCase() : ''),
      normalizeItemTags: (value) =>
        (value
          ? String(value)
              .split(/[\s,;、，　；]+/)
              .map((token) => token.trim())
              .filter(Boolean)
              .join(' ')
          : ''),
      isRecordDuplicate: (targetRecord) => Boolean(targetRecord.__duplicate),
      isRecordFavorite: (targetRecord) => Boolean(targetRecord.__favorite),
      setRecordDuplicate: (_index, next) => {
        const changed = record.__duplicate !== next;
        record.__duplicate = next;
        return changed;
      },
      setRecordFavorite: (_index, next) => {
        const changed = record.__favorite !== next;
        record.__favorite = next;
        return changed;
      },
      setRecordItemColor: (_index, nextColor) => {
        const current = record.ItemColor || '';
        const changed = current !== nextColor;
        record.ItemColor = nextColor;
        return changed;
      },
      setRecordItemRelicType: (_index, nextType) => {
        const current = record.RelicType || '';
        const changed = current !== nextType;
        if (nextType) {
          record.RelicType = nextType;
        } else {
          delete record.RelicType;
        }
        return changed;
      },
      setRecordTags: (_index, nextValue) => {
        const normalized = nextValue ? String(nextValue) : '';
        const current = record.Tags || '';
        const changed = current !== normalized;
        if (normalized) {
          record.Tags = normalized;
        } else {
          delete record.Tags;
        }
        return changed;
      },
      recordStatusChange: () => false,
      updateRecordEffectValue: () => false,
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      updateEffectStatus: () => {},
      sanitizeLevelList: (values) => (Array.isArray(values) ? values : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : []),
      createCorrectionInput: () => new MockElement('input'),
      setCorrectionLevelCandidates: () => {},
      rebuildLevelSelectOptions: () => {},
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 0 }),
      updateInputValueAttribute: () => {},
      updateLevelInputAvailability: () => {},
      applyMasterLevelOptions: () => {},
      applyMasterDataForRelicType: () => {},
      ...extra
    };
  }

  test('toggleDuplicate updates record and schedules rebuild', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const button = new MockElement('button', 'duplicate-toggle');
    button.dataset.image = 'alpha.png';
    const duplicatesMap = new Map();
    const scheduleCalls = [];
    const buildCalls = [];
    const visualCalls = [];
    const deps = buildBaseDeps(record, item, {
      duplicates: {
        set: (name, value) => {
          duplicatesMap.set(name, value);
          return true;
        }
      },
      scheduleSave: () => scheduleCalls.push(null),
      buildGallery: () => buildCalls.push(null),
      updateDuplicateVisuals: (target, value) => visualCalls.push([target, value])
    });
    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleDuplicate(button);
    assert.equal(record.__duplicate, true);
    assert.equal(duplicatesMap.get('alpha.png'), true);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(buildCalls.length, 1);
    assert.deepEqual(visualCalls, [[item, true]]);
  });

  test('updateItemTags normalizes tokens, updates record, and schedules save', () => {
    const record = { Tags: 'alpha beta' };
    const item = new MockElement('div', 'item');
    const input = new MockElement('input', 'item-tags-input');
    item.appendChild(input);
    input.value = 'beta, gamma   delta';

    const scheduleCalls = [];
    const filterCalls = [];
    const cacheRefreshes = [];
    const appliedTags = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(true),
      applyFilters: () => filterCalls.push(true),
      refreshItemCaches: (target) => cacheRefreshes.push(target),
      applyItemTags: (target, value) => appliedTags.push([target, value]),
      normalizeItemTags: (value) =>
        (value
          ? String(value)
              .split(/[\s,;、，　；]+/)
              .map((token) => token.trim().toLowerCase())
              .filter(Boolean)
              .filter((token, index, list) => list.indexOf(token) === index)
              .join(' ')
          : ''),
      setRecordTags: (_index, nextValue) => {
        const changed = record.Tags !== nextValue;
        record.Tags = nextValue;
        return changed;
      }
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.updateItemTags(input);

    assert.equal(record.Tags, 'beta gamma delta');
    assert.deepEqual(appliedTags, [[item, 'beta gamma delta']]);
    assert.deepEqual(cacheRefreshes, [item]);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(filterCalls.length, 1);
  });

  test('toggleItemColor normalizes value and toggles selection', () => {
    const record = { ItemColor: 'red' };
    const item = new MockElement('div', 'item');
    const select = new MockElement('select');
    select.value = 'RED';
    const scheduleCalls = [];
    const filterCalls = [];
    const colorCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      applyItemColor: (target, color) => colorCalls.push([target, color])
    });
    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleItemColor(select);
    assert.equal(record.ItemColor, '');
    assert.deepEqual(colorCalls, [[item, '']]);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(filterCalls.length, 1);
  });

  test('toggleItemRelicType toggles type assignment per item', () => {
    const record = { RelicType: 'normal' };
    const item = new MockElement('div', 'item');
    const select = new MockElement('select');
    select.value = 'deep';
    const scheduleCalls = [];
    const filterCalls = [];
    const relicTypeCalls = [];
    const masterDataCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      applyItemRelicType: (target, value) => relicTypeCalls.push([target, value]),
      applyMasterDataForRelicType: (value, context) => masterDataCalls.push([value, context])
    });
    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleItemRelicType(select);
    assert.equal(record.RelicType, 'deep');
    assert.deepEqual(relicTypeCalls, [[item, 'deep']]);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.deepEqual(masterDataCalls, [['deep', { item, record, recordIndex: 0 }]]);

    // Selecting the same value toggles back to empty
    handlers.toggleItemRelicType(select);
    assert.equal(record.RelicType, undefined);
    assert.deepEqual(relicTypeCalls.slice(-1), [[item, '']]);
    assert.deepEqual(masterDataCalls.slice(-1), [['', { item, record, recordIndex: 0 }]]);
  });

  test('toggleFavorite updates visuals and schedules save', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const button = new MockElement('button', 'favorite-toggle');
    const scheduleCalls = [];
    const filterCalls = [];
    const favoriteVisuals = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      updateFavoriteVisuals: (target, value) => favoriteVisuals.push([target, value])
    });
    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleFavorite(button);
    assert.equal(record.__favorite, true);
    assert.deepEqual(favoriteVisuals, [[item, true]]);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(filterCalls.length, 1);
  });

  test('changeEffectCorrection updates effect record and schedules save', () => {
    const record = { Effect1: 'Original', Effect1LevelOptions: 'Base|High' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Original';
    effect.dataset.predictionValue = 'Original';
    effect.dataset.preserveOriginalLevel = 'true';
    const levelInput = new MockElement('select', 'level-input');
    effect.appendChild(levelInput);
    const input = new MockElement('input', 'correction-input');
    input.value = 'New Effect';
    const scheduleCalls = [];
    const effectUpdates = [];
    const levelOptionsUpdates = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      recordStatusChange: () => false,
      updateRecordEffectValue: (_recordIndex, _slotIndex, value) => {
        effectUpdates.push(value);
        if (value) {
          record.Effect1 = value;
        } else {
          delete record.Effect1;
        }
        return true;
      },
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: (_recordIndex, _slotIndex, value) => {
        record.Effect1LevelOptions = value;
        levelOptionsUpdates.push(value);
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' }),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : []),
      applyMasterLevelOptions: (effectNode, selectNode, _name, helpers) => {
        const options = ['＋1', '＋3'];
        if (helpers && typeof helpers.rebuildLevelSelectOptions === 'function') {
          helpers.rebuildLevelSelectOptions(effectNode, selectNode, options);
        }
        if (helpers && typeof helpers.onOptionsApplied === 'function') {
          helpers.onOptionsApplied(effectNode, options);
        }
      }
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1, 'New Effect');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Correction'), false);
    assert.equal(effect.dataset.predictionValue, 'New Effect');
    assert.equal(effect.dataset.pred, 'new effect');
    assert.equal(effect.dataset.correction, 'new effect');
    assert.equal(scheduleCalls.length, 1);
    assert.deepEqual(effectUpdates, ['New Effect']);
    assert.deepEqual(levelOptionsUpdates, ['＋1|＋3']);
  });

  test('changeEffectCorrection keeps manual entry when master match fails', () => {
    const record = { Effect1: 'Original' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Original';
    effect.dataset.predictionValue = 'Original';
    const input = new MockElement('input', 'correction-input');
    input.value = '手動編集テスト';
    const scheduleCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      recordStatusChange: () => false,
      updateRecordEffectValue: (_recordIndex, _slotIndex, value) => {
        record.Effect1 = value;
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' }),
      validateMasterEffectValue: () => false
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1, '手動編集テスト');
    assert.equal(scheduleCalls.length, 1);
  });

  test('changeEffectCorrection keeps corrected status when value unchanged', () => {
    const record = { Effect1: 'Adjusted' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    item.appendChild(effect);
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Adjusted';
    effect.dataset.predictionValue = 'Adjusted';
    effect.dataset.status = 'corrected';
    effect.dataset.correction = '';
    const input = new MockElement('input', 'correction-input');
    input.value = 'Adjusted';
    const scheduleCalls = [];
    const statusCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        const changed = effect.dataset.status !== status;
        effect.dataset.status = status;
        return changed;
      },
      updateRecordEffectValue: () => false,
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1, 'Adjusted');
    assert.equal(effect.dataset.status, 'corrected');
    assert.deepEqual(statusCalls, ['corrected']);
    assert.equal(effect.dataset.correction, '');
    assert.equal(scheduleCalls.length, 0);
  });

  test('changeEffectCorrection returns to pending when manual entry cleared', () => {
    const record = { Effect1: 'Manual' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    item.appendChild(effect);
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Adjusted';
    effect.dataset.predictionValue = 'Manual';
    effect.dataset.status = 'corrected';
    effect.dataset.correction = 'manual';
    effect.dataset.preserveOriginalLevel = 'true';
    effect.dataset.levelOriginalValue = 'Base';
    const input = new MockElement('input', 'correction-input');
    input.value = '';
    const statusCalls = [];
    const effectUpdates = [];
    const levelValueCalls = [];
    const deps = buildBaseDeps(record, item, {
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        const changed = effect.dataset.status !== status;
        effect.dataset.status = status;
        return changed;
      },
      updateRecordEffectValue: (_recordIndex, _slotIndex, value) => {
        effectUpdates.push(value);
        record.Effect1 = value;
        return true;
      },
      updateRecordLevelValue: (_recordIndex, slotIndex, value) => {
        levelValueCalls.push([slotIndex, value]);
        record[`Effect${slotIndex}Level`] = value;
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1, 'Adjusted');
    assert.deepEqual(effectUpdates, ['Adjusted']);
    assert.deepEqual(statusCalls, ['pending']);
    assert.equal(effect.dataset.status, 'pending');
    assert.equal(effect.dataset.correction, '');
    assert.equal(effect.dataset.predictionValue, 'Adjusted');
    assert.equal(effect.dataset.preserveOriginalLevel, 'true');
    assert.equal(record.Effect1Level, 'none');
    assert.deepEqual(levelValueCalls, [
      [1, 'Base'],
      [1, 'none']
    ]);
  });

  test('changeEffectCorrection clears effect record back to original when input empty', () => {
    const record = { Effect1: 'New Effect' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Original';
    effect.dataset.predictionValue = 'New Effect';
    effect.dataset.preserveOriginalLevel = 'false';
    const input = new MockElement('input', 'correction-input');
    input.value = '';
    const updatedValues = [];
    const deps = buildBaseDeps(record, item, {
      recordStatusChange: () => false,
      updateRecordEffectValue: (_recordIndex, _slotIndex, value) => {
        updatedValues.push(value);
        if (value) {
          record.Effect1 = value;
        } else {
          delete record.Effect1;
        }
        return true;
      },
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1, 'Original');
    assert.equal(effect.dataset.predictionValue, 'Original');
    assert.equal(effect.dataset.pred, 'original');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Correction'), false);
    assert.deepEqual(updatedValues, ['Original']);
  });

  test('changeEffectCorrection sets none when master has no level candidates', () => {
    const record = { Effect1: 'Original', Effect1LevelOptions: 'Base|High' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'effect';
    effect.dataset.predictionOriginalValue = 'Original';
    effect.dataset.predictionValue = 'Original';
    effect.dataset.preserveOriginalLevel = 'true';
    const levelInput = new MockElement('select', 'level-input');
    effect.appendChild(levelInput);
    const input = new MockElement('input', 'correction-input');
    input.value = 'Manual';
    const storedLevels = [];
    const deps = buildBaseDeps(record, item, {
      recordStatusChange: () => false,
      updateRecordEffectValue: () => true,
      updateRecordLevelValue: (_recordIndex, slotIndex, value) => {
        storedLevels.push([slotIndex, value]);
        record[`Effect${slotIndex}Level`] = value;
        return true;
      },
      updateRecordLevelOptions: (_recordIndex, _slotIndex, value) => {
        record.Effect1LevelOptions = value;
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' }),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : []),
      applyMasterLevelOptions: (effectNode, selectNode, _name, helpers) => {
        if (helpers && typeof helpers.rebuildLevelSelectOptions === 'function') {
          helpers.rebuildLevelSelectOptions(effectNode, selectNode, []);
        }
        if (helpers && typeof helpers.onOptionsApplied === 'function') {
          helpers.onOptionsApplied(effectNode, []);
        }
      }
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Effect1LevelOptions, 'none');
    assert.deepEqual(storedLevels, [
      [1, 'none'],
      [1, 'none']
    ]);
    assert.equal(record.Effect1Level, 'none');
    assert.equal(effect.dataset.level, '');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Correction'), false);
  });

  test(
    'changeEffectCorrection should keep deep relic level when only effect text changes',
    { skip: true, todo: 'デメリット判定用のレベルが補正時にnoneへ初期化されてしまう' },
    () => {
      const record = {
        RelicType: '深層遺物',
        Effect1: 'Old Effect',
        Effect1Level: '＋4',
        Effect1LevelOptions: '＋3|＋4'
      };

      const item = new MockElement('div', 'item');
      const effect = new MockElement('section', 'effect');
      effect.dataset.recordIndex = '0';
      effect.dataset.slot = '1';
      effect.dataset.kind = 'effect';
      effect.dataset.predictionOriginalValue = 'Old Effect';
      effect.dataset.predictionValue = 'Old Effect';
      effect.dataset.levelOriginalValue = '＋4';
      effect.dataset.level = '＋4';

      const levelInput = new MockElement('select', 'level-input');
      levelInput.value = '＋4';
      effect.appendChild(levelInput);

      const input = new MockElement('input', 'correction-input');
      input.value = 'New Effect';
      effect.appendChild(input);

      const storedLevels = [];
      const deps = buildBaseDeps(record, item, {
        recordStatusChange: () => false,
        updateRecordEffectValue: (_recordIndex, slotIndex, value) => {
          record[`Effect${slotIndex}`] = value;
          return true;
        },
        updateRecordLevelValue: (_recordIndex, slotIndex, value) => {
          storedLevels.push([slotIndex, value]);
          record[`Effect${slotIndex}Level`] = value;
          return true;
        },
        updateRecordLevelOptions: (_recordIndex, slotIndex, value) => {
          record[`Effect${slotIndex}LevelOptions`] = value;
          return true;
        },
        getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' }),
        sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean) : []),
        sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : []),
        applyMasterLevelOptions: (effectNode, selectNode, _name, helpers) => {
          const candidates = ['＋3', '＋4'];
          if (helpers && typeof helpers.rebuildLevelSelectOptions === 'function') {
            helpers.rebuildLevelSelectOptions(effectNode, selectNode, candidates);
          }
          if (helpers && typeof helpers.setCorrectionLevelCandidates === 'function') {
            helpers.setCorrectionLevelCandidates(effectNode, candidates);
          }
        }
      });

      const handlers = handlerFactory.createRecordActionHandlers(deps);
      handlers.changeEffectCorrection(effect, input);

      assert.equal(record.Effect1Level, '＋4');
      assert.deepEqual(storedLevels.at(-1), [1, '＋4']);
      assert.equal(effect.dataset.level, '＋4');
    }
  );

  test('changeEffectCorrection updates demerit record when correction provided', () => {
    const record = { Demerit1: 'Penalty' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('section', 'effect effect--demerit');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.kind = 'demerit';
    effect.dataset.predictionOriginalValue = 'Penalty';
    effect.dataset.predictionValue = 'Penalty';
    const input = new MockElement('input', 'correction-input');
    input.value = 'Adjusted';
    const scheduleCalls = [];
    const updates = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      recordStatusChange: () => false,
      updateRecordEffectValue: (_recordIndex, _slotIndex, value) => {
        updates.push(value);
        if (value) {
          record.Demerit1 = value;
        } else {
          delete record.Demerit1;
        }
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'demerit' })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectCorrection(effect, input);

    assert.equal(record.Demerit1, 'Adjusted');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Demerit1Correction'), false);
    assert.equal(effect.dataset.predictionValue, 'Adjusted');
    assert.equal(effect.dataset.pred, 'adjusted');
    assert.equal(effect.dataset.correction, 'adjusted');
    assert.equal(scheduleCalls.length, 1);
    assert.deepEqual(updates, ['Adjusted']);
  });

  test('changeEffectLevel applies level correction and updates status', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'pending';
    effect.dataset.levelOriginalValue = 'Base';
    item.appendChild(effect);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'Expert';
    effect.appendChild(levelInput);

    const statusCalls = [];
    const effectStatusCalls = [];
    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const levelValueCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        effect.dataset.status = status;
        return true;
      },
      updateEffectStatus: (_effect, status) => effectStatusCalls.push(status),
      updateRecordLevelValue: (recordIndex, slotIndex, value) => {
        levelValueCalls.push([recordIndex, slotIndex, value]);
        record[`Effect${slotIndex}Level`] = value;
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 2, slotIndex: 1 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.deepEqual(statusCalls, ['corrected']);
    assert.deepEqual(effectStatusCalls, ['corrected']);
    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 0);
    assert.deepEqual(levelValueCalls, [[2, 1, 'Expert']]);
    assert.equal(record.Effect1Level, 'Expert');
    assert.equal(effect.dataset.levelCorrection, 'expert');
    assert.equal(effect.dataset.levelCorrectionValue, 'Expert');
    assert.equal(effect.dataset.level, 'expert');
    assert.equal(levelInput.value, 'Expert');
    assert.equal(effect.dataset.status, 'corrected');
  });

  test('changeEffectLevel stores selected level in record', () => {
    const record = { Effect1Level: 'Base' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'pending';
    effect.dataset.levelOriginalValue = 'Base';
    item.appendChild(effect);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'Expert';
    effect.appendChild(levelInput);

    const storedLevels = [];
    const scheduleCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      updateRecordLevelValue: (recordIndex, slotIndex, value) => {
        storedLevels.push([recordIndex, slotIndex, value]);
        record[`Effect${slotIndex}Level`] = value;
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 5, slotIndex: 1 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.deepEqual(storedLevels, [[5, 1, 'Expert']]);
    assert.equal(record.Effect1Level, 'Expert');
    assert.equal(scheduleCalls.length, 1);
    assert.equal(effect.dataset.level, 'expert');
  });

  test('changeEffectLevel restores record level when selection cleared', () => {
    const record = { Effect3Level: 'Expert' };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'corrected';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelCorrectionValue = 'Expert';
    effect.dataset.level = 'expert';
    item.appendChild(effect);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = '';
    effect.appendChild(levelInput);

    const storedLevels = [];
    const deps = buildBaseDeps(record, item, {
      updateRecordLevelValue: (recordIndex, slotIndex, value) => {
        storedLevels.push([recordIndex, slotIndex, value]);
        if (value) {
          record[`Effect${slotIndex}Level`] = value;
        } else {
          delete record[`Effect${slotIndex}Level`];
        }
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 3 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.deepEqual(storedLevels, [[0, 3, 'Base']]);
    assert.equal(record.Effect3Level, 'Base');
    assert.equal(effect.dataset.level, 'base');
  });

  test('changeEffectLevel clears level while preserving status when correction exists', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'corrected';
    effect.dataset.correction = 'manual-fix';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelCorrectionValue = 'Expert';
    effect.dataset.level = 'expert';
    item.appendChild(effect);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = '';
    effect.appendChild(levelInput);

    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const statusCalls = [];
    const levelValueCalls = [];

    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        return true;
      },
      updateRecordLevelValue: (recordIndex, slotIndex, value) => {
        levelValueCalls.push([recordIndex, slotIndex, value]);
        if (value) {
          record[`Effect${slotIndex}Level`] = value;
        } else {
          delete record[`Effect${slotIndex}Level`];
        }
        return true;
      },
      getEffectIndexes: () => ({ recordIndex: 1, slotIndex: 3 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 1);
    assert.deepEqual(levelValueCalls, [[1, 3, 'Base']]);
    assert.equal(record.Effect3Level, 'Base');
    assert.equal(effect.dataset.levelCorrection, '');
    assert.equal(effect.dataset.levelCorrectionValue, '');
    assert.equal(effect.dataset.level, 'base');
    assert.deepEqual(statusCalls, []);
  });

  test('changeEffectLevel triggers linked demerit availability sync', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'pending';
    effect.dataset.levelOriginalValue = 'Base';
    item.appendChild(effect);

    const demerit = new MockElement('div', 'effect effect--demerit');
    demerit.dataset.kind = 'demerit';
    demerit.dataset.slot = '1';
    item.appendChild(demerit);

    const originalQuerySelector = item.querySelector.bind(item);
    item.querySelector = (selector) => {
      if (selector === '.effect[data-kind="demerit"][data-slot="1"]') {
        return demerit;
      }
      return originalQuerySelector(selector);
    };

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'Expert';
    effect.appendChild(levelInput);

    const syncCalls = [];
    const deps = buildBaseDeps(record, item, {
      refreshItemCaches: () => {},
      applyFilters: () => {},
      recordStatusChange: () => false,
      updateEffectStatus: () => {},
      syncDemeritAvailability: (target, options) => syncCalls.push([target, options]),
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 1, kind: 'effect' })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.equal(syncCalls.length, 1);
    assert.strictEqual(syncCalls[0][0], demerit);
    assert.deepEqual(syncCalls[0][1], { refreshStatus: true });
  });

  test('changeEffectLevel should disable linked demerit when level loses rule match', () => {
    global.document = createMockDocument();
    try {
      runScript('templates/gallery/render/effectViewModel.js');
      runScript('templates/gallery/render/effectFactory.js');

      const renderFactory = global.window.galleryRenderFactory;
      const record = {
        RelicType: '深層遺物',
        Effect1: 'Test Effect',
        Effect1Level: '＋3',
        Effect1LevelOptions: '＋1|＋3|＋4',
        Effect1Status: 'pending',
        Demerit1: 'Heavy Burden',
        Demerit1RawText: 'Heavy Burden',
        Demerit1Score: 35,
        Demerit1Status: 'corrected'
      };
      const state = {
        showOcr: true,
        masterOptions: [],
        masterDemeritOptions: ['Heavy Burden'],
        masterDemeritRules: {
          'test effect': { hasDemerit: true, levels: ['＋3', '＋4'] }
        },
        labelSymbols: ['Ⅰ'],
        records: [record]
      };
      const effectFactory = renderFactory.createEffectFactory({
        state,
        datasetState: { kind: 'normal', relicType: 'deep' },
        masterDatalistId: 'master-id',
        demeritDatalistId: 'master-demerit-id',
        createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
        sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean) : []),
        sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
        applyMasterLevelOptions: () => {},
        normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
        statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
      });

      const item = new MockElement('div', 'item');
      const effect = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
      const demerit = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0, { kind: 'demerit' });
      item.appendChild(effect);
      item.appendChild(demerit);

      const levelInput = effect.querySelector('.level-input');
      const demeritInput = demerit.querySelector('.correction-input');
      const passButton = demerit.querySelector('.review-button.pass');

      assert.ok(levelInput, 'level input should exist');
      assert.ok(demeritInput, 'demerit input should exist');
      assert.ok(passButton, 'pass button should exist');
      assert.equal(demeritInput.disabled, false);
      assert.equal(demeritInput.readOnly, false);
      assert.equal(demeritInput.tabIndex, 0);
      assert.equal(passButton.disabled, false);

      levelInput.value = '＋1';

      const levelValueCalls = [];
      const deps = buildBaseDeps(record, item, {
        updateRecordLevelValue: (_recordIndex, slotIndex, value) => {
          levelValueCalls.push([slotIndex, value]);
          if (value) {
            record[`Effect${slotIndex}Level`] = value;
          } else {
            delete record[`Effect${slotIndex}Level`];
          }
          return true;
        },
        refreshItemCaches: () => {},
        applyFilters: () => {},
        recordStatusChange: () => false,
        updateEffectStatus: () => {},
        syncDemeritAvailability: effectFactory.syncDemeritAvailability,
        getEffectIndexes: (target) => {
          if (!target) {
            return null;
          }
          const recordIndex = Number(target.dataset.recordIndex || 0);
          const slotIndex = Number(target.dataset.slot || 0);
          const kind = target.dataset.kind === 'demerit' ? 'demerit' : 'effect';
          return { recordIndex, slotIndex, kind };
        },
        updateInputValueAttribute: effectFactory.updateInputValueAttribute,
        updateLevelInputAvailability: effectFactory.updateLevelInputAvailability,
        sanitizeLevelList: (values) => (Array.isArray(values) ? values : []),
        sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : [])
      });

      const handlers = handlerFactory.createRecordActionHandlers(deps);
      handlers.changeEffectLevel(effect, levelInput);

      assert.deepEqual(levelValueCalls, [[1, '＋1']]);
      assert.equal(record.Effect1Level, '＋1');
      assert.ok(!('Effect1LevelCorrection' in record));
      assert.ok(!('Demerit1Correction' in record));
      assert.equal(record.Demerit1Status, 'pending');
      assert.equal(demeritInput.disabled, true);
      assert.equal(demeritInput.readOnly, true);
      assert.equal(demeritInput.tabIndex, -1);
      assert.equal(passButton.disabled, true);
      assert.equal(demeritInput.placeholder, '指定レベルのデメリットなし');
    } finally {
      delete global.document;
    }
  });

  test('toggleReviewStatus clears correction and level data when marking as pass', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.status = 'pending';
    effect.dataset.correction = 'manual';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelCorrectionValue = 'Expert';
    effect.dataset.levelCorrection = 'expert';
    effect.dataset.level = 'expert';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['Base', 'Expert']);
    effect.dataset.predictionOriginalValue = 'Prediction';
    effect.dataset.predictionValue = 'Manual';
    item.appendChild(effect);

    const correctionInput = new MockElement('input', 'correction-input');
    correctionInput.value = 'manual';
    effect.appendChild(correctionInput);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'Expert';
    effect.appendChild(levelInput);

    const button = new MockElement('button');
    button.dataset.value = 'pass';

    const rebuildCalls = [];
    const candidateCalls = [];
    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const statusCalls = [];
    const effectStatusCalls = [];
    const createCorrectionCalls = [];
    const levelValueCalls = [];

    const replacementInput = new MockElement('input', 'correction-input');

    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      updateRecordLevelValue: (recordIndex, slotIndex, value) => {
        levelValueCalls.push([recordIndex, slotIndex, value]);
        if (value) {
          record[`Effect${slotIndex}Level`] = value;
        } else {
          delete record[`Effect${slotIndex}Level`];
        }
        return true;
      },
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        return false;
      },
      updateEffectStatus: (_effect, status) => {
        effectStatusCalls.push(status);
        effect.dataset.status = status;
      },
      rebuildLevelSelectOptions: (_effect, selectEl) => rebuildCalls.push(selectEl),
      setCorrectionLevelCandidates: (_effect, candidates) => candidateCalls.push(candidates),
      createCorrectionInput: (context, value, predictionDefault) => {
        createCorrectionCalls.push([context && context.isDemerit, value, predictionDefault]);
        return replacementInput;
      },
      getEffectIndexes: () => ({ recordIndex: 4, slotIndex: 2 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleReviewStatus(effect, button);

    assert.deepEqual(effectStatusCalls, ['pass']);
    assert.deepEqual(statusCalls, ['pass']);
    assert.deepEqual(levelValueCalls, [[4, 2, 'Base']]);
    assert.equal(effect.dataset.correction, '');
    assert.equal(effect.dataset.levelCorrection, '');
    assert.equal(effect.dataset.levelCorrectionValue, '');
    assert.equal(effect.dataset.preserveOriginalLevel, 'true');
    assert.equal(effect.dataset.level, 'base');
    assert.equal(record.Effect2Level, 'Base');
    assert.equal(levelInput.value, '');
    assert.deepEqual(candidateCalls, [[]]);
    assert.deepEqual(rebuildCalls, [levelInput]);
    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 1);
    assert.deepEqual(createCorrectionCalls, [[false, '', 'Prediction']]);
    assert.strictEqual(effect.querySelector('.correction-input'), replacementInput);
    assert.strictEqual(correctionInput.parentNode, null);
    assert.equal(effect.dataset.levelOptionsBaseJson, JSON.stringify(['Base', 'Expert']));
  });
});

describe('gallery events', () => {
  let galleryEvents;
  let dom;
  let duplicates;
  let state;
  let datasetState;

  beforeEach(() => {
    global.window = {};
    global.document = createMockDocument();
    state = { records: [] };
    datasetState = { kind: 'normal' };
    duplicates = {
      setCalls: [],
      set(name, value) {
        this.setCalls.push([name, value]);
        return true;
      },
      prepare: () => {}
    };
    dom = {
      datasetSelect: null,
      gallery: new MockElement('div', 'gallery'),
      searchInput: null,
      filterSelect: null,
      colorFilter: null,
      showDuplicatesToggle: null,
      showOcrToggle: null,
      downloadCsvButton: null,
      uploadCsvButton: null,
      uploadCsvInput: null,
      lightboxClose: null,
      lightbox: new MockElement('div', 'lightbox'),
      lightboxImg: new MockElement('img', 'lightbox-img')
    };
    dom.lightboxImg.src = '';
    runScript('templates/gallery/events/recordActionHandlers.js');
    runScript('templates/gallery/events/galleryEvents.js');
    galleryEvents = global.window.galleryEventsFactory.createGalleryEvents({
      dom,
      state,
      datasetState,
      duplicates,
      showStatus: () => {},
      clearStatus: () => {},
      setStorageStatus: () => {},
      parseCsvRecords: () => [],
      loadRecordsArray: () => {},
      generateCsv: () => '',
      csvFileName: () => 'out.csv',
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      updateEffectStatus: (effect, status) => {
        effect.dataset.status = status;
      },
      setCorrectionLevelCandidates: (effect, candidates) => {
        effect.dataset.candidates = JSON.stringify(candidates);
        return candidates;
      },
      rebuildLevelSelectOptions: () => {},
      createCorrectionInput: (context, value) => {
        const input = new MockElement('input', 'correction-input');
        input.value = value || '';
        input.dataset.kind = context && context.isDemerit ? 'demerit' : 'effect';
        return input;
      },
      getEffectIndexes: (effect) => ({
        recordIndex: Number(effect.dataset.recordIndex),
        slotIndex: Number(effect.dataset.slot)
      }),
      updateInputValueAttribute: () => {},
      updateLevelInputAvailability: () => {},
      applyMasterLevelOptions: (effect, select, _name, helpers) => {
        if (helpers && typeof helpers.onOptionsApplied === 'function') {
          helpers.onOptionsApplied(effect, []);
        }
        if (helpers && typeof helpers.rebuildLevelSelectOptions === 'function') {
          helpers.rebuildLevelSelectOptions(effect, select, []);
        }
      }
    });
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  test('bindImage registers click handler that toggles lightbox', () => {
    const img = new MockElement('img');
    img.dataset.full = 'full.png';
    galleryEvents.bindImage(img);
    assert.equal(Array.isArray(img.eventListeners.click), true);
    assert.equal(img.eventListeners.click.length > 0, true);
    img.eventListeners.click[0]({});
    assert.equal(dom.lightbox.classList.contains('show'), true);
    assert.equal(dom.lightboxImg.src, 'full.png');
  });

  test('duplicate toggle triggers record update and save scheduling', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    item.appendChild(effect);
    const duplicateButton = new MockElement('button', 'duplicate-toggle');
    duplicateButton.dataset.image = 'image.png';
    effect.appendChild(duplicateButton);

    const buildGalleryCalls = [];
    const updateDuplicateVisualsCalls = [];
    const scheduleSaveCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => buildGalleryCalls.push(null),
      applyFilters: () => {},
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: (target, state) => updateDuplicateVisualsCalls.push([target, state]),
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => Boolean(record.Duplicate),
      isRecordFavorite: () => false,
      setRecordDuplicate: (index, next) => {
        record.Duplicate = next ? 'true' : '';
        return true;
      },
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      setRecordItemRelicType: () => false,
      applyMasterDataForRelicType: () => {},
      recordStatusChange: () => false,
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const clickHandlers = dom.gallery.eventListeners.click || [];
    assert.equal(clickHandlers.length > 0, true);
    const event = {
      target: duplicateButton,
      preventDefault: () => {
        event.prevented = true;
      }
    };
    clickHandlers[0](event);
    assert.equal(event.prevented, true);
    assert.equal(record.Duplicate, 'true');
    assert.deepEqual(updateDuplicateVisualsCalls, [[item, true]]);
    assert.equal(buildGalleryCalls.length, 1);
    assert.equal(scheduleSaveCalls.length, 1);
    assert.deepEqual(duplicates.setCalls, [['image.png', true]]);
  });

  test('item color select change updates record without preventing default behaviour', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    item.dataset.recordIndex = '0';
    const controls = new MockElement('div', 'item-controls');
    const select = new MockElement('select', 'item-color-select');
    select.dataset.recordIndex = '0';
    controls.appendChild(select);
    item.appendChild(controls);
    dom.gallery.appendChild(item);

    const scheduleSaveCalls = [];
    const filterCalls = [];
    const applyItemColorCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => filterCalls.push(null),
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: (target, color) => {
        applyItemColorCalls.push([target, color]);
        select.value = color || '';
      },
      normalizeItemColor: (value) => value || '',
      applyItemRelicType: () => {},
      normalizeItemRelicType: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: (_index, nextColor) => {
        record.ItemColor = nextColor;
        return true;
      },
      setRecordItemRelicType: () => false,
      applyMasterDataForRelicType: () => {},
      recordStatusChange: () => false,
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const clickHandlers = dom.gallery.eventListeners.click || [];
    assert.equal(clickHandlers.length > 0, true);
    const clickEvent = {
      target: select,
      preventDefault: () => {
        clickEvent.prevented = true;
      }
    };
    clickHandlers[0](clickEvent);
    assert.equal(clickEvent.prevented, undefined);
    assert.equal(scheduleSaveCalls.length, 0);
    assert.equal(applyItemColorCalls.length, 0);
    assert.equal(record.ItemColor, undefined);

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.equal(changeHandlers.length > 0, true);
    const previousValue = select.value;
    select.value = 'red';
    const changeEvent = {
      target: select,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };
    changeHandlers[0](changeEvent);
    if (changeEvent.prevented) {
      select.value = previousValue;
    }

    assert.equal(changeEvent.prevented, false);
    assert.equal(record.ItemColor, 'red');
    assert.equal(scheduleSaveCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.deepEqual(applyItemColorCalls, [[item, 'red']]);
    assert.equal(select.value, 'red');
  });

  test('item relic type select change updates record without preventing default behaviour', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    item.dataset.recordIndex = '0';
    const controls = new MockElement('div', 'item-controls');
    const select = new MockElement('select', 'item-relic-type-select');
    select.dataset.recordIndex = '0';
    controls.appendChild(select);
    item.appendChild(controls);
    dom.gallery.appendChild(item);

    const scheduleSaveCalls = [];
    const filterCalls = [];
    const applyRelicTypeCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => filterCalls.push(null),
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      applyItemRelicType: (target, value) => {
        applyRelicTypeCalls.push([target, value]);
        select.value = value || '';
      },
      normalizeItemRelicType: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      setRecordItemRelicType: (_index, value) => {
        record.RelicType = value;
        return true;
      },
      applyMasterDataForRelicType: () => {},
      recordStatusChange: () => false,
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const clickHandlers = dom.gallery.eventListeners.click || [];
    assert.equal(clickHandlers.length > 0, true);
    const clickEvent = {
      target: select,
      preventDefault: () => {
        clickEvent.prevented = true;
      }
    };
    clickHandlers[0](clickEvent);
    assert.equal(clickEvent.prevented, undefined);
    assert.equal(scheduleSaveCalls.length, 0);
    assert.equal(applyRelicTypeCalls.length, 0);
    assert.equal(record.RelicType, undefined);

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.equal(changeHandlers.length > 0, true);
    const previousValue = select.value;
    select.value = 'deep';
    const changeEvent = {
      target: select,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };
    changeHandlers[0](changeEvent);
    if (changeEvent.prevented) {
      select.value = previousValue;
    }

    assert.equal(changeEvent.prevented, false);
    assert.equal(record.RelicType, 'deep');
    assert.equal(scheduleSaveCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.deepEqual(applyRelicTypeCalls, [[item, 'deep']]);
    assert.equal(select.value, 'deep');
  });

  test('tag input focus handlers keep temporary whitespace and resync on blur', () => {
    const record = { Tags: 'alpha beta' };
    const item = new MockElement('div', 'item');
    item.dataset.recordIndex = '0';
    item.dataset.tags = 'alpha beta';
    const tagsInput = new MockElement('input', 'item-tags-input');
    tagsInput.value = 'alpha ';
    item.appendChild(tagsInput);
    dom.gallery.appendChild(item);

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => {},
      setRelicTypeFilter: () => {},
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      applyItemRelicType: () => {},
      normalizeItemRelicType: (value) => value || '',
      applyItemTags: () => {},
      normalizeItemTags: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      setRecordItemRelicType: () => false,
      setRecordTags: () => false,
      applyMasterDataForRelicType: () => {},
      recordStatusChange: () => false,
      updateRecordEffectValue: () => false,
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      scheduleSave: () => {}
    });

    const focusInHandlers = dom.gallery.eventListeners.focusin || [];
    assert.equal(focusInHandlers.length > 0, true);
    focusInHandlers[0]({ target: tagsInput });
    assert.equal(tagsInput.dataset.editingTags, 'true');

    const focusOutHandlers = dom.gallery.eventListeners.focusout || [];
    assert.equal(focusOutHandlers.length > 0, true);
    focusOutHandlers[0]({ target: tagsInput });
    assert.equal(tagsInput.dataset.editingTags, undefined);
    assert.equal(tagsInput.value, 'alpha beta');
  });

  test('correction input change updates record state', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['Base', 'Alt']);
    effect.dataset.predictionValue = 'Skill';
    item.appendChild(effect);
    const correctionInput = new MockElement('input', 'correction-input');
    correctionInput.value = 'NewValue';
    effect.appendChild(correctionInput);
    const levelInput = new MockElement('select', 'level-input');
    effect.appendChild(levelInput);

    const recordStatusCalls = [];
    const scheduleSaveCalls = [];
    const refreshCalls = [];
    const applyFilterCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => applyFilterCalls.push(null),
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      refreshItemCaches: () => refreshCalls.push(null),
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      recordStatusChange: (effectEl, status) => {
        recordStatusCalls.push(status);
        return false;
      },
      updateRecordEffectValue: (idx, slot, value) => {
        record[`Effect${slot}`] = value;
        return true;
      },
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.equal(changeHandlers.length > 0, true);
    changeHandlers[0]({ target: correctionInput });
    assert.deepEqual(recordStatusCalls, ['corrected']);
    assert.equal(scheduleSaveCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
    assert.equal(applyFilterCalls.length, 1);
    assert.equal(record.Effect1, 'NewValue');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Correction'), false);
    assert.equal(effect.dataset.correction, 'newvalue');

  });

  test('correction change clears legacy level data when suppressed', () => {
    const record = {
      Effect1: 'Initial',
      Effect1Level: 'Base',
      Effect1LevelOptions: 'Base|Alt'
    };
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['Base', 'Alt']);
    effect.dataset.predictionValue = 'Initial';
    item.appendChild(effect);

    const correctionInput = new MockElement('input', 'correction-input');
    correctionInput.value = 'Replacement';
    effect.appendChild(correctionInput);

    const levelInput = new MockElement('select', 'level-input');
    effect.appendChild(levelInput);

    const levelValueCalls = [];
    const levelOptionsCalls = [];
    const scheduleSaveCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => {},
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      recordStatusChange: () => false,
      updateRecordEffectValue: (idx, slot, value) => {
        record[`Effect${slot}`] = value;
        return true;
      },
      updateRecordLevelValue: (idx, slot, value) => {
        levelValueCalls.push(value);
        const key = `Effect${slot}Level`;
        if (value) {
          record[key] = value;
        } else {
          delete record[key];
        }
        return true;
      },
      updateRecordLevelOptions: (idx, slot, value) => {
        levelOptionsCalls.push(value);
        const key = `Effect${slot}LevelOptions`;
        if (value) {
          record[key] = value;
        } else {
          delete record[key];
        }
        return true;
      },
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.ok(changeHandlers.length > 0, 'change handler should exist for correction input');
    changeHandlers[0]({ target: correctionInput });

    assert.deepEqual(levelValueCalls, ['none', 'none']);
    assert.deepEqual(levelOptionsCalls, ['none']);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Level'), true);
    assert.equal(record.Effect1Level, 'none');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1LevelOptions'), true);
    assert.equal(record.Effect1LevelOptions, 'none');
    assert.equal(scheduleSaveCalls.length >= 1, true);
  });

  test('favorite toggle updates record and triggers save', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const favoriteButton = new MockElement('button', 'favorite-toggle');
    item.appendChild(favoriteButton);
    dom.gallery.appendChild(item);

    const updateFavoriteVisualsCalls = [];
    const applyFilterCalls = [];
    const scheduleSaveCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => applyFilterCalls.push(null),
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: (target, state) => updateFavoriteVisualsCalls.push([target, state]),
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => Boolean(record.Favorite),
      setRecordDuplicate: () => false,
      setRecordFavorite: (index, next) => {
        record.Favorite = next ? 'true' : '';
        return true;
      },
      setRecordItemColor: () => false,
      recordStatusChange: () => false,
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const clickHandlers = dom.gallery.eventListeners.click || [];
    assert.ok(clickHandlers.length > 0, 'click handler should be registered');
    const event = {
      target: favoriteButton,
      preventDefault: () => {
        event.prevented = true;
      }
    };
    clickHandlers[0](event);
    assert.equal(event.prevented, true);
    assert.equal(record.Favorite, 'true');
    assert.deepEqual(updateFavoriteVisualsCalls, [[item, true]]);
    assert.equal(scheduleSaveCalls.length, 1);
    assert.equal(applyFilterCalls.length, 1);
  });

  test('level change updates record correction and status', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.status = 'pending';
    effect.dataset.correction = '';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelOptionsDisplay = 'Base|Alt';
    item.appendChild(effect);
    dom.gallery.appendChild(item);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'High';
    effect.appendChild(levelInput);

    const statusChanges = [];
    const levelValueCalls = [];
    const scheduleSaveCalls = [];
    const refreshCalls = [];
    const applyFilterCalls = [];

    galleryEvents.attachEventHandlers({
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => applyFilterCalls.push(null),
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: (value) => value || '',
      refreshItemCaches: () => refreshCalls.push(null),
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      recordStatusChange: (effectElement, status) => {
        statusChanges.push(status);
        effectElement.dataset.status = status;
        return true;
      },
      updateRecordLevelValue: (index, slot, value) => {
        levelValueCalls.push([index, slot, value]);
        record[`Effect${slot}Level`] = value;
        return true;
      },
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.ok(changeHandlers.length > 0, 'change handler should be registered');
    changeHandlers[0]({ target: levelInput });

    assert.deepEqual(levelValueCalls, [[0, 1, 'High']]);
    assert.equal(record.Effect1Level, 'High');
    assert.deepEqual(statusChanges, ['corrected']);
    assert.equal(effect.dataset.status, 'corrected');
    assert.equal(effect.dataset.levelCorrectionValue, 'High');
    assert.equal(effect.dataset.levelCorrection, 'high');
    assert.equal(effect.dataset.level, 'high');
    assert.equal(scheduleSaveCalls.length, 0);
    assert.equal(refreshCalls.length, 1);
    assert.equal(applyFilterCalls.length, 1);
  });

  test('attachEventHandlers only binds listeners once', () => {
    const record = {};
    state.records = [record];
    const item = new MockElement('div', 'item');
    item.dataset.recordIndex = '0';
    const effect = new MockElement('div', 'effect pending');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.status = 'pending';
    const passButton = new MockElement('button', 'review-button pass');
    passButton.dataset.value = 'pass';
    effect.appendChild(passButton);
    item.appendChild(effect);
    dom.gallery.appendChild(item);

    const statusCalls = [];
    const recordStatusCalls = [];
    const handlers = {
      switchDataset: () => {},
      buildGallery: () => {},
      applyFilters: () => {},
      setOcrVisibility: () => {},
      getOcrToggleState: () => false,
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      applyItemColor: () => {},
      normalizeItemColor: () => '',
      refreshItemCaches: () => {},
      getRecordByIndex: () => record,
      isRecordDuplicate: () => false,
      isRecordFavorite: () => false,
      setRecordDuplicate: () => false,
      setRecordFavorite: () => false,
      setRecordItemColor: () => false,
      recordStatusChange: (_effect, status) => {
        recordStatusCalls.push(status);
        record[`Effect1Status`] = status;
        return true;
      },
      scheduleSave: () => statusCalls.push('save')
    };

    galleryEvents.attachEventHandlers(handlers);
    assert.equal(dom.gallery.dataset.eventsBound, 'true');

    galleryEvents.attachEventHandlers(handlers);

    const clickHandlers = dom.gallery.eventListeners.click || [];
    assert.equal(clickHandlers.length, 1);

    clickHandlers[0]({ target: passButton, preventDefault: () => {} });
    assert.equal(effect.dataset.status, 'pass');
    assert.deepEqual(recordStatusCalls, ['pass']);
  });
});
