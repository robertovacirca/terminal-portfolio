// jest.setup.js

// Mock localStorage
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: function(key) {
      return store[key] || null;
    },
    setItem: function(key, value) {
      store[key] = value.toString();
    },
    removeItem: function(key) {
        delete store[key];
    },
    clear: function() {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock scrollIntoView, as it's often called by focus() or UI manipulations
// and JSDOM doesn't implement layout-dependent features.
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Mock for Marked library
global.marked = {
  parse: jest.fn(markdown => `parsed:${markdown}`), // Simple mock
};

// Mock for Highlight.js
global.hljs = {
  highlightElement: jest.fn(),
  configure: jest.fn(),
};

// Mock for navigator.clipboard.writeText
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
  },
  writable: true // Allow this to be further spied on/mocked in tests if needed
});

// Mock for fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    headers: new Map(), // Add a basic headers mock
  })
);

// Mock for common DOM elements and their methods that app.js might use frequently
// This helps avoid "null is not an object" if app.js runs some UI code at load.
document.body.innerHTML = `
  <div id="terminal">
    <div id="output-container"></div>
    <div class="input-line">
      <span class="prompt">guest@terminal:~$</span>
      <input type="text" id="active-command-input" />
    </div>
  </div>
  <div id="modal-view" style="display: none;">
    <div class="modal-content-wrapper">
      <div id="modal-nano-header"></div>
      <div id="modal-content"></div>
      <div id="modal-footer"></div>
    </div>
  </div>
`;

// Global error and info display mocks (can be spied on)
global.console.error = jest.fn();
global.console.warn = jest.fn();
global.console.log = jest.fn();
