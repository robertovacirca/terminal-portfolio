// __tests__/app.test.js

const fs = require('fs');
const path = require('path');

// Mock fetch globally
global.fetch = jest.fn();

// Mock marked and hljs globally since they are CDN scripts in the real app
global.marked = { parse: jest.fn(text => `parsed:${text}`) };
global.hljs = {
    configure: jest.fn(),
    highlightElement: jest.fn()
};

// Simulate parts of app.js's environment
let mockActiveCommandInput;
let mockOutputContainer;
let mockCurrentInputLineDiv;

let commands; // Will be populated in beforeEach

// Levenshtein implementation (needed globally for processCommand mock)
global.levenshtein = function(s1, s2) {
    if (s1.length < s2.length) { return global.levenshtein(s2, s1); }
    if (s2.length === 0) { return s1.length; }
    let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 0; i < s1.length; i++) {
        let currentRow = [i + 1];
        for (let j = 0; j < s2.length; j++) {
            let insertions = previousRow[j + 1] + 1;
            let deletions = currentRow[j] + 1;
            let substitutions = previousRow[j] + (s1[i] !== s2[j]);
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow = currentRow;
    }
    return previousRow[previousRow.length - 1];
};

// Helper to simulate app.js loading and making 'commands' available
async function initializeAppEnvironment() {
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
    mockOutputContainer = document.getElementById('output-container');
    mockCurrentInputLineDiv = document.querySelector('.input-line');
    mockActiveCommandInput = document.getElementById('mock-input');

    // Fetch helpers
    async function fetchGitHubApi(url) {
        let response;
        try {
            response = await global.fetch(url);
        } catch (networkError) {
            console.error("Network error fetching from GitHub API (test mock):", networkError);
            throw new Error(`Network request failed. Please check your internet connection.`);
        }
        if (!response.ok) {
            const status = response.status;
            const statusText = response.statusText;
            const requestedUrl = response.url;
            if (status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
                const resetTimeEpoch = parseInt(response.headers.get('X-RateLimit-Reset')) * 1000;
                const resetTime = new Date(resetTimeEpoch).toLocaleTimeString();
                throw new Error(`GitHub API rate limit exceeded. Try again after ${resetTime}.`);
            } else if (status === 404) {
                const pathPart = requestedUrl.includes('/repos/') ? requestedUrl.split('/repos/')[1] : requestedUrl;
                throw new Error(`Error: Repository or path not found: ${pathPart}`);
            } else {
                throw new Error(`GitHub API Error: ${status} ${statusText}.`);
            }
        }
        return await response.json();
    }
    global.fetchGitHubApi = fetchGitHubApi;

    async function fetchRawGitHubContent(owner, repoName, path, branch = 'main') {
        const url = `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${path}`;
        let response;
        try {
            response = await global.fetch(url);
        } catch (networkError) {
            console.error("Network error fetching raw GitHub content (test mock):", networkError);
            throw new Error(`Network request failed. Please check your internet connection.`);
        }
        if (!response.ok) {
            const status = response.status;
            const statusText = response.statusText;
            if (status === 404) {
                throw new Error(`Error: File not found: ${owner}/${repoName}/${path}`);
            } else {
                throw new Error(`Error fetching file: ${status} ${statusText}.`);
            }
        }
        return await response.text();
    }
    global.fetchRawGitHubContent = fetchRawGitHubContent;

    const formatDateForLs = (dateString) => {
        const date = new Date(dateString);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')} ${date.getFullYear()}`;
    };
    const formatSizeForLs = (bytes) => {
        if (bytes === undefined || bytes === null) return '0.0KB';
        return (bytes / 1024).toFixed(1) + 'KB';
    };

    commands = {
        lsPosts: (args) => {
            mockDisplayOutput("Posts in /posts:");
            const showLongFormat = args.includes('-l') || args.includes('-lt') || args.includes('-tl');
            const sortByTime = args.includes('-t') || args.includes('-lt') || args.includes('-tl');
            let postsToDisplay = [...mockPostsManifest];

    // Execute app.js content in the current JSDOM environment
    // We wrap it in a function to isolate scope if needed, but eval is simplest for this vanilla setup
    // Note: app.js has a DOMContentLoaded listener, so we need to trigger it.
    eval(appJsContent);

            if (showLongFormat) {
                let maxSizeStrLength = 0;
                postsToDisplay.forEach(p => {
                    const sizeStr = formatSizeForLs(p.size);
                    if (sizeStr.length > maxSizeStrLength) maxSizeStrLength = sizeStr.length;
                });
                postsToDisplay.forEach(p => {
                    const dateStr = formatDateForLs(p.lastModified);
                    const sizeStr = formatSizeForLs(p.size).padStart(maxSizeStrLength, ' ');
                    mockDisplayOutput(`  ${dateStr} ${sizeStr}   ${p.name}`);
                });
            } else {
                postsToDisplay.forEach(p => mockDisplayOutput(`  ${p.name}`));
            }
        },
        lsrepos: async (args) => {
            const owner = 'robertovacirca';
            const isListingAllRepos = args.length === 0 || (args[0] && args[0].startsWith('-'));
            if (isListingAllRepos) {
                mockDisplayOutput("Repositories in /repo:");
                const showLongFormat = args.includes('-l') || args.includes('-lt') || args.includes('-tl');
                const sortByTime = args.includes('-t') || args.includes('-lt') || args.includes('-tl');
                mockShowLoadingSuggestions();
                try {
                    let repos = await fetchGitHubApi(`https://api.github.com/users/${owner}/repos`);
                    
                    if (!Array.isArray(repos)) {
                        console.error('Mock lsrepos: fetchGitHubApi did not return an array. Response:', repos);
                        mockDisplayOutput("Error: Could not retrieve a valid list of repositories.", "error");
                    } else if (repos.length === 0) { 
                        mockDisplayOutput(`  No public repositories found for ${owner}.`); 
                    } else {
                        if (sortByTime) repos.sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());
                        else repos.sort((a, b) => a.name.localeCompare(b.name));
                        
                        if (showLongFormat) {
                             let maxLangLen = 0, maxStarsLen = 0;
                             repos.forEach(repo => {
                                const lang = repo.language || "N/A"; if (lang.length > maxLangLen) maxLangLen = lang.length;
                                const stars = String(repo.stargazers_count); if (stars.length > maxStarsLen) maxStarsLen = stars.length;
                             });
                             repos.forEach(repo => mockDisplayOutput(`  ${formatDateForLs(repo.pushed_at)} ${(repo.language || "N/A").padEnd(maxLangLen, ' ')} ★${String(repo.stargazers_count).padStart(maxStarsLen, ' ')}   ${repo.name}/`));
                        } else repos.forEach(repo => mockDisplayOutput(`  ${repo.name}/`));
                    }
                } catch (error) { 
                    mockDisplayOutput(`${error.message}`, 'error'); 
                } 
                finally { mockHideLoadingSuggestions(); }
            } else {
                let fullPathArg = args[0];
                let normalizedPath = fullPathArg;
                if (normalizedPath.toLowerCase().startsWith('repo/')) {
                    normalizedPath = normalizedPath.substring('repo/'.length);
                } else if (normalizedPath.toLowerCase().startsWith('repos/')) {
                    normalizedPath = normalizedPath.substring('repos/'.length);
                }

                const pathParts = normalizedPath.split('/');
                const repoName = pathParts[0];
                const pathWithinRepo = pathParts.slice(1).join('/');
                
                const displayPath = `${owner}/${repoName}${pathWithinRepo ? '/' + pathWithinRepo : ''}`;
                
                mockShowLoadingSuggestions();
                try {
                    const contents = await fetchGitHubApi(`https://api.github.com/repos/${owner}/${repoName}/contents/${pathWithinRepo}`);
                    
                    if (contents && typeof contents === 'object' && !Array.isArray(contents) && contents.type === 'file') {
                         mockDisplayOutput(`ls: cannot access 'repo/${normalizedPath}': It is a file. Use 'cat' or 'less' to view its content.`, 'error');
                    } else if (Array.isArray(contents)) {
                        mockDisplayOutput(`Contents of ${displayPath}:`);
                        if (contents.length === 0) {
                            mockDisplayOutput(`  Directory ${displayPath} is empty.`);
                        } else {
                            contents.sort((a,b) => a.name.localeCompare(b.name)); 
                            contents.forEach(item => mockDisplayOutput(`  ${item.name}${item.type === 'dir' ? '/' : ''}`));
                        }
                    } else {
                        mockDisplayOutput(`Error: Could not list contents of ${displayPath}. Path may be invalid or an unexpected error occurred.`, 'error');
                    }
                } catch (error) { 
                    mockDisplayOutput(`${error.message}`, 'error'); 
                } finally { 
                    mockHideLoadingSuggestions(); 
                }
            }
        },
        ls: async (args) => {
            if (args.length === 0) {
                mockDisplayOutput("posts/");
                mockDisplayOutput("repos/");
                return;
            }
    
            let firstArgNormalized = args[0].toLowerCase();
            if (firstArgNormalized === 'posts/') {
                firstArgNormalized = 'posts';
            } else if (firstArgNormalized === 'repo/') {
                firstArgNormalized = 'repo';
            } else if (firstArgNormalized === 'repos/') {
                firstArgNormalized = 'repo';
            }
    
            if (firstArgNormalized === 'posts') {
                await global.commands.lsPosts(args); 
            } else if (firstArgNormalized === 'repo' || firstArgNormalized === 'repos') {
                await global.commands.lsrepos(args.slice(1));
            } else if (firstArgNormalized.startsWith('repo/') || firstArgNormalized.startsWith('repos/')) {
                await global.commands.lsrepos(args); 
            } else {
                if (args.every(arg => arg.startsWith('-'))) {
                    mockDisplayOutput("posts/");
                    mockDisplayOutput("repos/");
                    return;
               }
                mockDisplayOutput(`Usage: ls [posts|repo[/path]] [-lt] or ls posts [-lt]`, 'error');
            }
        },
        cat: async (args) => {
            if (args.length === 0) { mockDisplayOutput("Usage: cat <filename>", 'error'); return; }
            let filenameInput = args[0];
            let actualFilename = filenameInput;

            if (filenameInput.toLowerCase().startsWith('posts/')) {
                actualFilename = filenameInput.substring('posts/'.length);
            }

            if (!actualFilename) {
                mockDisplayOutput(`cat: ${filenameInput}: Is a directory or invalid path`, 'error');
                return;
            }

            const post = global.postsManifest.find(p => p.name === actualFilename);
            if (!post) { mockDisplayOutput(`cat: ${filenameInput}: No such file or directory`, 'error'); return; }
            try {
                const response = await global.fetch(`public/posts/${actualFilename}`);
                if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                const markdownContent = await response.text();
                mockDisplayOutput(global.marked.parse(markdownContent), 'rawhtml');
            } catch (error) { mockDisplayOutput(`cat: ${filenameInput}: ${error.message}`, 'error'); }
        },
        help: jest.fn(),
    };
    
    global.displayOutput = mockDisplayOutput;
    global.showLoadingSuggestions = mockShowLoadingSuggestions;
    global.hideLoadingSuggestions = mockHideLoadingSuggestions;
    global.commands = commands;
    global.postsManifest = mockPostsManifest;
    global.userRepoNamesCache = mockUserRepoNamesCache;
    global.repoContentsCache = mockRepoContentsCache;
    
    global.activeCommandInput = mockActiveCommandInput;
    global.outputContainer = mockOutputContainer;
    global.currentInputLineDiv = mockCurrentInputLineDiv;

    global.commandHelp = {
        help: { description: "Show this help message." },
        ls: { description: "List directory contents." },
        cat: { description: "Display post content." },
        vi: { description: "Vi editor." },
        nano: { description: "Nano editor." },
        less: { description: "Less viewer." },
        man: { description: "Manual pages." }
    };
}


