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
describe('gallery effect factory', () => {
  let effectFactory;
  let applyCalls;

  beforeEach(() => {
    global.window = {};
    global.document = createMockDocument();
    applyCalls = [];
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

  test('parseLevelOptions normalizes string and array sources', () => {
    assert.deepEqual(effectFactory.parseLevelOptions('A| B |'), ['A', 'B']);
    assert.deepEqual(effectFactory.parseLevelOptions(['', 'C', null, 'D']), ['C', 'D']);
    assert.deepEqual(effectFactory.parseLevelOptions(null), []);
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
