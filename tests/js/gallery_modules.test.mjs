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