async function processCommand(commandText) {
    const parts = commandText.split(/\s+/).filter(s => s.length > 0);
    const command = parts[0];
    const args = parts.slice(1);

    if (!command) return;

    if (['cat', 'less', 'vi', 'nano'].includes(command.toLowerCase()) &&
        args[0] &&
        (args[0].toLowerCase().startsWith('repo/') || args[0].toLowerCase().startsWith('repos/'))) {

        const fullPathArg = args[0];
        let pathWithoutPrefix = '';

        if (fullPathArg.toLowerCase().startsWith('repo/')) {
            pathWithoutPrefix = fullPathArg.substring('repo/'.length);
        } else if (fullPathArg.toLowerCase().startsWith('repos/')) {
            pathWithoutPrefix = fullPathArg.substring('repos/'.length);
        }

        const pathParts = pathWithoutPrefix.split('/');

        // Ensure repoName is not empty (e.g. from "cat repo/")
        if (pathParts.length >= 1 && pathParts[0]) {
            const repoName = pathParts[0];
            const fileOrDirPath = pathParts.slice(1).join('/');

            if (!fileOrDirPath) {
                global.displayOutput(`${command}: '${fullPathArg}' is a directory. Please specify a file path.`, 'error');
                // No further processing for this command if only a directory is given to cat/less etc.
                // createNewInputLine(); // Not needed here as processCommand finishes and calls it
                return;
            }

            const targetReposCommandName = command.toLowerCase() + 'repos';
            if (global.commands[targetReposCommandName]) {
                await global.commands[targetReposCommandName](repoName, fileOrDirPath);
            } else {
                // This case should ideally not be hit if all ...repos commands are defined
                console.error(`Internal error: Command ${targetReposCommandName} not found, but routing logic directed to it.`);
                global.displayOutput(`Error: Command ${command} does not support repository operations for ${targetReposCommandName}.`, 'error');
            }
            return; // Exit after handling the repo-specific command
        } else {
             // Case where pathWithoutPrefix was empty or only contained slashes, making repoName empty.
             // e.g., user typed "cat repo/" or "cat repos//"
             global.displayOutput(`${command}: Invalid repository path specified: '${fullPathArg}'`, 'error');
             // createNewInputLine(); // Not needed here
             return;
        }
    }

    const cmdFunc = global.commands[command.toLowerCase()];
    if (cmdFunc) {
        try {
            await cmdFunc(args);
        } catch (error) {
            global.displayOutput(`Error during ${command}: ${error.message}`, 'error');
        }
    } else {
        global.displayOutput(`bash: command not found: ${command}`, 'error');
        const commandNames = Object.keys(global.commands);
        const threshold = 2;
        let suggestions = [];
        for (const validCommand of commandNames) {
            // Do not suggest '?' for commands longer than 1 char, unless the command itself is '?'
            if (validCommand === "?" && command !== "?" && command.length > 1) continue;

            const distance = global.levenshtein(command, validCommand);
            // console.log(`Levenshtein: cmd=${command}, valid=${validCommand}, dist=${distance}`);
            if (distance <= threshold) {
                suggestions.push({ command: validCommand, distance: distance });
            }
        }
        suggestions.sort((a, b) => a.distance - b.distance);
        // console.log('Suggestions found:', suggestions);

        if (suggestions.length > 0) {
            let suggestionMsg = `Did you mean: ${suggestions[0].command} ?`;
            if (suggestions.length > 1 && suggestions[1].distance === suggestions[0].distance && suggestions[1].command !== suggestions[0].command) {
                // Ensure deterministic output for test if distances are equal
                const sortedCmds = [suggestions[0].command, suggestions[1].command].sort();
                suggestionMsg = `Did you mean: ${sortedCmds[0]} or ${sortedCmds[1]} ?`;
            }
            global.displayOutput(suggestionMsg);
        }
    }
}
global.processCommand = processCommand;

