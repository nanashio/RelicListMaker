(() => {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : window;
    const target = globalObject && globalObject.window ? globalObject.window : globalObject;

    function resolveDocument(preferredDocument) {
        if (preferredDocument && typeof preferredDocument === 'object') {
            return preferredDocument;
        }
        if (target && typeof target.document === 'object') {
            return target.document;
        }
        if (globalObject && typeof globalObject.document === 'object') {
            return globalObject.document;
        }
        return null;
    }

    function createDomUtils(options = {}) {
        const doc = resolveDocument(options.document);

        const createElement = typeof options.createElement === 'function'
            ? options.createElement
            : (tagName) => {
                  if (doc && typeof doc.createElement === 'function') {
                      return doc.createElement(tagName);
                  }
                  if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
                      return document.createElement(tagName);
                  }
                  return null;
              };

        function setHidden(element, hidden) {
            if (!element || !element.classList || typeof element.classList.toggle !== 'function') {
                return;
            }
            element.classList.toggle('hidden', Boolean(hidden));
        }

        function clearChildren(element) {
            if (!element) {
                return;
            }
            element.textContent = '';
        }

        function updateStatusElement(element, message, options = {}) {
            if (!element) {
                return;
            }
            const { isError = false, display = 'block', errorClass = 'error' } = options;
            element.textContent = message || '';
            if (element.classList && typeof element.classList.toggle === 'function' && errorClass) {
                element.classList.toggle(errorClass, Boolean(isError));
            }
            if (element.style) {
                element.style.display = message ? display : 'none';
            }
        }

        function applyInlineStyles(element, styles) {
            if (!element || !styles || typeof styles !== 'object') {
                return;
            }
            const styleTarget = element.style || {};
            Object.keys(styles).forEach((key) => {
                const value = styles[key];
                if (value != null) {
                    styleTarget[key] = value;
                } else if (Object.prototype.hasOwnProperty.call(styleTarget, key)) {
                    delete styleTarget[key];
                }
            });
        }

        function resolveCandidate(selector, id) {
            if (!doc) {
                return null;
            }
            if (selector && typeof doc.querySelector === 'function') {
                const foundBySelector = doc.querySelector(selector);
                if (foundBySelector) {
                    return foundBySelector;
                }
            }
            if (id && typeof doc.getElementById === 'function') {
                const foundById = doc.getElementById(id);
                if (foundById) {
                    return foundById;
                }
            }
            return null;
        }

        function ensureElement(current, options = {}) {
            const { selector = '', id = '', tagName = 'div', classNames = [], create } = options;
            let element = current || null;

            const needsLookup = !element || (typeof element.isConnected === 'boolean' && !element.isConnected);
            if (needsLookup) {
                const candidate = resolveCandidate(selector, id);
                if (candidate) {
                    element = candidate;
                }
            }

            if (!element) {
                const created = typeof create === 'function' ? create() : createElement(tagName);
                if (created) {
                    element = created;
                }
            }

            if (!element) {
                return null;
            }

            if (id && !element.id) {
                element.id = id;
            }

            if (Array.isArray(classNames) && classNames.length) {
                const filtered = classNames.filter((className) => typeof className === 'string' && className.length > 0);
                if (element.classList && typeof element.classList.add === 'function') {
                    filtered.forEach((className) => {
                        element.classList.add(className);
                    });
                } else if (typeof element.className === 'string') {
                    const existing = element.className.trim() ? element.className.trim().split(/\s+/) : [];
                    const merged = new Set(existing);
                    filtered.forEach((className) => merged.add(className));
                    element.className = Array.from(merged).join(' ');
                }
            }

            return element;
        }

        return {
            setHidden,
            clearChildren,
            updateStatusElement,
            applyInlineStyles,
            ensureElement
        };
    }

    const factoryNamespace = target.galleryDomUtilsFactory || {};
    factoryNamespace.createDomUtils = createDomUtils;
    target.galleryDomUtilsFactory = factoryNamespace;

    if (!target.galleryDomUtils) {
        target.galleryDomUtils = createDomUtils();
    }
})();
