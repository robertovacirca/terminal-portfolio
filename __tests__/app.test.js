// __tests__/app.test.js

const fs = require('fs');
const path = require('path');

// Read the actual app.js file content
const appJsContent = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');

// Mock fetch globally
global.fetch = jest.fn();

// Mock marked and hljs globally since they are CDN scripts in the real app
global.marked = { parse: jest.fn(text => `parsed:${text}`) };
global.hljs = {
    configure: jest.fn(),
    highlightElement: jest.fn()
};

// Helper to set up the DOM and load the app
function setupApp() {
    // Reset DOM
    document.body.innerHTML = `
        <div id="terminal">
            <div id="output-container"></div>
        </div>
        <div id="modal-view" style="display: none;">
            <div class="modal-content-wrapper">
                <div id="modal-nano-header"></div>
                <div id="modal-content"></div>
                <div id="modal-footer"></div>
            </div>
        </div>
        <div id="tui-mode-container" style="display: none;">
            <div id="tui-sidebar"></div>
            <div id="tui-main-output"></div>
            <div id="tui-status-bar"></div>
        </div>
    `;

    // Execute app.js content in the current JSDOM environment
    // We wrap it in a function to isolate scope if needed, but eval is simplest for this vanilla setup
    // Note: app.js has a DOMContentLoaded listener, so we need to trigger it.
    eval(appJsContent);

    // Trigger DOMContentLoaded to start the app
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);
}

// Helper to simulate user typing and pressing Enter
async function executeCommand(command) {
    const input = document.querySelector('.input-line input');
    if (!input) throw new Error("Input line not found! App might not have initialized.");
    
    input.value = command;
    input.dispatchEvent(new Event('input')); // In case input event is listened to
    
    // Simulate Enter key
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input.dispatchEvent(enterEvent);

    // Wait for any async operations (fetch) to complete
    // We can use jest.runAllTimers() if timers are used, or setImmediate/process.nextTick
    // Since app.js uses async/await, we need to wait for promises.
    await new Promise(resolve => setTimeout(resolve, 0));
}

// Helper to simulate Tab key
async function pressTab(inputValue) {
    const input = document.querySelector('.input-line input');
    input.value = inputValue;
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(tabEvent);
    await new Promise(resolve => setTimeout(resolve, 0));
}

// Helper to get last output
function getLastOutput() {
    const outputs = document.querySelectorAll('.command-output-item:not(.input-line)');
    if (outputs.length === 0) return null;
    return outputs[outputs.length - 1].textContent;
}

function getAllOutputs() {
    const outputs = document.querySelectorAll('.command-output-item:not(.input-line)');
    return Array.from(outputs).map(div => div.textContent);
}


describe('Terminal App Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock implementation for fetch to return basic posts.json
        global.fetch.mockImplementation((url) => {
            if (url.includes('posts.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([
                        { name: 'post1.md', lastModified: '2023-01-01', size: 100 },
                        { name: 'post2.md', lastModified: '2023-01-02', size: 200 }
                    ])
                });
            }
            return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
        });
        setupApp();
    });

    test('Initialization shows welcome message', async () => {
        // Wait for init async fetch
        await new Promise(resolve => setTimeout(resolve, 0));
        const outputs = getAllOutputs();
        expect(outputs.join('\n')).toContain('Welcome to Terminal Blog!');
    });

    test('ls command lists posts', async () => {
        await new Promise(resolve => setTimeout(resolve, 0)); // Wait for init
        await executeCommand('ls');
        const outputs = getAllOutputs();
        expect(outputs).toContain('posts/');
        expect(outputs).toContain('repos/');
    });

    test('ls posts command lists specific posts', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await executeCommand('ls posts');
        const outputs = getAllOutputs();
        expect(outputs).toContain('  post1.md');
        expect(outputs).toContain('  post2.md');
    });

    test('cat posts/post1.md displays content', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));

        // Mock fetch for the specific post
        global.fetch.mockImplementation((url) => {
            if (url.includes('posts.json')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ name: 'post1.md' }]) });
            if (url.includes('post1.md')) return Promise.resolve({ ok: true, text: () => Promise.resolve('# Content of Post 1') });
            return Promise.resolve({ ok: false });
        });

        await executeCommand('cat posts/post1.md');

        const outputs = getAllOutputs();
        // Since we mock marked.parse to return "parsed:...", check for that
        expect(outputs.some(o => o.includes('parsed:# Content of Post 1'))).toBe(true);
    });

    test('Tab completion for ls', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await pressTab('ls ');
        const outputs = getAllOutputs();
        // Check if suggestions are displayed
        expect(outputs.some(o => o.includes('Suggestions: posts/  repo/'))).toBe(true);
    });

    test('Repo command routing (cat repo/...)', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));

        global.fetch.mockImplementation((url) => {
             // Mock raw content fetch
             if (url.includes('raw.githubusercontent.com')) {
                 return Promise.resolve({ ok: true, text: () => Promise.resolve('Repo file content') });
             }
             if (url.includes('posts.json')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
             return Promise.resolve({ ok: false });
        });

        await executeCommand('cat repo/user/file.md');

        // Check if it tried to fetch raw content (catrepos logic)
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('raw.githubusercontent.com/robertovacirca/user/main/file.md'));

        const outputs = getAllOutputs();
        expect(outputs.some(o => o.includes('parsed:Repo file content'))).toBe(true);
    });
    
    test('Error handling for invalid command', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await executeCommand('invalidcmd');
        const outputs = getAllOutputs();
        expect(outputs.some(o => o.includes('bash: command not found: invalidcmd'))).toBe(true);
    });

    test('Error handling for cat with invalid file', async () => {
         await new Promise(resolve => setTimeout(resolve, 0));
         await executeCommand('cat posts/nonexistent.md');
         const outputs = getAllOutputs();
         expect(outputs.some(o => o.includes('cat: posts/nonexistent.md: No such file or directory'))).toBe(true);
    });
});