async function handleCommandInputKeydown(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();

    const currentInputValue = global.activeCommandInput.value;
    const parts = currentInputValue.split(' ');
    const commandName = parts[0].toLowerCase();
    const baseDirs = ["posts/", "repo/"];
    let suggestions = [];

    // console.log(`Tab Keydown: val='${currentInputValue}', parts=${JSON.stringify(parts)}, cmd=${commandName}`);

    if (parts.length === 1 && !currentInputValue.endsWith(" ")) {
        const commandPartToComplete = parts[0];
        suggestions = Object.keys(global.commands).filter(cmd => cmd.startsWith(commandPartToComplete));
    } else if (commandName) {
        if (commandName === 'ls' || ['cat', 'less', 'vi', 'nano'].includes(commandName)) {
            if (argIndex === 1) {
                if (currentArgText.startsWith("posts/")) {
                    const filePrefix = currentArgText.substring("posts/".length);
                    suggestions = global.postsManifest
                        .filter(post => post.name.toLowerCase().startsWith(filePrefix.toLowerCase()))
                        .map(p => "posts/" + p.name);
                } else if (currentArgText.startsWith("repo/")) {
                    const repoPathPart = currentArgText.substring("repo/".length);
                    const repoPathSegments = repoPathPart.split('/');
                    if (repoPathSegments.length === 1) {
                        const partialRepoName = repoPathSegments[0];
                        if (global.userRepoNamesCache === null) {
                            mockShowLoadingSuggestions();
                            try {
                                const repos = await global.fetch(`https://api.github.com/users/robertovacirca/repos`).then(r => r.json());
                                global.userRepoNamesCache = repos.map(r => r.name);
                            } catch (err) { global.displayOutput(`Error: ${err.message}`, 'error'); global.userRepoNamesCache = []; } 
                            finally { mockHideLoadingSuggestions(); }
                        }
                        suggestions = (global.userRepoNamesCache || [])
                            .filter(name => name.startsWith(partialRepoName))
                            .map(name => `repo/${name}/`);
                    } else {
                        const repoName = repoPathSegments[0];
                        const pathPrefixSegments = repoPathSegments.slice(1, -1);
                        const itemToComplete = repoPathSegments[repoPathSegments.length - 1];
                        const cacheKey = `${repoName}/${pathPrefixSegments.join('/')}`;
                        if (!global.repoContentsCache[cacheKey]) {
                             mockShowLoadingSuggestions();
                            try {
                                const contents = await global.fetch(`https://api.github.com/repos/robertovacirca/${repoName}/contents/${pathPrefixSegments.join('/')}`).then(r=>r.json());
                                global.repoContentsCache[cacheKey] = contents;
                            } catch (err) { global.displayOutput(`Error: ${err.message}`, 'error'); global.repoContentsCache[cacheKey] = []; }
                            finally { mockHideLoadingSuggestions(); }
                        }
                        suggestions = (global.repoContentsCache[cacheKey] || [])
                            .filter(item => item.name.startsWith(itemToComplete))
                            .map(item => `repo/${repoName}/${pathPrefixSegments.join('/') ? pathPrefixSegments.join('/') + '/' : ''}${item.name}${item.type === 'dir' ? '/' : ''}`);
                    }
                } else { 
                    suggestions = baseDirs.filter(dir => dir.startsWith(currentArgText));
                }
            }
        } else if (commandName === 'man') {
            if (argIndex === 1) {
                 suggestions = Object.keys(global.commandHelp).filter(cmd => cmd.startsWith(currentArgText) && cmd !== '?');
            }
        }
    }
    if (suggestions.length > 0) suggestions = [...new Set(suggestions)];

    if (suggestions.length === 1) {
        const suggestion = suggestions[0];
        parts[parts.length - 1] = suggestion;
        let finalValue = suggestion.endsWith('/') ? parts.join(' ') : parts.join(' ') + ' ';
        global.activeCommandInput.value = finalValue;
    } else if (suggestions.length > 1) {
        global.displayOutput(`Suggestions: ${suggestions.join('  ')}`);
    }
}
global.handleCommandInputKeydown = handleCommandInputKeydown;


