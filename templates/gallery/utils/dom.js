(() => {
    function setHidden(element, hidden) {
        if (!element || !element.classList) {
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
        if (element.classList && errorClass) {
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
        Object.keys(styles).forEach((key) => {
            const value = styles[key];
            if (value != null) {
                element.style[key] = value;
            }
        });
    }

    function ensureElement(current, options = {}) {
        const { selector = '', id = '', tagName = 'div', classNames = [], create } = options;
        let element = current || null;

        const resolveCandidate = () => {
            if (selector) {
                const foundBySelector = document.querySelector(selector);
                if (foundBySelector) {
                    return foundBySelector;
                }
            }
            if (id) {
                const foundById = document.getElementById(id);
                if (foundById) {
                    return foundById;
                }
            }
            return null;
        };

        if (!element || !element.isConnected) {
            const candidate = resolveCandidate();
            if (candidate) {
                element = candidate;
            }
        }

        if (!element) {
            element = typeof create === 'function' ? create() : document.createElement(tagName);
        }

        if (id && !element.id) {
            element.id = id;
        }

        if (element.classList) {
            classNames
                .filter((className) => typeof className === 'string' && className.length > 0)
                .forEach((className) => {
                    element.classList.add(className);
                });
        }

        return element;
    }

    window.galleryDomUtils = {
        setHidden,
        clearChildren,
        updateStatusElement,
        applyInlineStyles,
        ensureElement
    };
})();
