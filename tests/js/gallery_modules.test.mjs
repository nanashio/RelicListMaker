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
    this._classes = new Set(
      typeof className === 'string' && className.trim() ? className.trim().split(/\s+/) : []
    );
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
    if (selector.startsWith('.')) {
      return this._classes.has(selector.slice(1));
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    return this.tagName === selector.toUpperCase();
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

  test('normalizeSuppressedLevels clears legacy level values', () => {
    const records = [
      {
        Image: 'sample.png',
        Effect1Level: 'Base',
        Effect1LevelOptions: 'Base|High',
        Effect1LevelCorrection: '',
        Effect1LevelSuppressed: 'TRUE'
      },
      {
        Image: 'keep.png',
        Effect2Level: 'Remain',
        Effect2LevelSuppressed: 'false'
      }
    ];

    const normalized = dataUtils.normalizeSuppressedLevels(records);
    assert.equal(Array.isArray(normalized), true);
    assert.equal(normalized[0].Effect1LevelSuppressed, 'true');
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'Effect1Level'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'Effect1LevelOptions'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'Effect1LevelCorrection'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized[1], 'Effect2LevelSuppressed'), false);
    assert.equal(normalized[1].Effect2Level, 'Remain');
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
      'alpha.csv',
      { csv: 'beta.csv', imgDir: ' images ', label: ' Beta ', folder: ' sub ' },
      { kind: 'merged', sources: [{ csv: 'child.csv', imgDir: 'child', label: ' Child ' }] },
      null,
      { csv: '' }
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
    global.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, async text() { return ''; } };
    };

    const manager = utils.createOpfsManager({
      getRecords: () => [{ Name: 'A' }],
      getDatasetState: () => ({ kind: 'normal', label: 'Alpha' }),
      getCsvPath: () => 'alpha.csv',
      resolveCsvSavePath: (value) => value,
      setStorageStatus: (message) => messages.push(message)
    });

    await manager.flushNow();
    assert.ok(messages.some((message) => message.startsWith('保存しました')));
    assert.equal(fetchCalls, 1);

    const blocked = utils.createOpfsManager({
      getRecords: () => [{ Name: 'A' }],
      getDatasetState: () => ({ kind: 'merged', label: 'Merged' }),
      getCsvPath: () => 'merged.csv',
      resolveCsvSavePath: (value) => value,
      setStorageStatus: (message) => messages.push(message)
    });
    await blocked.flushNow();
    assert.equal(fetchCalls, 1, 'should not call fetch for merged dataset');
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

  test('createEffectContext normalizes fields and derives status', () => {
    const record = {
      Effect1: 'Power Boost',
      RawText1: 'Raw Effect',
      Effect1Score: '72.4',
      Effect1Level: 'L1',
      Effect1LevelOptions: 'L1| L2 |',
      Effect1LevelCorrection: '',
      Effect1LevelSuppressed: 'true',
      Effect1Correction: 'Fix',
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
    assert.equal(context.statusValue, 'corrected');
    assert.equal(context.displayLevel, '');
    assert.equal(context.correctionValue, 'Fix');
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
      state: { showOcr: true, masterOptions: [], labelSymbols: ['Ⅰ'] },
      datasetState: { kind: 'normal' },
      masterDatalistId: 'master-id',
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
      Effect1LevelCorrection: '',
      Effect1LevelSuppressed: '',
      Effect1Correction: '',
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
      Effect1Level: 'L1',
      Effect1LevelOptions: 'L1|L2|L3',
      Effect1LevelCorrection: 'L3',
      Effect1LevelSuppressed: '',
      Effect1Correction: '',
      Effect1Status: 'pending',
      BaseImage: 'base.png'
    };
    const effect = effectFactory.createEffect(record, 1, 'Ⅰ', 'image.png', 0);
    assert.ok(effect, 'effect should be created with level correction');
    assert.ok(applyCalls.length === 1, 'applyMasterLevelOptions should be invoked');
    const [, , effectName] = applyCalls[0];
    assert.equal(effectName, '炎攻撃力上昇');
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

  test('createCorrectionInput toggles availability based on master options', () => {
    const disabledInput = effectFactory.createCorrectionInput('', 'Fallback');
    assert.equal(disabledInput.disabled, true);
    assert.equal(disabledInput.placeholder, 'マスターデータ未設定');

    const customFactory = global.window.galleryRenderFactory.createEffectFactory({
      state: { showOcr: true, masterOptions: ['Alpha'], labelSymbols: ['Ⅰ'] },
      datasetState: { kind: 'normal' },
      masterDatalistId: 'master-id',
      createElement: (tagName, className = '', text = '') => new MockElement(tagName, className, text),
      sanitizeLevelList: (values) => (Array.isArray(values) ? values.filter(Boolean).map((value) => String(value).trim()) : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values].sort() : []),
      applyMasterLevelOptions: () => {},
      normalizeStatus: (value) => (value === 'pass' ? 'pass' : value === 'corrected' ? 'corrected' : 'pending'),
      statusLabel: (status) => ({ pass: '確認済み', corrected: '修正済み', pending: '未レビュー' }[status] || status)
    });
    const enabledInput = customFactory.createCorrectionInput('Chosen', 'Fallback');
    assert.equal(enabledInput.disabled, false);
    assert.equal(enabledInput.placeholder, 'master_relicsから選択');
    assert.equal(enabledInput.attributes.list, 'master-id');
    assert.equal(enabledInput.value, 'Chosen');
  });

  test('updateLevelBadge prioritizes correction and available options', () => {
    const effect = new MockElement('div', 'effect');
    const predictionLine = new MockElement('div', 'prediction');
    effect.appendChild(predictionLine);
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.preserveOriginalLevel = 'true';
    effect.dataset.levelOptionsDisplay = 'Base|Alt';
    effect.dataset.levelCorrectionValue = '';
    effectFactory.updateLevelBadge(effect);
    let badge = predictionLine.querySelector('.level-badge');
    assert.ok(badge, 'badge should exist after initial render');
    assert.equal(badge.textContent, 'Base');
    assert.equal(badge.className.includes('level-badge--corrected'), false);

    effect.dataset.levelCorrectionValue = 'Custom';
    effectFactory.updateLevelBadge(effect);
    badge = predictionLine.querySelector('.level-badge');
    assert.equal(badge.textContent, 'Custom');
    assert.ok(badge.className.includes('level-badge--corrected'));

    effect.dataset.levelCorrectionValue = '';
    effect.dataset.preserveOriginalLevel = 'false';
    effect.dataset.levelOptionsDisplay = 'Alt|Beta';
    effectFactory.updateLevelBadge(effect);
    badge = predictionLine.querySelector('.level-badge');
    assert.equal(badge.textContent, 'Alt');
    assert.ok(badge.className.includes('level-badge--missing'));
    assert.equal(badge.title, '候補: Alt / Beta');
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
      createEffect: (record, slot, symbol, imageName, recordIndex) => {
        effectCalls.push({ record, slot, symbol, imageName, recordIndex });
        const element = new MockElement('section', `effect slot-${slot}`);
        element.dataset.slot = String(slot);
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
    assert.equal(effectCalls.length, 2, 'effects should be requested for each symbol');
    assert.deepEqual(
      effectCalls.map((entry) => ({ symbol: entry.symbol, slot: entry.slot, imageName: entry.imageName })),
      [
        { symbol: 'Ⅰ', slot: 1, imageName: 'alpha.png' },
        { symbol: 'Ⅱ', slot: 2, imageName: 'alpha.png' }
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
    const metaInfo = controls.children[3];
    const datasetBadge = metaInfo.querySelector('.dataset-label');
    assert.ok(datasetBadge, 'dataset badge should exist for merged dataset');
    assert.equal(datasetBadge.textContent, 'Merged A');
    assert.equal(datasetBadge.attributes.title, 'Merged A (runs/a)');

    const rightColumn = item.children[1];
    assert.equal(rightColumn.children.length, 2, 'two effects should be appended');
    assert.ok(rightColumn.children.every((child) => child.tagName === 'SECTION'));
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
      updateFavoriteVisuals: () => {},
      updateDuplicateVisuals: () => {},
      refreshItemCaches: () => {},
      getItemContext: () => ({ item, record, recordIndex: 0 }),
      normalizeItemColor: (value) => (value ? value.toLowerCase() : ''),
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
      recordStatusChange: () => false,
      updateRecordCorrection: () => false,
      updateRecordLevelCorrection: () => false,
      updateRecordLevelValue: () => false,
      updateRecordLevelOptions: () => false,
      updateRecordLevelSuppressed: () => false,
      updateEffectStatus: () => {},
      sanitizeLevelList: (values) => (Array.isArray(values) ? values : []),
      sortLevelsAscending: (values) => (Array.isArray(values) ? [...values] : []),
      createCorrectionInput: () => new MockElement('input'),
      setCorrectionLevelCandidates: () => {},
      rebuildLevelSelectOptions: () => {},
      updateLevelBadge: () => {},
      getEffectIndexes: () => ({ recordIndex: 0, slotIndex: 0 }),
      updateInputValueAttribute: () => {},
      updateLevelInputAvailability: () => {},
      applyMasterLevelOptions: () => {},
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

    const levelCorrectionCalls = [];
    const statusCalls = [];
    const effectStatusCalls = [];
    const badgeCalls = [];
    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      updateRecordLevelCorrection: (recordIndex, slotIndex, value) => {
        levelCorrectionCalls.push([recordIndex, slotIndex, value]);
        return true;
      },
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        effect.dataset.status = status;
        return true;
      },
      updateEffectStatus: (_effect, status) => effectStatusCalls.push(status),
      updateLevelBadge: (target) => badgeCalls.push(target),
      getEffectIndexes: () => ({ recordIndex: 2, slotIndex: 1 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.deepEqual(levelCorrectionCalls, [[2, 1, 'Expert']]);
    assert.deepEqual(statusCalls, ['corrected']);
    assert.deepEqual(effectStatusCalls, ['corrected']);
    assert.equal(badgeCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 0);
    assert.equal(effect.dataset.levelCorrection, 'expert');
    assert.equal(effect.dataset.levelCorrectionValue, 'Expert');
    assert.equal(effect.dataset.level, 'expert');
    assert.equal(levelInput.value, 'Expert');
    assert.equal(effect.dataset.status, 'corrected');
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

    const levelCorrectionCalls = [];
    const badgeCalls = [];
    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const statusCalls = [];

    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      updateRecordLevelCorrection: (recordIndex, slotIndex, value) => {
        levelCorrectionCalls.push([recordIndex, slotIndex, value]);
        return true;
      },
      recordStatusChange: (_effect, status) => {
        statusCalls.push(status);
        return true;
      },
      updateLevelBadge: (target) => badgeCalls.push(target),
      getEffectIndexes: () => ({ recordIndex: 1, slotIndex: 3 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.changeEffectLevel(effect, levelInput);

    assert.deepEqual(levelCorrectionCalls, [[1, 3, '']]);
    assert.equal(badgeCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 1);
    assert.equal(effect.dataset.levelCorrection, '');
    assert.equal(effect.dataset.levelCorrectionValue, '');
    assert.equal(effect.dataset.level, 'base');
    assert.deepEqual(statusCalls, []);
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
    effect.dataset.levelOptionsBase = 'Base|Expert';
    effect.dataset.predictionValue = 'Prediction';
    item.appendChild(effect);

    const correctionInput = new MockElement('input', 'correction-input');
    correctionInput.value = 'manual';
    effect.appendChild(correctionInput);

    const levelInput = new MockElement('select', 'level-input');
    levelInput.value = 'Expert';
    effect.appendChild(levelInput);

    const button = new MockElement('button');
    button.dataset.value = 'pass';

    const correctionCalls = [];
    const levelCorrectionCalls = [];
    const levelSuppressedCalls = [];
    const rebuildCalls = [];
    const candidateCalls = [];
    const badgeCalls = [];
    const refreshCalls = [];
    const filterCalls = [];
    const scheduleCalls = [];
    const statusCalls = [];
    const effectStatusCalls = [];
    const createCorrectionCalls = [];

    const replacementInput = new MockElement('input', 'correction-input');

    const deps = buildBaseDeps(record, item, {
      scheduleSave: () => scheduleCalls.push(null),
      applyFilters: () => filterCalls.push(null),
      refreshItemCaches: () => refreshCalls.push(null),
      updateRecordCorrection: (recordIndex, slotIndex, value) => {
        correctionCalls.push([recordIndex, slotIndex, value]);
        return true;
      },
      updateRecordLevelCorrection: (recordIndex, slotIndex, value) => {
        levelCorrectionCalls.push([recordIndex, slotIndex, value]);
        return true;
      },
      updateRecordLevelSuppressed: (recordIndex, slotIndex, suppressed) => {
        levelSuppressedCalls.push([recordIndex, slotIndex, suppressed]);
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
      updateLevelBadge: (target) => badgeCalls.push(target),
      createCorrectionInput: (value, predictionDefault) => {
        createCorrectionCalls.push([value, predictionDefault]);
        return replacementInput;
      },
      getEffectIndexes: () => ({ recordIndex: 4, slotIndex: 2 })
    });

    const handlers = handlerFactory.createRecordActionHandlers(deps);
    handlers.toggleReviewStatus(effect, button);

    assert.deepEqual(effectStatusCalls, ['pass']);
    assert.deepEqual(statusCalls, ['pass']);
    assert.deepEqual(correctionCalls, [[4, 2, '']]);
    assert.deepEqual(levelCorrectionCalls, [[4, 2, '']]);
    assert.deepEqual(levelSuppressedCalls, [[4, 2, false]]);
    assert.equal(effect.dataset.correction, '');
    assert.equal(effect.dataset.levelCorrection, '');
    assert.equal(effect.dataset.levelCorrectionValue, '');
    assert.equal(effect.dataset.preserveOriginalLevel, 'true');
    assert.equal(effect.dataset.level, 'base');
    assert.equal(levelInput.value, '');
    assert.deepEqual(candidateCalls, [[]]);
    assert.deepEqual(rebuildCalls, [levelInput]);
    assert.equal(badgeCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
    assert.equal(filterCalls.length, 1);
    assert.equal(scheduleCalls.length, 1);
    assert.deepEqual(createCorrectionCalls, [['', 'Prediction']]);
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
      createCorrectionInput: (value) => {
        const input = new MockElement('input', 'correction-input');
        input.value = value || '';
        return input;
      },
      updateLevelBadge: () => {},
      getEffectIndexes: (effect) => ({
        recordIndex: Number(effect.dataset.recordIndex),
        slotIndex: Number(effect.dataset.slot)
      }),
      updateInputValueAttribute: () => {},
      updateLevelInputAvailability: () => {},
      applyMasterLevelOptions: () => {}
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
      recordStatusChange: () => false,
      updateRecordCorrection: () => false,
      updateRecordLevelCorrection: () => false,
      updateRecordLevelSuppressed: () => false,
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

  test('correction input change updates record state', () => {
    const record = {};
    const item = new MockElement('div', 'item');
    const effect = new MockElement('div', 'effect');
    effect.dataset.recordIndex = '0';
    effect.dataset.slot = '1';
    effect.dataset.levelOriginalValue = 'Base';
    effect.dataset.levelOptionsBase = 'Base|Alt';
    effect.dataset.levelOptionsBaseJson = JSON.stringify(['Base', 'Alt']);
    effect.dataset.predictionValue = 'Skill';
    item.appendChild(effect);
    const correctionInput = new MockElement('input', 'correction-input');
    correctionInput.value = 'NewValue';
    effect.appendChild(correctionInput);
    const levelInput = new MockElement('select', 'level-input');
    effect.appendChild(levelInput);

    const recordStatusCalls = [];
    const updateRecordCorrectionCalls = [];
    const updateLevelSuppressedCalls = [];
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
      updateRecordCorrection: (idx, slot, value) => {
        updateRecordCorrectionCalls.push(value);
        return true;
      },
      updateRecordLevelCorrection: () => false,
      updateRecordLevelSuppressed: (idx, slot, suppress) => {
        updateLevelSuppressedCalls.push(suppress);
        return true;
      },
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.equal(changeHandlers.length > 0, true);
    changeHandlers[0]({ target: correctionInput });
    assert.deepEqual(recordStatusCalls, ['corrected']);
    assert.deepEqual(updateRecordCorrectionCalls, ['NewValue']);
    assert.deepEqual(updateLevelSuppressedCalls, [true]);
    assert.equal(scheduleSaveCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
    assert.equal(applyFilterCalls.length, 1);
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
    effect.dataset.levelOptionsBase = 'Base|Alt';
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
      updateRecordCorrection: () => true,
      updateRecordLevelCorrection: () => false,
      updateRecordLevelSuppressed: () => true,
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

    assert.deepEqual(levelValueCalls, ['']);
    assert.deepEqual(levelOptionsCalls, ['']);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1Level'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'Effect1LevelOptions'), false);
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
      updateRecordCorrection: () => false,
      updateRecordLevelCorrection: () => false,
      updateRecordLevelSuppressed: () => false,
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
    const levelCorrectionCalls = [];
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
      updateRecordCorrection: () => false,
      updateRecordLevelCorrection: (index, slot, value) => {
        levelCorrectionCalls.push(value);
        return true;
      },
      updateRecordLevelSuppressed: () => false,
      scheduleSave: () => scheduleSaveCalls.push(null)
    });

    const changeHandlers = dom.gallery.eventListeners.change || [];
    assert.ok(changeHandlers.length > 0, 'change handler should be registered');
    changeHandlers[0]({ target: levelInput });

    assert.deepEqual(levelCorrectionCalls, ['High']);
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
      updateRecordCorrection: () => false,
      updateRecordLevelCorrection: () => false,
      updateRecordLevelSuppressed: () => false,
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