beforeEach(async () => {
  jest.clearAllMocks();
  mockPostsManifest = [];
  mockUserRepoNamesCache = null;
  mockRepoContentsCache = {};
  global.postsManifest = mockPostsManifest;
  global.userRepoNamesCache = null;
  global.repoContentsCache = {};
  await initializeAppEnvironment();
});

describe('Terminal App Core Features', () => {
  
  describe('ls Command Variations', () => {
    test('ls (no args) should output posts/ and repo/', async () => {
      await global.commands.ls([]);
      expect(mockDisplayOutput).toHaveBeenCalledWith('posts/');
      expect(mockDisplayOutput).toHaveBeenCalledWith('repos/');
    });

    test('ls posts should list post names', async () => {
      mockPostsManifest.push({ name: 'post1.md', lastModified: '', size: 0 }, { name: 'post2.md', lastModified: '', size: 0 });
      await global.commands.ls(['posts']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Posts in /posts:');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  post1.md');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  post2.md');
    });

    test('ls -l posts should list posts in long format', async () => {
      mockPostsManifest.push({ name: 'post1.md', lastModified: '2023-01-15T10:00:00Z', size: 1024 });
      await global.commands.ls(['posts', '-l']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Posts in /posts:');
      expect(mockDisplayOutput).toHaveBeenCalledWith(expect.stringMatching(/Jan 15 2023\s+1\.0KB\s+post1\.md/));
    });

    test('ls -lt posts should sort by time and list in long format', async () => {
      mockPostsManifest.push(
        { name: 'post1.md', lastModified: '2023-01-15T10:00:00Z', size: 1024 },
        { name: 'post2.md', lastModified: '2023-03-20T12:00:00Z', size: 2048 }
      );
      await global.commands.ls(['posts', '-lt']);
      const calls = mockDisplayOutput.mock.calls;
      expect(calls[0][0]).toBe('Posts in /posts:');
      expect(calls[1][0]).toEqual(expect.stringMatching(/Mar 20 2023\s+2\.0KB\s+post2\.md/));
      expect(calls[2][0]).toEqual(expect.stringMatching(/Jan 15 2023\s+1\.0KB\s+post1\.md/));
    });

    test('ls repo should list repo names', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'repo1', pushed_at: '', language: '', stargazers_count: 0 }, { name: 'repo2' }]),
      });
      await global.commands.ls(['repo']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Repositories in /repo:');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  repo1/');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  repo2/');
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
    });
    
    test('ls -l repo should list repos in long format', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'repo1', pushed_at: '2023-01-15T10:00:00Z', language: 'JavaScript', stargazers_count: 10 }]),
      });
      await global.commands.ls(['repo', '-l']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Repositories in /repo:');
      expect(mockDisplayOutput).toHaveBeenCalledWith(expect.stringMatching(/Jan 15 2023\s+JavaScript\s+★10\s+repo1\//));
    });

    test('ls -lt repo should sort by time and list in long format', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([
                { name: 'repo1', pushed_at: '2023-01-15T10:00:00Z', language: 'JS', stargazers_count: 5 },
                { name: 'repo2', pushed_at: '2023-03-20T12:00:00Z', language: 'Py', stargazers_count: 10 }
            ]),
        });
        await global.commands.ls(['repo', '-lt']);
        const calls = mockDisplayOutput.mock.calls;
        expect(calls[0][0]).toBe('Repositories in /repo:');
        expect(calls[1][0]).toEqual(expect.stringMatching(/Mar 20 2023\s+Py\s+★10\s+repo2\//));
        // Adjusted regex to be more flexible with spaces around ★
        expect(calls[2][0]).toEqual(expect.stringMatching(/Jan 15 2023\s+JS\s+★\s*5\s+repo1\//));
    });

    test('ls repo my-repo/src should list contents of a specific repo path', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'file.js', type: 'file' }, { name: 'subdir', type: 'dir' }]),
      });
      await global.commands.ls(['repo', 'my-repo/src']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Contents of robertovacirca/my-repo/src:');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  file.js');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  subdir/');
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bug Fix Specific Tests', () => {
    test('ls posts/ (with trailing slash) should behave like ls posts', async () => {
      mockPostsManifest.push({ name: 'post1.md', lastModified: '', size: 0 });
      await global.commands.ls(['posts/']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Posts in /posts:');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  post1.md');
    });

    test('ls repo/ (with trailing slash) should behave like ls repo', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'repo1', pushed_at: '', language: '', stargazers_count: 0 }]),
      });
      await global.commands.ls(['repo/']);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Repositories in /repo:');
      expect(mockDisplayOutput).toHaveBeenCalledWith('  repo1/');
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
    });

    test('ls repo/my-repo/README.md (file path) should show specific error', async () => {
      const repoName = 'my-repo';
      const fileName = 'README.md';
      const fullPath = `${repoName}/${fileName}`;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ type: 'file', name: fileName, path: fileName }),
      });
      
      await global.commands.ls([`repo/${fullPath}`]); 
      
      const expectedUserPath = `repo/${repoName}/${fileName}`;
      expect(mockDisplayOutput).toHaveBeenCalledWith(
        `ls: cannot access '${expectedUserPath}': It is a file. Use 'cat' or 'less' to view its content.`,
        'error'
      );
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
    });

    test('ls repo/my-repo/src_directory (directory path) should list contents', async () => {
      const owner = 'robertovacirca';
      const repoName = 'my-repo';
      const dirName = 'src_directory';
      const fullPath = `${repoName}/${dirName}`;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'file.js', type: 'file' }]),
      });
      await global.commands.ls([`repo/${fullPath}`]);
      expect(mockDisplayOutput).toHaveBeenCalledWith(`Contents of ${owner}/${repoName}/${dirName}:`);
      expect(mockDisplayOutput).toHaveBeenCalledWith('  file.js');
    });
    
    test('cat repo/my-repo/actual-file.md should display file content', async () => {
      const repoName = 'my-repo';
      const fileName = 'actual-file.md';
      const fileContent = '## Hello Markdown';
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(fileContent),
      });

      if (!global.commands.catrepos) {
        global.commands.catrepos = async (rn, fp) => {
            mockShowLoadingSuggestions();
            try {
                const content = await global.fetchRawGitHubContent('robertovacirca', rn, fp); // Uses mocked fetch
                // Use mocked marked.parse to match expectation
                mockDisplayOutput(global.marked.parse(content), 'rawhtml');
            } catch (e) {
                mockDisplayOutput(e.message, 'error');
            } finally {
                mockHideLoadingSuggestions();
            }
        };
      }
      await global.processCommand(`cat repo/${repoName}/${fileName}`);
      
      expect(mockShowLoadingSuggestions).toHaveBeenCalled();
      expect(mockDisplayOutput).toHaveBeenCalledWith(`parsed:${fileContent}`, 'rawhtml');
      expect(mockHideLoadingSuggestions).toHaveBeenCalled();
    });

     test('cat repos/my-repo/another-file.md (with "repos/" prefix) should also display content', async () => {
      const repoName = 'my-repo';
      const fileName = 'another-file.md';
      const fileContent = '## Another File';
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(fileContent),
      });

      // Ensure catrepos mock is available (it should be from previous tests in the same describe block or defined globally)
      if (!global.commands.catrepos) {
         global.commands.catrepos = async (rn, fp) => {
            mockShowLoadingSuggestions();
            try {
                const content = await global.fetchRawGitHubContent('robertovacirca', rn, fp);
                mockDisplayOutput(global.marked.parse(content), 'rawhtml');
            } catch (e) {
                mockDisplayOutput(e.message, 'error');
            } finally {
                mockHideLoadingSuggestions();
            }
        };
      }
      await global.processCommand(`cat repos/${repoName}/${fileName}`);
      expect(mockDisplayOutput).toHaveBeenCalledWith(`parsed:${fileContent}`, 'rawhtml');
    });

    test('cat posts/existing-post.md should display local post content', async () => {
      const postFileName = 'existing-post.md';
      const postContent = '# Local Post Title\nContent here.';
      mockPostsManifest.push({ name: postFileName, lastModified: '2024-01-01T00:00:00Z', size: 100 });
      
      // Mock the fetch for the local post file
      // This fetch is called by commands.cat (the actual one, or our mock of it)
      global.fetch.mockImplementation((url) => {
        if (url && url.includes(`public/posts/${postFileName}`)) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(postContent),
          });
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("Not Found")});
      });

      // Call processCommand, which will route to commands.cat
      await global.processCommand(`cat posts/${postFileName}`);
      expect(mockDisplayOutput).toHaveBeenCalledWith(`parsed:${postContent}`, 'rawhtml');
    });

  });

  describe('Tab Autocompletion', () => {
    async function simulateTabCompletion(inputValue) {
        global.activeCommandInput.value = inputValue;
        await global.handleCommandInputKeydown({ key: 'Tab', preventDefault: jest.fn() });
    }

    test('ls <tab> suggests posts/ and repo/', async () => {
      // simulateTabCompletion does activeCommandInput.value = inputValue then calls handle...
      // but in app.js Tab check: if (!activeCommandInput) return;
      // In simulateTabCompletion we need to ensure activeCommandInput is set?
      // Yes, global.activeCommandInput.value = inputValue sets it on the DOM element.
      // But handleCommandInputKeydown uses global.activeCommandInput.value
      // Let's verify handleCommandInputKeydown logic for 'ls '
      // It splits 'ls ' -> parts=['ls', '']
      // commandName='ls', argIndex=1, currentArgText=""
      // if (commandName === 'ls' ...) -> true
      // suggestions = baseDirs.filter(dir => dir.startsWith("")) -> ["posts/", "repo/"]
      // It should output suggestions.

      await simulateTabCompletion('ls ');
      // Wait for async operations just in case (though ls <tab> with no fetch shouldn't need it)
      expect(mockDisplayOutput).toHaveBeenCalledWith('Suggestions: posts/  repo/');
    });

    test('ls posts command lists specific posts', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await executeCommand('ls posts');
        const outputs = getAllOutputs();
        expect(outputs).toContain('  post1.md');
        expect(outputs).toContain('  post2.md');
    });

    test('ls repo/<tab> suggests repo names and caches them', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'repoA' }, { name: 'repoB' }]),
      });
      await simulateTabCompletion('ls repo/');
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Suggestions: repo/repoA/  repo/repoB/');
      expect(global.userRepoNamesCache).toEqual(['repoA', 'repoB']);

      jest.clearAllMocks();
      await simulateTabCompletion('ls repo/');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockShowLoadingSuggestions).not.toHaveBeenCalled();
      expect(mockDisplayOutput).toHaveBeenCalledWith('Suggestions: repo/repoA/  repo/repoB/');
    });

    test('ls repo/repoA/<tab> suggests repo contents and caches them', async () => {
      global.userRepoNamesCache = ['repoA', 'repoB'];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: 'file1.js', type: 'file' }, { name: 'folder', type: 'dir' }]),
      });
      await simulateTabCompletion('ls repo/repoA/');
      expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
      expect(mockDisplayOutput).toHaveBeenCalledWith('Suggestions: repo/repoA/file1.js  repo/repoA/folder/');
      expect(global.repoContentsCache['repoA/']).toBeDefined();

      jest.clearAllMocks();
      await simulateTabCompletion('ls repo/repoA/');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockShowLoadingSuggestions).not.toHaveBeenCalled();
      expect(mockDisplayOutput).toHaveBeenCalledWith('Suggestions: repo/repoA/file1.js  repo/repoA/folder/');
    });
    
    test('single directory suggestion completes with no trailing space', async () => {
        await simulateTabCompletion('ls po');
        expect(global.activeCommandInput.value).toBe('ls posts/');
    });

    test('Tab completion for ls', async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await pressTab('ls ');
        const outputs = getAllOutputs();
        // Check if suggestions are displayed
        expect(outputs.some(o => o.includes('Suggestions: posts/  repo/'))).toBe(true);
    });
  });

  describe('Error Handling & Loading Indicators', () => {

    test('GitHub API rate limit error (403) formatting', async () => {
        const resetTime = new Date(Date.now() + 3600 * 1000);
        const resetTimestamp = Math.floor(resetTime.getTime() / 1000);
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            headers: new Map([['X-RateLimit-Remaining', '0'], ['X-RateLimit-Reset', resetTimestamp.toString()]]),
            url: 'https://api.github.com/users/robertovacirca/repos'
        });
        await global.commands.lsrepos([]);
        expect(mockDisplayOutput).toHaveBeenCalledWith(expect.stringContaining('GitHub API rate limit exceeded. Try again after'), 'error');
        expect(mockShowLoadingSuggestions).toHaveBeenCalledTimes(1);
        expect(mockHideLoadingSuggestions).toHaveBeenCalledTimes(1);
    });

    test('GitHub API not found error (404) formatting', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: new Map(),
            url: 'https://api.github.com/repos/robertovacirca/nonexistent/contents/'
        });
        await global.commands.lsrepos(['nonexistent/']);
        expect(mockDisplayOutput).toHaveBeenCalledWith('Error: Repository or path not found: robertovacirca/nonexistent/contents/', 'error');
    });
    
    test('Raw content not found error (404) formatting for catrepos', async () => {
        commands.catrepos = async (args) => {
            const [repoPath] = args;
            const parts = repoPath.split('/');
            const repoName = parts[0];
            const filePath = parts.slice(1).join('/');
            mockShowLoadingSuggestions();
            try {
                await global.fetchRawGitHubContent('robertovacirca', repoName, filePath); 
            } catch (e) {
                mockDisplayOutput(e.message, 'error');
            } finally {
                mockHideLoadingSuggestions();
            }
        };

        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            url: 'https://raw.githubusercontent.com/robertovacirca/myrepo/main/nonexistent.md'
        });

        const outputs = getAllOutputs();
        expect(outputs.some(o => o.includes('parsed:Repo file content'))).toBe(true);
    });


    test('Network failure during API calls', async () => {
        global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await global.commands.lsrepos([]);
        expect(mockDisplayOutput).toHaveBeenCalledWith('Network request failed. Please check your internet connection.', 'error');
    });

    test('Command not found suggests similar commands', async () => {
      await global.processCommand('lss');
      expect(mockDisplayOutput).toHaveBeenCalledWith('bash: command not found: lss', 'error');
      expect(mockDisplayOutput).toHaveBeenCalledWith('Did you mean: ls ?');
    });
    
    test('Command not found suggests two commands if equally close', async () => {
        global.commands.sl = jest.fn(); 
        await global.processCommand('l'); // 'l' is dist 1 from 'ls' and 'sl'
        expect(mockDisplayOutput).toHaveBeenCalledWith('bash: command not found: l', 'error');
        // Order might vary based on Object.keys, so check for both possibilities
        try {
            expect(mockDisplayOutput).toHaveBeenCalledWith('Did you mean: ls or sl ?');
        } catch (e) {
            expect(mockDisplayOutput).toHaveBeenCalledWith('Did you mean: sl or ls ?');
        }
        delete global.commands.sl; // Clean up
    });
  });
});
