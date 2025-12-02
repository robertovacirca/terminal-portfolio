document.addEventListener('DOMContentLoaded', () => {
    const terminal = document.getElementById('terminal');
    const outputContainer = document.getElementById('output-container');

    const modalView = document.getElementById('modal-view');
    const modalContentWrapper = modalView.querySelector('.modal-content-wrapper');
    const modalNanoHeader = modalView.querySelector('#modal-nano-header');
    const modalContent = document.getElementById('modal-content');
    const modalFooter = document.getElementById('modal-footer');

    let commandHistory = [];
    let historyIndex = -1;
    let postsManifest = [];
    let currentView = null;
    let activeCommandInput = null;
    let currentInputLineDiv = null;
    let slInterval = null;

    let userRepoNamesCache = null; // Cache for GitHub repository names
    let repoContentsCache = {};   // Cache for contents of repository paths

    // TUI specific variables
    let tuiSidebarItems = [];
    let currentTuiFocusIndex = -1;
    let isTuiSidebarPopulated = false;
    let tuiStatusBarElement = null;
    let tuiSidebarElement = null; // Will hold reference to #tui-sidebar
    let tuiMainOutputElement = null; // Will hold reference to #tui-main-output

    const fortunes = [
        "Code is like humor. When you have to explain it, it’s bad. – Cory House",
        "The best way to predict the future is to invent it. – Alan Kay",
        "Walking on water and developing software from a specification are easy if both are frozen. – Edward V Berard",
        "There are only two hard things in Computer Science: cache invalidation and naming things. – Phil Karlton",
        "Talk is cheap. Show me the code. – Linus Torvalds",
        "To iterate is human, to recurse divine. – L. Peter Deutsch",
        "It’s not a bug – it’s an undocumented feature.",
        "Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it. – Brian Kernighan"
    ];

    hljs.configure({ ignoreUnescapedHTML: true });
    // Helper function to fetch from GitHub API
    async function fetchGitHubApi(url) {
        let response;
        try {
            response = await fetch(url);
        } catch (networkError) {
            // Catches TypeError: Failed to fetch
            console.error("Network error fetching from GitHub API:", networkError);
            throw new Error(`Network request failed. Please check your internet connection.`);
        }

        if (!response.ok) {
            const status = response.status;
            const statusText = response.statusText;
            const requestedUrl = response.url; // Get the actual URL requested

            if (status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
                const resetTimeEpoch = parseInt(response.headers.get('X-RateLimit-Reset')) * 1000;
                const resetTime = new Date(resetTimeEpoch).toLocaleTimeString();
                console.warn(`GitHub API rate limit exceeded for URL: ${requestedUrl}`);
                throw new Error(`GitHub API rate limit exceeded. Try again after ${resetTime}.`);
            } else if (status === 404) {
                console.warn(`GitHub API 404 Not Found for URL: ${requestedUrl}`);
                // Extract a more user-friendly path if possible, otherwise show URL
                const pathPart = requestedUrl.includes('/repos/') ? requestedUrl.split('/repos/')[1] : requestedUrl;
                throw new Error(`Error: Repository or path not found: ${pathPart}`);
            } else {
                console.warn(`GitHub API error for URL ${requestedUrl}: ${status} ${statusText}`);
                throw new Error(`GitHub API Error: ${status} ${statusText}.`);
            }
        }
        return await response.json();
    }

    // Helper to get raw file content
    async function fetchRawGitHubContent(owner, repoName, path, branch = 'main') {
        const url = `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${path}`;
        let response;
        try {
            response = await fetch(url);
        } catch (networkError) {
            console.error("Network error fetching raw GitHub content:", networkError);
            throw new Error(`Network request failed. Please check your internet connection.`);
        }

        if (!response.ok) {
            const status = response.status;
            const statusText = response.statusText;
            if (status === 404) {
                console.warn(`Raw content 404 Not Found for URL: ${url}`);
                throw new Error(`Error: File not found: ${owner}/${repoName}/${path}`);
            } else {
                console.warn(`Raw content error for URL ${url}: ${status} ${statusText}`);
                throw new Error(`Error fetching file: ${status} ${statusText}.`);
            }
        }
        return await response.text();
    }



    function showTerminalFromModal() {
        if(activeCommandInput) activeCommandInput.disabled = false;
        modalView.style.display = 'none';
        modalNanoHeader.style.display = 'none'; 
        modalContentWrapper.classList.remove('vi-mode', 'nano-mode', 'less-mode');
        currentView = null;
        if(activeCommandInput) {
            attemptFocus(activeCommandInput);
        }
        scrollToBottom(); 
    }


    const commandHelp = {
        help: { description: "Show this help message." },
        '?': { description: "Alias for help. Show available commands." },
        ls: { description: "List directory contents (blog posts).", usage: "ls [-lt]", details: "Lists available blog posts. By default, posts are listed alphabetically.\n  -lt : List in long format, sorted by last modification time (newest first)." },
        cat: { description: "Display post content (rendered Markdown) in the terminal.", usage: "cat <filename>", details: "Displays the content of the specified blog post, parsed as Markdown with syntax highlighting, directly in the terminal output area. Code snippets will have a 'Copy' button." },
        less: { description: "View post content in a scrollable pane.", usage: "less <filename>", details: "Displays post content (rendered Markdown) in a modal, scrollable view. Code snippets will have a 'Copy' button. Use arrow keys, PageUp/Down, Home/End, or Space to scroll. Press 'q' to quit." },
        vi: { description: "Simulate the Vi text editor (read-only).", usage: "vi <filename>", details: "Opens the post's raw Markdown content in a simulated Vi editor (read-only) with line numbers. A 'Copy All' button is available. Press 'q' to quit." },
        nano: { description: "Simulate the Nano text editor (read-only).", usage: "nano <filename>", details: "Opens the post's raw Markdown content in a simulated Nano editor (read-only) with a header. A 'Copy All' button is available. Press 'q' to quit." },
        man: { description: "Display the manual page for a command.", usage: "man <command>", details: "Shows detailed information about the specified command." },
        history: { description: "Show command history." },
        clear: { description: "Clear the terminal screen output." },
        whoami: { description: "Print effective userid (guest)." },
        date: { description: "Print the current date and time." },
        echo: { description: "Display a line of text.", usage: "echo [text ...]", details: "Prints the arguments to the output." },
        fortune: { description: "Display a random wisdom or quote." },
        exit: { description: "Reset the terminal session." },
        sl: { description: "Steam Locomotive. A bit of fun!", usage: "sl", details: "Displays a delightful steam locomotive animation." },
        cowsay: { description: "Display an ASCII cow saying a message.", usage: "cowsay <message>", details: "The cow will say whatever message you provide." },
        sudo: { description: "Execute a command as another user (simulated)." },
        toggletui: { description: "Toggle between CLI and TUI mode.", usage: "toggletui" }
    };

    const commands = {
        help: () => {
            displayOutput("Available commands:");
            Object.keys(commandHelp).sort().forEach(cmdKey => {
                const helpEntry = commandHelp[cmdKey];
                if (helpEntry) { displayOutput(`  ${cmdKey.padEnd(15)} - ${helpEntry.description}`);}
            });
            displayOutput("Use 'man <command>' for more details.");
        },
        '?': () => commands.help(),
        // Inside const commands = { ... }

        // Helper function to format date as "Mon DD YYYY"
        formatDateForLs: (dateString) => {
            const date = new Date(dateString);
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const month = months[date.getMonth()];
            const day = String(date.getDate()).padStart(2, ' '); // Keep space for single digit days if not padding with 0
            const year = date.getFullYear();
            return `${month} ${day} ${year}`;
        },

        // Helper function to format size in bytes to human-readable KB
        formatSizeForLs: (bytes) => {
            if (bytes === undefined || bytes === null) return '0.0KB';
            const kilobytes = bytes / 1024;
            return kilobytes.toFixed(1) + 'KB';
        },

        // Original ls logic, now renamed to lsPosts
        lsPosts: (args) => {
        if (!postsManifest || postsManifest.length === 0) {
            displayOutput("No posts found. (Is posts.json loaded?)");
            return;
        }
        displayOutput("Posts in /posts:"); // Header for ls posts

        let postsToDisplay = [...postsManifest];

        const showLongFormat = args.includes('-l') || args.includes('-lt') || args.includes('-tl');
        const sortByTime = args.includes('-t') || args.includes('-lt') || args.includes('-tl');

        if (sortByTime) {
            postsToDisplay.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
        } else {
            postsToDisplay.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (postsToDisplay.length === 0) {
            displayOutput("  No posts available.");
            return;
        }

        if (showLongFormat) {
            // Determine max size length for padding
            let maxSizeStrLength = 0;
            postsToDisplay.forEach(p => {
                const sizeStr = commands.formatSizeForLs(p.size);
                if (sizeStr.length > maxSizeStrLength) {
                    maxSizeStrLength = sizeStr.length;
                }
            });

            postsToDisplay.forEach(p => {
                const dateStr = commands.formatDateForLs(p.lastModified);
                const sizeStr = commands.formatSizeForLs(p.size).padStart(maxSizeStrLength, ' ');
                // Example: Oct 26 2023 1.5KB   hello-world.md
                // Date (11) Space Size (maxSizeStrLength) Spaces (3) Name
                displayOutput(`  ${dateStr} ${sizeStr}   ${p.name}`);
            });
        } else {
            postsToDisplay.forEach(p => displayOutput(`  ${p.name}`));
        }
    },

    // New ls command for top-level directory listing
    // Inside const commands = { ... }

    // Make ls function asynchronous
    ls: async (args) => {
        if (args.length === 0) {
            displayOutput("posts/");
            displayOutput("repos/");
            return;
        }

        // Normalize the first argument for routing
        let firstArgNormalized = args[0].toLowerCase();
        if (firstArgNormalized === 'posts/') {
            firstArgNormalized = 'posts';
        } else if (firstArgNormalized === 'repo/') {
            firstArgNormalized = 'repo';
        } else if (firstArgNormalized === 'repos/') { // Treat "repos/" as "repo" for routing
            firstArgNormalized = 'repo';
        }
        // Note: 'repos' (no slash) is also treated as 'repo' below.

        // Routing based on the normalized first argument
        if (firstArgNormalized === 'posts') {
            // lsPosts handles flags from the full 'args' array.
            // e.g., if input `ls posts/ -l`, original args `['posts/', '-l']` are passed.
            // lsPosts will correctly interpret `args[0]` for context and flags.
            await commands.lsPosts(args); 
        } else if (firstArgNormalized === 'repo' || firstArgNormalized === 'repos') {
            // Handles `ls repo <path>`, `ls repo -l`, `ls repos <path>`
            // `args.slice(1)` passes the correct arguments to lsrepos (e.g., `['<path>', '-l']` or `['-l']` or `[]`)
            await commands.lsrepos(args.slice(1));
        } else if (firstArgNormalized.startsWith('repo/') || firstArgNormalized.startsWith('repos/')) {
            // Handles `ls repo/path` or `ls repos/path` where the path is part of args[0].
            // lsrepos expects args like `['my-repo/src', '-l']`. Original `args` is already in this format.
            await commands.lsrepos(args); 
        } else {
            // Fallback for cases like `ls -l` (should list root) or invalid arguments.
            // If all arguments are flags (e.g., "ls -l", "ls -lt"), treat as root listing.
            if (args.every(arg => arg.startsWith('-'))) {
                 displayOutput("posts/");
                 displayOutput("repos/");
                 // TODO: Future enhancement could make `ls -l` at root apply long format.
                 return;
            }
            displayOutput(`Usage: ls [posts|repo[/path]] [-lt] or ls posts [-lt]`, 'error');
        }
    },
        cat: async (args) => {
            if (args.length === 0) { displayOutput("Usage: cat <filename>", 'error'); return; }
            let filenameInput = args[0];
            let actualFilename = filenameInput;

            if (filenameInput.toLowerCase().startsWith('posts/')) {
                actualFilename = filenameInput.substring('posts/'.length);
            }

            // Ensure actualFilename is not empty after stripping (e.g. user typed "cat posts/")
            if (!actualFilename) {
                displayOutput(`cat: ${filenameInput}: Is a directory or invalid path`, 'error');
                return;
            }
            
            const post = postsManifest.find(p => p.name === actualFilename);
            if (!post) { displayOutput(`cat: ${filenameInput}: No such file or directory`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${actualFilename}`);
                if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                const markdownContent = await response.text();
                const tempRenderDiv = document.createElement('div');
                // Wrap with .markdown-content for specific styling before adding to DOM
                const markdownContainer = document.createElement('div');
                markdownContainer.className = 'markdown-content';
                markdownContainer.innerHTML = marked.parse(markdownContent);
                tempRenderDiv.appendChild(markdownContainer);

                tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                addCopyButtonsToCodeBlocks(tempRenderDiv); // Pass the element containing <pre> tags
                
                displayOutput(tempRenderDiv.innerHTML, 'rawhtml'); // Output the whole processed content
            } catch (error) { displayOutput(`cat: ${filenameInput}: ${error.message}`, 'error'); }
        },
        less: async (args) => {
            if (args.length === 0) { displayOutput("Usage: less <filename>", 'error'); return; }
            let filenameInput = args[0];
            let actualFilename = filenameInput;

            if (filenameInput.toLowerCase().startsWith('posts/')) {
                actualFilename = filenameInput.substring('posts/'.length);
            }
            
            if (!actualFilename) {
                displayOutput(`less: ${filenameInput}: Is a directory or invalid path`, 'error');
                return;
            }

            const post = postsManifest.find(p => p.name === actualFilename);
            if (!post) { displayOutput(`less: ${filenameInput}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${actualFilename}`);
                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                const markdownContent = await response.text();
                const tempRenderDiv = document.createElement('div');
                // Wrap with .markdown-content for specific styling
                const markdownContainer = document.createElement('div');
                markdownContainer.className = 'markdown-content';
                markdownContainer.innerHTML = marked.parse(markdownContent);
                tempRenderDiv.appendChild(markdownContainer);

                tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                addCopyButtonsToCodeBlocks(tempRenderDiv); // Add buttons to the content destined for modal

                currentView = 'less';
                modalContentWrapper.classList.remove('vi-mode', 'nano-mode');
                modalNanoHeader.style.display = 'none';
                modalContent.innerHTML = tempRenderDiv.innerHTML; // Set modal content
                modalFooter.innerHTML = `${filenameInput} (Press 'q' to quit, Arrows/PgUp/PgDn/Home/End/Space to scroll)`;
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`less: ${filenameInput}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
        },
        vi: async (args) => {
            if (args.length === 0) { displayOutput("Usage: vi <filename>", 'error'); return; }
            let filenameInput = args[0];
            let actualFilename = filenameInput;

            if (filenameInput.toLowerCase().startsWith('posts/')) {
                actualFilename = filenameInput.substring('posts/'.length);
            }

            if (!actualFilename) {
                displayOutput(`vi: ${filenameInput}: Is a directory or invalid path`, 'error');
                return;
            }

            const post = postsManifest.find(p => p.name === actualFilename);
            if (!post) { displayOutput(`vi: ${filenameInput}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${actualFilename}`);
                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                const textContent = await response.text();
                const lines = textContent.split('\n');
                let viFormattedContent = "";
                lines.forEach((line, index) => { viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3,' ')}</span>${escapeHtml(line)}\n`; });
                currentView = 'vi';
                modalContentWrapper.classList.add('vi-mode'); modalContentWrapper.classList.remove('nano-mode', 'less-mode');
                modalNanoHeader.style.display = 'none';
                modalContent.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                
                modalFooter.innerHTML = `"${filenameInput}" [readonly] (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (vi):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);

                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`vi: ${filenameInput}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
        },
        nano: async (args) => {
            if (args.length === 0) { displayOutput("Usage: nano <filename>", 'error'); return; }
            let filenameInput = args[0];
            let actualFilename = filenameInput;
            
            if (filenameInput.toLowerCase().startsWith('posts/')) {
                actualFilename = filenameInput.substring('posts/'.length);
            }

            if (!actualFilename) {
                displayOutput(`nano: ${filenameInput}: Is a directory or invalid path`, 'error');
                return;
            }

            const post = postsManifest.find(p => p.name === actualFilename);
            if (!post) { displayOutput(`nano: ${filenameInput}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${actualFilename}`);
                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                const textContent = await response.text();
                currentView = 'nano';
                modalContentWrapper.classList.add('nano-mode'); modalContentWrapper.classList.remove('vi-mode', 'less-mode');
                modalNanoHeader.textContent = `GNU nano (simulated)  File: ${filenameInput}`;
                modalNanoHeader.style.display = 'block';
                modalContent.innerHTML = `<div style="white-space: pre;">${escapeHtml(textContent)}</div>`;

                modalFooter.innerHTML = `^X Exit (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (nano):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);
                
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`nano: ${filenameInput}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
        },
        sl: async () => {
            const trainFrames = [
                "                                Railway Conductor",
                "                                 OO ---------      ",
                "                                // ||       ||      ",
                "               ================OO JS Railways OO===============",
                "             //                                              \\\\",
                "            //                                                \\\\",
                "           ||     OO    OO    OO    OO    OO    OO    OO     ||",
                "           ||_________________________________________________||",
                "            \\_________________________________________________/",
                "                OO                                       OO",
                "                         CHOO CHOO - TERMINAL EXPRESS!"
            ];
            let slFrameContainer = outputContainer.querySelector('.sl-animation-frame-container');
            if (!slFrameContainer) {
                slFrameContainer = document.createElement('div');
                slFrameContainer.className = 'sl-animation-frame-container'; // For potential styling
                 // Insert before current input line
                if (currentInputLineDiv && outputContainer.contains(currentInputLineDiv)) {
                    outputContainer.insertBefore(slFrameContainer, currentInputLineDiv);
                } else {
                    outputContainer.appendChild(slFrameContainer);
                }
            }
            slFrameContainer.innerHTML = ''; // Clear previous frame if any

            const frameDiv = document.createElement('div'); 
            frameDiv.className = 'sl-animation-frame'; // Use this class for the actual text
            slFrameContainer.appendChild(frameDiv);
            
            let padding = 70; 
            if (activeCommandInput) activeCommandInput.disabled = true;
            let animationFinished = false;

            slInterval = setInterval(() => {
                padding -= 2; 
                let frameString = trainFrames.map(line => ' '.repeat(Math.max(0, padding)) + line).join('\n');
                frameDiv.textContent = frameString;
                scrollToBottom(); // Keep train in view as it animates
                
                const approxTrainWidth = Math.max(...trainFrames.map(l => l.length));
                if (padding < -approxTrainWidth -10) { 
                    clearInterval(slInterval);
                    slInterval = null;
                    if (slFrameContainer) slFrameContainer.remove(); // Clean up
                    if (activeCommandInput) activeCommandInput.disabled = false;
                    animationFinished = true;
                    createNewInputLine(); // Create new prompt only after SL finishes
                }
            }, 100); 
        },
        cowsay: (args) => {
            const message = args.join(' ') || "Moo!";
            const maxLineLength = 35;
            const lines = [];
            let currentLine = "";
            message.split(/\s+/).forEach(word => {
                if (word.length > maxLineLength) { 
                    if (currentLine.length > 0) { lines.push(currentLine.trim()); currentLine = ""; }
                    for(let i=0; i < word.length; i += maxLineLength) {
                        lines.push(word.substring(i, i + maxLineLength));
                    }
                } else if ((currentLine + word).length > maxLineLength && currentLine.length > 0) {
                    lines.push(currentLine.trim());
                    currentLine = word + " ";
                } else {
                    currentLine += word + " ";
                }
            });
            lines.push(currentLine.trim());

            const bubbleWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
            let bubble = " " + "_".repeat(bubbleWidth + 2) + " \n";
            if (lines.length === 1) {
                bubble += `< ${lines[0].padEnd(bubbleWidth)} >\n`;
            } else {
                bubble += `/ ${lines[0].padEnd(bubbleWidth)} \\\n`;
                for (let i = 1; i < lines.length - 1; i++) {
                    bubble += `| ${lines[i].padEnd(bubbleWidth)} |\n`;
                }
                bubble += `\\ ${lines[lines.length - 1].padEnd(bubbleWidth)} /\n`;
            }
            bubble += " " + "-".repeat(bubbleWidth + 2) + " \n";
            const cow = `        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`;
            displayOutput(bubble + cow, 'cowsay-output');
        },
        man: (args) => { /* ... (same as before, using commandHelp) ... */ },
        history: () => { /* ... (same as before) ... */ },
        clear: () => { outputContainer.innerHTML = ''; },
        whoami: () => { displayOutput("guest"); },
        date: () => { displayOutput(new Date().toString()); },
        echo: (args) => { displayOutput(args.join(' ')); },
        fortune: () => { displayOutput(fortunes[Math.floor(Math.random() * fortunes.length)]); },
        exit: () => {
            displayOutput("Resetting terminal session...", 'success');
            setTimeout(() => { init(); }, 300);
        },
        sudo: (args) => { 
            if(args.join(' ')==='rm -rf /'){displayOutput("Nice try... But this is a client-side simulation! 😉",'error');}else{displayOutput("sudo: you are not the superuser here.",'error');}
        },
        toggletui: () => {
            const tuiModeContainer = document.getElementById('tui-mode-container');
            if (!terminal || !tuiModeContainer) {
                displayOutput("Error: UI elements not found for TUI toggle.", 'error');
                return;
            }

            if (terminal.style.display !== 'none') { // Switching TO TUI
                terminal.style.display = 'none';
                tuiModeContainer.style.display = 'grid'; // Or your chosen display style
                currentView = 'tui';
        
                if (!isTuiSidebarPopulated) { // Check if already populated
                    populateTuiSidebar();
                }
                if (tuiSidebarItems.length > 0) {
                    // If currentTuiFocusIndex is -1 or invalid, reset to 0
                    if (currentTuiFocusIndex < 0 || currentTuiFocusIndex >= tuiSidebarItems.length) {
                        currentTuiFocusIndex = 0;
                    }
                    tuiSidebarItems[currentTuiFocusIndex].focus();
                }
                updateTuiStatusBar("Switched to TUI mode. Use Arrow keys to navigate commands."); // Update status
                document.addEventListener('keydown', handleTuiKeyDown); // ADD THIS
            } else { // Switching FROM TUI (back to CLI)
                tuiModeContainer.style.display = 'none';
                terminal.style.display = ''; // Revert to default
                currentView = null;
                document.removeEventListener('keydown', handleTuiKeyDown); // ADD THIS
                if (activeCommandInput) {
                    attemptFocus(activeCommandInput);
                }
                displayOutput("Switched back to CLI mode."); // This will go to the CLI output
            }
            // scrollToBottom(); // May or may not be needed depending on TUI scroll behavior
        },
        // New lsrepos command
        lsrepos: async (args) => {
            const owner = 'robertovacirca';
            // Determine if we are listing all repos or a specific one.
            // If args[0] is a flag, or args is empty, we list all repos.
            const isListingAllRepos = args.length === 0 || (args[0] && args[0].startsWith('-'));
            
            if (isListingAllRepos) {
                displayOutput("Repositories in /repo:");
                const showLongFormat = args.includes('-l') || args.includes('-lt') || args.includes('-tl');
                const sortByTime = args.includes('-t') || args.includes('-lt') || args.includes('-tl');
                
                showLoadingSuggestions(outputContainer, currentInputLineDiv); // Show loading before API call
                let repos;
                try {
                    repos = await fetchGitHubApi(`https://api.github.com/users/${owner}/repos`);
                    
                    // Add Array.isArray check here
                    if (!Array.isArray(repos)) {
                        console.error('lsrepos: fetchGitHubApi did not return an array for all repos. Response:', repos);
                        displayOutput("Error: Could not retrieve a valid list of repositories.", "error");
                        // No further processing if repos is not an array
                    } else if (repos.length === 0) {
                        displayOutput(`  No public repositories found for ${owner}.`);
                    } else { // Process only if repos is an array and not empty
                        if (sortByTime) {
                            repos.sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());
                        } else {
                            repos.sort((a, b) => a.name.localeCompare(b.name));
                        }

                        if (showLongFormat) {
                            let maxLangLen = 0;
                            let maxStarsLen = 0;
                            repos.forEach(repo => {
                                const lang = repo.language || "N/A";
                                if (lang.length > maxLangLen) maxLangLen = lang.length;
                                const stars = String(repo.stargazers_count);
                                if (stars.length > maxStarsLen) maxStarsLen = stars.length;
                            });

                            repos.forEach(repo => {
                                const dateStr = commands.formatDateForLs(repo.pushed_at);
                                const langStr = (repo.language || "N/A").padEnd(maxLangLen, ' ');
                                const starsStr = String(repo.stargazers_count).padStart(maxStarsLen, ' ');
                                displayOutput(`  ${dateStr} ${langStr} ★${starsStr}   ${repo.name}/`);
                            });
                        } else {
                            repos.forEach(repo => {
                                displayOutput(`  ${repo.name}/`);
                            });
                        }
                    }
                } catch (error) {
                    // Error message already includes "Error:" prefix from fetch helpers
                    displayOutput(`${error.message}`, 'error');
                } finally {
                    hideLoadingSuggestions(); // Hide loading after API call completes or fails
                }
            } else {
                // Listing contents of a specific repository or a path within it.
                // args[0] could be "my-repo/src", "repo/my-repo/src", or "repos/my-repo/src"
                // It could also be just "my-repo"
                let fullPathArg = args[0]; 
                let userProvidedPathForMessage = fullPathArg; // Save for error messages using 'repo/' prefix

                // Normalize fullPathArg to remove "repo/" or "repos/" prefix for consistent parsing
                let normalizedPath = fullPathArg;
                if (normalizedPath.toLowerCase().startsWith('repo/')) {
                    normalizedPath = normalizedPath.substring('repo/'.length);
                    userProvidedPathForMessage = 'repo/' + normalizedPath; // Ensure error message uses 'repo/'
                } else if (normalizedPath.toLowerCase().startsWith('repos/')) {
                    normalizedPath = normalizedPath.substring('repos/'.length);
                    userProvidedPathForMessage = 'repo/' + normalizedPath; // Standardize to 'repo/' for error
                } else {
                    // If no prefix, assume it's like 'my-repo/path', so prepend 'repo/' for error consistency
                    userProvidedPathForMessage = 'repo/' + normalizedPath;
                }


                const pathParts = normalizedPath.split('/');
                const repoName = pathParts[0];
                const pathWithinRepo = pathParts.slice(1).join('/');
                
                const displayPath = `${owner}/${repoName}${pathWithinRepo ? '/' + pathWithinRepo : ''}`;
                // Header `Contents of ${displayPath}:` is shown only if it's a directory.
                
                showLoadingSuggestions(outputContainer, currentInputLineDiv); // Show loading
                let contents;
                try {
                    // fullPathArg is the first argument passed to lsrepos, e.g., "my-repo/src/file.js" or "my-repo"
                    // It could also contain flags if ls repos -l was called, but isListingAllRepos handles that.
                    contents = await fetchGitHubApi(`https://api.github.com/repos/${owner}/${repoName}/contents/${pathWithinRepo}`);

                    // Check if the path is a file first
                    if (contents && typeof contents === 'object' && !Array.isArray(contents) && contents.type === 'file') {
                        const userPathForFileError = `repo/${repoName}${pathWithinRepo ? '/' + pathWithinRepo : ''}`;
                        displayOutput(`ls: cannot access '${userPathForFileError}': It is a file. Use 'cat' or 'less' to view its content.`, 'error');
                    } else if (Array.isArray(contents)) { // It's a directory listing
                        displayOutput(`Contents of ${displayPath}:`); // Display header only for actual directories
                        if (contents.length === 0) {
                            displayOutput(`  Directory ${displayPath} is empty.`);
                        } else {
                            contents.sort((a, b) => {
                                if (a.type === 'dir' && b.type !== 'dir') return -1;
                                if (a.type !== 'dir' && b.type === 'dir') return 1;
                                return a.name.localeCompare(b.name);
                            });

                            contents.forEach(item => {
                                const typeIndicator = item.type === 'dir' ? '/' : '';
                                displayOutput(`  ${item.name}${typeIndicator}`);
                            });
                        }
                    } else {
                        // This case handles errors where 'contents' is not an array (and not a file object),
                        // or if fetchGitHubApi threw an error that wasn't caught (though it should have been).
                        // The fetchGitHubApi should have already thrown a specific error for 404s.
                        // This can act as a fallback if contents is unexpectedly undefined or not an object/array.
                         displayOutput(`Error: Could not list contents of ${displayPath}. Path may be invalid or an unexpected error occurred.`, 'error');
                    }
                } catch (error) {
                     displayOutput(`${error.message}`, 'error'); // Error from fetchGitHubApi (404, rate limit, etc.)
                } finally {
                    hideLoadingSuggestions();
                }
            }
        },

        // New catrepos command
        catrepos: async (reposName, filePath) => {
            const owner = 'robertovacirca';
            if (!reposName || !filePath) { // filePath being empty means it's not a valid file path for cat
                displayOutput(`Usage: cat repo/<repo_name>/<file_path>`, 'error');
                return;
            }
            
            showLoadingSuggestions(outputContainer, currentInputLineDiv); // Show loading
            try {
                // The message "Workspaceing raw content..." is not ideal, removing it for cleaner loading.
                // displayOutput(`Workspaceing raw content of ${owner}/${reposName}/${filePath}...`); 
                const fileContent = await fetchRawGitHubContent(owner, reposName, filePath);

                const tempRenderDiv = document.createElement('div');
                const markdownContainer = document.createElement('div');
                markdownContainer.className = 'markdown-content';

                // Check if it's a Markdown file by extension
                if (filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown')) {
                    markdownContainer.innerHTML = marked.parse(fileContent);
                } else {
                    // For other file types, display as pre-formatted text (like a code file)
                    // You might want to add syntax highlighting based on file extension here
                    const fileExtension = filePath.split('.').pop();
                    const languageMap = {
                        'js': 'javascript', 'py': 'python', 'sh': 'bash', 'c': 'c', 'cpp': 'cpp', 'lua': 'lua', 'ts': 'typescript'
                    };
                    const lang = languageMap[fileExtension] || 'plaintext'; // Default to plaintext

                    // Create a pre-code structure for highlighting
                    const pre = document.createElement('pre');
                    const code = document.createElement('code');
                    code.classList.add(`language-${lang}`);
                    code.textContent = fileContent; // Use textContent to avoid HTML injection issues
                    pre.appendChild(code);
                    markdownContainer.appendChild(pre);
                }
                
                tempRenderDiv.appendChild(markdownContainer);
                tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                addCopyButtonsToCodeBlocks(tempRenderDiv);
                displayOutput(tempRenderDiv.innerHTML, 'rawhtml');

            } catch (error) {
                displayOutput(`${error.message}`, 'error');
            } finally {
                hideLoadingSuggestions();
            }
        },

        lessrepos: async (reposName, filePath) => {
            const owner = 'robertovacirca';
            if (!reposName || !filePath) {
                displayOutput(`Usage: less repo/<repo_name>/<file_path>`, 'error');
                return;
            }
            showLoadingSuggestions(outputContainer, currentInputLineDiv);
            try {
                const fileContent = await fetchRawGitHubContent(owner, reposName, filePath);
                const tempRenderDiv = document.createElement('div');
                const markdownContainer = document.createElement('div');
                markdownContainer.className = 'markdown-content';
                if (filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown')) {
                    markdownContainer.innerHTML = marked.parse(fileContent);
                } else {
                    const fileExtension = filePath.split('.').pop();
                    const languageMap = { 'js': 'javascript', 'py': 'python', 'sh': 'bash', 'c': 'c', 'cpp': 'cpp', 'lua': 'lua', 'ts': 'typescript' };
                    const lang = languageMap[fileExtension] || 'plaintext';
                    const pre = document.createElement('pre');
                    const code = document.createElement('code');
                    code.classList.add(`language-${lang}`);
                    code.textContent = fileContent;
                    pre.appendChild(code);
                    markdownContainer.appendChild(pre);
                }
                tempRenderDiv.appendChild(markdownContainer);
                tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                addCopyButtonsToCodeBlocks(tempRenderDiv);

                currentView = 'less';
                modalContentWrapper.classList.remove('vi-mode', 'nano-mode');
                modalNanoHeader.style.display = 'none';
                modalContent.innerHTML = tempRenderDiv.innerHTML;
                modalFooter.innerHTML = `${owner}/${reposName}/${filePath} (Press 'q' to quit, Arrows/PgUp/PgDn/Home/End/Space to scroll)`;
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { 
                displayOutput(`${error.message}`, 'error'); 
                if(activeCommandInput) activeCommandInput.disabled = false; 
            } finally {
                hideLoadingSuggestions();
            }
        },

        virepos: async (reposName, filePath) => {
            const owner = 'robertovacirca';
            if (!reposName || !filePath) {
                displayOutput(`Usage: vi repo/<repo_name>/<file_path>`, 'error');
                return;
            }
            showLoadingSuggestions(outputContainer, currentInputLineDiv);
            try {
                const textContent = await fetchRawGitHubContent(owner, reposName, filePath);
                const lines = textContent.split('\n');
                let viFormattedContent = "";
                lines.forEach((line, index) => { viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3,' ')}</span>${escapeHtml(line)}\n`; });
                currentView = 'vi';
                modalContentWrapper.classList.add('vi-mode'); modalContentWrapper.classList.remove('nano-mode', 'less-mode');
                modalNanoHeader.style.display = 'none';
                modalContent.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                
                modalFooter.innerHTML = `"${owner}/${reposName}/${filePath}" [readonly] (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (vi):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);

                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { 
                displayOutput(`${error.message}`, 'error'); 
                if(activeCommandInput) activeCommandInput.disabled = false; 
            } finally {
                hideLoadingSuggestions();
            }
        },

        nanorepos: async (reposName, filePath) => {
            const owner = 'robertovacirca';
            if (!reposName || !filePath) {
                displayOutput(`Usage: nano repo/<repo_name>/<file_path>`, 'error');
                return;
            }
            showLoadingSuggestions(outputContainer, currentInputLineDiv);
            try {
                const textContent = await fetchRawGitHubContent(owner, reposName, filePath);
                currentView = 'nano';
                modalContentWrapper.classList.add('nano-mode'); modalContentWrapper.classList.remove('vi-mode', 'less-mode');
                modalNanoHeader.textContent = `GNU nano (simulated)  File: ${owner}/${reposName}/${filePath}`;
                modalNanoHeader.style.display = 'block';
                modalContent.innerHTML = `<div style="white-space: pre;">${escapeHtml(textContent)}</div>`;

                modalFooter.innerHTML = `^X Exit (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (nano):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);
                
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { 
                displayOutput(`${error.message}`, 'error'); 
                if(activeCommandInput) activeCommandInput.disabled = false; 
            } finally {
                hideLoadingSuggestions();
            }
        },
    };

    let loadingMessageDiv = null;
    function showLoadingSuggestions(outputContainerRef, currentInputLineDivRef) {
        if (loadingMessageDiv) return; 
        loadingMessageDiv = document.createElement('div');
        loadingMessageDiv.className = 'command-output-item loader-message';
        loadingMessageDiv.textContent = 'Fetching suggestions...';
        if (currentInputLineDivRef && outputContainerRef.contains(currentInputLineDivRef)) {
            outputContainerRef.insertBefore(loadingMessageDiv, currentInputLineDivRef);
        } else {
            outputContainerRef.appendChild(loadingMessageDiv);
        }
        scrollToBottom(); // Ensure it's visible
    }

    function hideLoadingSuggestions() {
        if (loadingMessageDiv && loadingMessageDiv.parentNode) {
            loadingMessageDiv.parentNode.removeChild(loadingMessageDiv);
        }
        loadingMessageDiv = null;
    }

    function attemptFocus(element) {
        if (!element) return;
    
        try {
            if (document.hasFocus()) {
                element.focus({ preventScroll: true });
            } else {
                // Defer focus until the document gains focus again
                const handleFocus = () => {
                    element.focus({ preventScroll: true });
                    window.removeEventListener('focus', handleFocus);
                };
                window.addEventListener('focus', handleFocus);
            }
        } catch (e) {
            console.warn('attemptFocus failed:', e);
        }
    }
    
    document.addEventListener('click', e => {
        if (e.target.classList.contains('code-copy-button')) {
            console.log('Delegated click handler triggered!', e.target);
            const wrapper = e.target.closest('.code-block-wrapper');
            const code = wrapper?.querySelector('pre code');
    
            if (code) {
                const text = code.innerText;
                console.log('Copying text:', text);
                navigator.clipboard.writeText(text).then(() => {
                    console.log('Text copied successfully.');
                    e.target.textContent = 'Copied!';
                    setTimeout(() => e.target.textContent = 'Copy', 2000);
                }).catch(err => {
                    console.error('Clipboard write failed:', err);
                    e.target.textContent = 'Error';
                });
            } else {
                console.warn('No <code> element found to copy.');
                e.target.textContent = 'Error';
            }
        }
    });
    
    function scrollToBottom() {
        setTimeout(() => {
            if (outputContainer) outputContainer.scrollTop = outputContainer.scrollHeight;
        }, 0);
    }

    function createNewInputLine() {
        if (activeCommandInput && activeCommandInput._keydownListener) {
            activeCommandInput.removeEventListener('keydown', activeCommandInput._keydownListener);
            activeCommandInput._keydownListener = null;
        }

        currentInputLineDiv = document.createElement('div');
        currentInputLineDiv.className = 'input-line command-output-item';

        const promptSpan = document.createElement('span');
        promptSpan.className = 'prompt';
        promptSpan.textContent = 'guest@terminal:~$';
        currentInputLineDiv.appendChild(promptSpan);

        activeCommandInput = document.createElement('input');
        activeCommandInput.type = 'text';
        // activeCommandInput.autofocus = true; // Replaced by attemptFocus
        currentInputLineDiv.appendChild(activeCommandInput);

        outputContainer.appendChild(currentInputLineDiv);

        activeCommandInput._keydownListener = handleCommandInputKeydown;
        activeCommandInput.addEventListener('keydown', activeCommandInput._keydownListener);

        attemptFocus(activeCommandInput);
        scrollToBottom();
    }

    function handleTuiKeyDown(e) {
        if (!tuiSidebarItems || tuiSidebarItems.length === 0) return; // No items to navigate
    
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentTuiFocusIndex++;
            if (currentTuiFocusIndex >= tuiSidebarItems.length) {
                currentTuiFocusIndex = 0; // Wrap around
            }
            tuiSidebarItems[currentTuiFocusIndex].focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentTuiFocusIndex--;
            if (currentTuiFocusIndex < 0) {
                currentTuiFocusIndex = tuiSidebarItems.length - 1; // Wrap around
            }
            tuiSidebarItems[currentTuiFocusIndex].focus();
        }
        // 'Enter' is handled by the item's own keydown listener.
    }

    function handleGlobalKeyPress(e) { 
        if (!['less', 'vi', 'nano'].includes(currentView)) return;
        if (!currentView) return; 
        const key = e.key.toLowerCase();

        if (key === 'q' && ['less', 'vi', 'nano'].includes(currentView)) {
            e.preventDefault(); showTerminalFromModal();
        } else if (currentView === 'less') { 
            const scrollAmount = 40; 
            const pageScrollAmount = modalContent.clientHeight * 0.85;
            if (key === 'arrowdown') { e.preventDefault(); modalContent.scrollTop += scrollAmount; }
            else if (key === 'arrowup') { e.preventDefault(); modalContent.scrollTop -= scrollAmount; }
            else if (key === 'pagedown' || key === ' ') { e.preventDefault(); modalContent.scrollTop += pageScrollAmount; }
            else if (key === 'pageup' || key === 'b') { e.preventDefault(); modalContent.scrollTop -= pageScrollAmount; }
            else if (key === 'home' || (key === 'g' && !e.shiftKey) ) { e.preventDefault(); modalContent.scrollTop = 0; } 
            else if (key === 'end' || (key === 'g' && e.shiftKey) ) { e.preventDefault(); modalContent.scrollTop = modalContent.scrollHeight; }
        }
    }

    function escapeHtml(str) { 
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    async function displayTuiFileContent(repoName, filePath) {
        if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
        tuiMainOutputElement.innerHTML = '<div>Loading file...</div>';
        updateTuiStatusBar(`Displaying: ${repoName}/${filePath}`);
        tuiMainOutputElement.scrollTop = 0;

        try {
            const fileContent = await fetchRawGitHubContent('robertovacirca', repoName, filePath);
            tuiMainOutputElement.innerHTML = ''; // Clear loading message

            const tempRenderDiv = document.createElement('div');
            const contentContainer = document.createElement('div'); // General container

            if (filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown')) {
                contentContainer.className = 'markdown-content';
                contentContainer.innerHTML = marked.parse(fileContent);
            } else {
                // For other file types, display as pre-formatted text
                const fileExtension = filePath.split('.').pop().toLowerCase();
                const languageMap = {
                    'js': 'javascript', 'py': 'python', 'sh': 'bash', 'c': 'c', 'cpp': 'cpp', 
                    'lua': 'lua', 'ts': 'typescript', 'html': 'html', 'css': 'css', 'json': 'json',
                    'rb': 'ruby', 'java': 'java', 'php': 'php', 'go': 'go', 'rs': 'rust', 'kt': 'kotlin',
                    'swift': 'swift', 'yml': 'yaml', 'xml': 'xml'
                    // Add more mappings as needed
                };
                const lang = languageMap[fileExtension] || 'plaintext';

                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.classList.add(`language-${lang}`);
                code.textContent = fileContent;
                pre.appendChild(code);
                contentContainer.appendChild(pre);
            }
            
            tempRenderDiv.appendChild(contentContainer);
            tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
            addCopyButtonsToCodeBlocks(tempRenderDiv); // Ensure this works with the new structure
            
            tuiMainOutputElement.appendChild(tempRenderDiv); // Append processed content

        } catch (error) {
            tuiMainOutputElement.innerHTML = `<div class="error">Error loading file ${filePath}: ${error.message}</div>`;
            updateTuiStatusBar(`Error displaying ${repoName}/${filePath}`);
        }
        tuiMainOutputElement.scrollTop = 0;
    }

    async function displayTuiRepoContents(repoName, pathInRepo = '') {
        if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
        const fullPathDisplay = `${repoName}${pathInRepo ? '/' + pathInRepo : ''}`;
        tuiMainOutputElement.innerHTML = `<div>Loading contents of ${fullPathDisplay}...</div>`;
        updateTuiStatusBar(`Listing: ${fullPathDisplay}`);
        tuiMainOutputElement.scrollTop = 0;

        try {
            const contents = await fetchGitHubApi(`https://api.github.com/repos/robertovacirca/${repoName}/contents/${pathInRepo}`);
            tuiMainOutputElement.innerHTML = ''; // Clear loading message

            if (!Array.isArray(contents) || contents.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = `Directory ${fullPathDisplay} is empty or an error occurred.`;
                tuiMainOutputElement.appendChild(emptyMsg);
                return;
            }

            contents.sort((a, b) => {
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name);
            }).forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'tui-selectable-item tui-repo-content-item';
                itemDiv.textContent = item.name + (item.type === 'dir' ? '/' : '');
                itemDiv.dataset.path = item.path;
                itemDiv.dataset.type = item.type;
                itemDiv.dataset.reponame = repoName;
                itemDiv.tabIndex = 0; // Make focusable

                itemDiv.addEventListener('click', () => {
                    if (item.type === 'dir') {
                        displayTuiRepoContents(repoName, item.path);
                    } else if (item.type === 'file') {
                        displayTuiFileContent(repoName, item.path);
                    }
                });
                tuiMainOutputElement.appendChild(itemDiv);
            });
        } catch (error) {
            tuiMainOutputElement.innerHTML = `<div class="error">Error listing ${fullPathDisplay}: ${error.message}</div>`;
            updateTuiStatusBar(`Error listing ${fullPathDisplay}`);
        }
        tuiMainOutputElement.scrollTop = 0;
    }


    function updateTuiStatusBar(message) {
        if (!tuiStatusBarElement) { // Assign if not already assigned
            tuiStatusBarElement = document.getElementById('tui-status-bar');
        }
        if (tuiStatusBarElement) {
            tuiStatusBarElement.textContent = message;
        } else {
            console.error("TUI Status Bar element not found for message:", message);
        }
    }

    function populateTuiSidebar() {
        if (isTuiSidebarPopulated) return;

        if (!tuiSidebarElement) tuiSidebarElement = document.getElementById('tui-sidebar');
        if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
        // Ensure tuiStatusBarElement is assigned (it's used in updateTuiStatusBar)
        if (!tuiStatusBarElement) tuiStatusBarElement = document.getElementById('tui-status-bar');


        if (!tuiSidebarElement) {
            console.error("TUI Sidebar element not found!");
            return;
        }

        tuiSidebarElement.innerHTML = ''; // Clear any existing items
        tuiSidebarItems = []; // Reset the array

        Object.keys(commandHelp).sort().forEach((command) => {
            const item = document.createElement('div');
            item.className = 'tui-sidebar-item';
            item.textContent = command;
            item.tabIndex = 0; // Make it focusable

            item.addEventListener('click', () => {
                item.focus(); // Focus will trigger the 'focus' listener below
            });
            
            item.addEventListener('focus', () => {
                // Update currentTuiFocusIndex when an item receives focus
                currentTuiFocusIndex = tuiSidebarItems.indexOf(item);
                updateTuiStatusBar(`Command: ${command} - ${commandHelp[command].description}`);
            });
            
            item.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output'); // Ensure it's assigned
                    
                    if (tuiMainOutputElement) {
                        if (command === 'help' || command === '?') {
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output

                            const header = document.createElement('div');
                            header.textContent = 'Available Commands:';
                            header.style.fontWeight = 'bold'; // Optional: make header bold
                            header.style.marginBottom = '5px'; // Optional: space after header
                            tuiMainOutputElement.appendChild(header);

                            Object.keys(commandHelp).sort().forEach(cmdKey => {
                                const helpLine = document.createElement('div');
                                helpLine.textContent = `  ${cmdKey.padEnd(15)} - ${commandHelp[cmdKey].description}`;
                                tuiMainOutputElement.appendChild(helpLine);
                            });

                            const manHint = document.createElement('div');
                            manHint.textContent = "\nUse 'man <command>' for more details.";
                            manHint.style.marginTop = '10px'; // Optional: space before hint
                            tuiMainOutputElement.appendChild(manHint);

                            tuiMainOutputElement.scrollTop = 0; // Scroll to top
                            updateTuiStatusBar(`Displayed help for: ${command}`);
                        } else if (command === 'man') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            
                            const instructionHeader = document.createElement('div');
                            instructionHeader.textContent = "Select a command to view its manual page:";
                            instructionHeader.style.marginBottom = '10px';
                            tuiMainOutputElement.appendChild(instructionHeader);

                            Object.keys(commandHelp).sort().forEach(cmdKey => {
                                if (cmdKey === '?' || cmdKey === 'man') return; // Skip '?' and 'man' itself initially

                                const commandDiv = document.createElement('div');
                                commandDiv.className = 'tui-selectable-item tui-man-topic';
                                commandDiv.textContent = cmdKey;
                                commandDiv.dataset.cmdname = cmdKey;
                                commandDiv.tabIndex = 0; // Make focusable

                                commandDiv.addEventListener('click', (event) => {
                                    const selectedCmdName = event.currentTarget.dataset.cmdname;
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    
                                    tuiMainOutputElement.innerHTML = ''; // Clear list of commands
                                    updateTuiStatusBar(`Manual: ${selectedCmdName}`);

                                    const helpData = commandHelp[selectedCmdName];
                                    if (helpData) {
                                        let manOutput = `<div class="tui-man-page"><strong>NAME</strong>\n    ${selectedCmdName} - ${helpData.description}\n\n`;
                                        if (helpData.usage) manOutput += `<strong>SYNOPSIS</strong>\n    ${helpData.usage}\n\n`;
                                        if (helpData.details) manOutput += `<strong>DESCRIPTION</strong>\n    ${helpData.details.replace(/\n/g, '\n    ')}\n`;
                                        manOutput += `</div>`;
                                        tuiMainOutputElement.innerHTML = manOutput;
                                    } else {
                                        tuiMainOutputElement.innerHTML = `<div>No manual entry for ${selectedCmdName}.</div>`;
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(commandDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;
                            updateTuiStatusBar("man: Select a command from the list.");
                        } else if (command === 'ls') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("ls: Select a directory to view or click an item.");

                            const postsDiv = document.createElement('div');
                            postsDiv.className = 'tui-selectable-item tui-ls-posts-dir'; // For styling and selection
                            postsDiv.textContent = 'posts/';
                            postsDiv.tabIndex = 0; // Make focusable for potential keyboard nav later
                            postsDiv.addEventListener('click', () => {
                                if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                tuiMainOutputElement.innerHTML = '';
                                updateTuiStatusBar("Listing posts...");
                                if (!postsManifest || postsManifest.length === 0) {
                                    const noPostsMsg = document.createElement('div');
                                    noPostsMsg.textContent = "No posts available.";
                                    tuiMainOutputElement.appendChild(noPostsMsg);
                                } else {
                                    postsManifest.sort((a,b) => a.name.localeCompare(b.name)).forEach(post => {
                                        const postItemDiv = document.createElement('div');
                                        postItemDiv.className = 'tui-selectable-item tui-post-item';
                                        postItemDiv.textContent = post.name;
                                        postItemDiv.dataset.filename = post.name;
                                        postItemDiv.tabIndex = 0; // Make it focusable

                                        postItemDiv.addEventListener('click', async () => {
                                            const filename = postItemDiv.dataset.filename;
                                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                            tuiMainOutputElement.innerHTML = '<div>Loading post...</div>';
                                            updateTuiStatusBar(`Displaying: ${filename}`);
                                            try {
                                                const response = await fetch(`public/posts/${filename}`);
                                                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                                                const markdownContent = await response.text();
                                                
                                                const tempRenderDiv = document.createElement('div');
                                                const markdownContainer = document.createElement('div');
                                                markdownContainer.className = 'markdown-content';
                                                markdownContainer.innerHTML = marked.parse(markdownContent);
                                                tempRenderDiv.appendChild(markdownContainer);

                                                tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                                                addCopyButtonsToCodeBlocks(tempRenderDiv);
                                                
                                                tuiMainOutputElement.innerHTML = tempRenderDiv.innerHTML;
                                            } catch (error) {
                                                tuiMainOutputElement.innerHTML = `<div class="error">Error loading post ${filename}: ${error.message}</div>`;
                                                updateTuiStatusBar(`Error displaying ${filename}`);
                                            }
                                            tuiMainOutputElement.scrollTop = 0;
                                        });
                                        tuiMainOutputElement.appendChild(postItemDiv);
                                    });
                                }
                                tuiMainOutputElement.scrollTop = 0;
                            });
                            tuiMainOutputElement.appendChild(postsDiv);

                            const reposDiv = document.createElement('div');
                            reposDiv.className = 'tui-selectable-item tui-ls-repos-dir'; // For styling and selection
                            reposDiv.textContent = 'repos/';
                            reposDiv.tabIndex = 0; // Make focusable
                            reposDiv.addEventListener('click', async () => {
                                if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                tuiMainOutputElement.innerHTML = '';
                                updateTuiStatusBar("Listing repositories...");
                                const loadingMsg = document.createElement('div');
                                loadingMsg.textContent = "Loading repositories...";
                                tuiMainOutputElement.appendChild(loadingMsg);
                                tuiMainOutputElement.scrollTop = 0;

                                try {
                                    const repos = await fetchGitHubApi(`https://api.github.com/users/robertovacirca/repos`);
                                    tuiMainOutputElement.innerHTML = ''; // Clear loading message
                                    if (!Array.isArray(repos) || repos.length === 0) {
                                        const noReposMsg = document.createElement('div');
                                        noReposMsg.textContent = "No public repositories found.";
                                        tuiMainOutputElement.appendChild(noReposMsg);
                                    } else {
                                        repos.sort((a,b) => a.name.localeCompare(b.name)).forEach(repo => {
                                            const repoItemDiv = document.createElement('div');
                                            repoItemDiv.className = 'tui-selectable-item tui-repo-item';
                                            repoItemDiv.textContent = `${repo.name}/`;
                                            repoItemDiv.dataset.reponame = repo.name;
                                            repoItemDiv.tabIndex = 0; // Make it focusable

                                repoItemDiv.addEventListener('click', () => { // Removed async here
                                    const repoNameFromDataset = repoItemDiv.dataset.reponame;
                                    displayTuiRepoContents(repoNameFromDataset, ''); // Call new refactored function
                                            });
                                            tuiMainOutputElement.appendChild(repoItemDiv);
                                        });
                                    }
                                } catch (error) {
                                    tuiMainOutputElement.innerHTML = ''; // Clear loading message
                                    const errorMsg = document.createElement('div');
                                    errorMsg.className = 'error';
                                    errorMsg.textContent = error.message;
                                    tuiMainOutputElement.appendChild(errorMsg);
                                    updateTuiStatusBar("Error fetching repositories.");
                                }
                                tuiMainOutputElement.scrollTop = 0;
                            });
                            tuiMainOutputElement.appendChild(reposDiv);
                            
                            // Focus the first selectable item in the main output if available
                            const firstSelectable = tuiMainOutputElement.querySelector('.tui-selectable-item');
                            if (firstSelectable) {
                                // TODO: Consider if focusing here is desired, or if focus should remain in sidebar
                                // For now, let focus remain on the 'ls' command in sidebar.
                                // User will click to navigate into these.
                            }
                            updateTuiStatusBar(`TUI: ls - Select a directory.`);
                        } else if (command === 'cat') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Select a post to 'cat':");

                            if (!postsManifest || postsManifest.length === 0) {
                                const noPostsMsg = document.createElement('div');
                                noPostsMsg.textContent = "No posts available to 'cat'.";
                                tuiMainOutputElement.appendChild(noPostsMsg);
                                return;
                            }

                            postsManifest.forEach(post => {
                                const postDiv = document.createElement('div');
                                postDiv.className = 'tui-selectable-item tui-post-to-cat'; // Add classes
                                postDiv.textContent = post.name;
                                postDiv.dataset.filename = post.name; // Store filename

                                postDiv.addEventListener('click', async () => {
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    tuiMainOutputElement.innerHTML = ''; // Clear post list or previous content
                                    updateTuiStatusBar(`Displaying: ${post.name}`);
                                    
                                    try {
                                        const response = await fetch(`public/posts/${post.name}`);
                                        if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                                        const markdownContent = await response.text();
                                        
                                        const tempRenderDiv = document.createElement('div');
                                        const markdownContainer = document.createElement('div');
                                        markdownContainer.className = 'markdown-content'; // Apply markdown styling
                                        markdownContainer.innerHTML = marked.parse(markdownContent);
                                        tempRenderDiv.appendChild(markdownContainer);

                                        tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                                        addCopyButtonsToCodeBlocks(tempRenderDiv);
                                        
                                        tuiMainOutputElement.innerHTML = tempRenderDiv.innerHTML;
                                    } catch (error) {
                                        const errorMsg = document.createElement('div');
                                        errorMsg.className = 'error'; // Use existing error class
                                        errorMsg.textContent = `cat: ${post.name}: ${error.message}`;
                                        tuiMainOutputElement.appendChild(errorMsg);
                                        updateTuiStatusBar(`Error displaying ${post.name}`);
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(postDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;

                        } else if (command === 'less') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Select a post for 'less':");

                            if (!postsManifest || postsManifest.length === 0) {
                                const noPostsMsg = document.createElement('div');
                                noPostsMsg.textContent = "No posts available for 'less'.";
                                tuiMainOutputElement.appendChild(noPostsMsg);
                                return;
                            }

                            postsManifest.forEach(post => {
                                const postDiv = document.createElement('div');
                                postDiv.className = 'tui-selectable-item tui-post-to-less'; 
                                postDiv.textContent = post.name;
                                postDiv.dataset.filename = post.name; 

                                postDiv.addEventListener('click', async () => {
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    tuiMainOutputElement.innerHTML = ''; 
                                    updateTuiStatusBar(`Viewing (less): ${post.name} - Scroll to navigate (q to exit this view - not yet implemented)`);
                                    
                                    try {
                                        const response = await fetch(`public/posts/${post.name}`);
                                        if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                                        const markdownContent = await response.text();
                                        
                                        const tempRenderDiv = document.createElement('div');
                                        const markdownContainer = document.createElement('div');
                                        markdownContainer.className = 'markdown-content'; 
                                        markdownContainer.innerHTML = marked.parse(markdownContent);
                                        tempRenderDiv.appendChild(markdownContainer);

                                        tempRenderDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
                                        addCopyButtonsToCodeBlocks(tempRenderDiv);
                                        
                                        tuiMainOutputElement.innerHTML = tempRenderDiv.innerHTML;
                                    } catch (error) {
                                        const errorMsg = document.createElement('div');
                                        errorMsg.className = 'error'; 
                                        errorMsg.textContent = `less: ${post.name}: ${error.message}`;
                                        tuiMainOutputElement.appendChild(errorMsg);
                                        updateTuiStatusBar(`Error displaying ${post.name} with less`);
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(postDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'cowsay') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const cowsayPlaceholder = document.createElement('div');
                            cowsayPlaceholder.textContent = "TUI cowsay: Use CLI for cowsay with arguments for now.";
                            tuiMainOutputElement.appendChild(cowsayPlaceholder);
                            updateTuiStatusBar("cowsay");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'sudo') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const sudoPlaceholder = document.createElement('div');
                            sudoPlaceholder.textContent = "sudo: you are not the superuser here.";
                            tuiMainOutputElement.appendChild(sudoPlaceholder);
                            updateTuiStatusBar("sudo");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'cowsay') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const cowsayPlaceholder = document.createElement('div');
                            cowsayPlaceholder.textContent = "TUI cowsay: Use CLI for cowsay with arguments for now.";
                            tuiMainOutputElement.appendChild(cowsayPlaceholder);
                            updateTuiStatusBar("cowsay");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'sudo') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const sudoPlaceholder = document.createElement('div');
                            sudoPlaceholder.textContent = "sudo: you are not the superuser here.";
                            tuiMainOutputElement.appendChild(sudoPlaceholder);
                            updateTuiStatusBar("sudo");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'cowsay') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const cowsayPlaceholder = document.createElement('div');
                            cowsayPlaceholder.textContent = "TUI cowsay: Use CLI for cowsay with arguments for now.";
                            tuiMainOutputElement.appendChild(cowsayPlaceholder);
                            updateTuiStatusBar("cowsay");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'sudo') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const sudoPlaceholder = document.createElement('div');
                            sudoPlaceholder.textContent = "sudo: you are not the superuser here.";
                            tuiMainOutputElement.appendChild(sudoPlaceholder);
                            updateTuiStatusBar("sudo");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'vi') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Select a post for 'vi' (read-only view):");

                            if (!postsManifest || postsManifest.length === 0) {
                                const noPostsMsg = document.createElement('div');
                                noPostsMsg.textContent = "No posts available for 'vi'.";
                                tuiMainOutputElement.appendChild(noPostsMsg);
                                return;
                            }

                            postsManifest.forEach(post => {
                                const postDiv = document.createElement('div');
                                postDiv.className = 'tui-selectable-item tui-post-to-vi'; 
                                postDiv.textContent = post.name;
                                postDiv.dataset.filename = post.name; 

                                postDiv.addEventListener('click', async () => {
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    tuiMainOutputElement.innerHTML = '<div>Loading post for vi...</div>'; 
                                    updateTuiStatusBar(`vi (read-only): ${post.name} (q to exit view - not yet implemented)`);
                                    
                                    try {
                                        const response = await fetch(`public/posts/${post.name}`);
                                        if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                                        const rawMarkdownContent = await response.text();
                                        
                                        tuiMainOutputElement.innerHTML = ''; // Clear loading message

                                        const lines = rawMarkdownContent.split('\n');
                                        let viFormattedContent = "";
                                        lines.forEach((line, index) => {
                                            viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3,' ')}</span>${escapeHtml(line)}\n`;
                                        });

                                        const preElement = document.createElement('pre');
                                        // The inner div with white-space: pre is important for some browsers to respect \n correctly within pre
                                        preElement.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                                        tuiMainOutputElement.appendChild(preElement);

                                    } catch (error) {
                                        const errorMsg = document.createElement('div');
                                        errorMsg.className = 'error'; 
                                        errorMsg.textContent = `vi: ${post.name}: ${error.message}`;
                                        tuiMainOutputElement.appendChild(errorMsg);
                                        updateTuiStatusBar(`Error displaying ${post.name} with vi`);
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(postDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'vi') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Select a post for 'vi' (read-only view):");

                            if (!postsManifest || postsManifest.length === 0) {
                                const noPostsMsg = document.createElement('div');
                                noPostsMsg.textContent = "No posts available for 'vi'.";
                                tuiMainOutputElement.appendChild(noPostsMsg);
                                return;
                            }

                            postsManifest.forEach(post => {
                                const postDiv = document.createElement('div');
                                postDiv.className = 'tui-selectable-item tui-post-to-vi'; 
                                postDiv.textContent = post.name;
                                postDiv.dataset.filename = post.name; 

                                postDiv.addEventListener('click', async () => {
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    tuiMainOutputElement.innerHTML = '<div>Loading post for vi...</div>'; 
                                    updateTuiStatusBar(`vi (read-only): ${post.name} (q to exit view - not yet implemented)`);
                                    
                                    try {
                                        const response = await fetch(`public/posts/${post.name}`);
                                        if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                                        const rawMarkdownContent = await response.text();
                                        
                                        tuiMainOutputElement.innerHTML = ''; // Clear loading message

                                        const lines = rawMarkdownContent.split('\n');
                                        let viFormattedContent = "";
                                        lines.forEach((line, index) => {
                                            viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3,' ')}</span>${escapeHtml(line)}\n`;
                                        });

                                        const preElement = document.createElement('pre');
                                        // The inner div with white-space: pre is important for some browsers to respect \n correctly within pre
                                        preElement.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                                        tuiMainOutputElement.appendChild(preElement);

                                    } catch (error) {
                                        const errorMsg = document.createElement('div');
                                        errorMsg.className = 'error'; 
                                        errorMsg.textContent = `vi: ${post.name}: ${error.message}`;
                                        tuiMainOutputElement.appendChild(errorMsg);
                                        updateTuiStatusBar(`Error displaying ${post.name} with vi`);
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(postDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'vi') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Select a post for 'vi' (read-only view):");

                            if (!postsManifest || postsManifest.length === 0) {
                                const noPostsMsg = document.createElement('div');
                                noPostsMsg.textContent = "No posts available for 'vi'.";
                                tuiMainOutputElement.appendChild(noPostsMsg);
                                return;
                            }

                            postsManifest.forEach(post => {
                                const postDiv = document.createElement('div');
                                postDiv.className = 'tui-selectable-item tui-post-to-vi'; 
                                postDiv.textContent = post.name;
                                postDiv.dataset.filename = post.name; 

                                postDiv.addEventListener('click', async () => {
                                    if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                                    tuiMainOutputElement.innerHTML = '<div>Loading post for vi...</div>'; 
                                    updateTuiStatusBar(`vi (read-only): ${post.name}`); // Simplified status for now
                                    
                                    try {
                                        const response = await fetch(`public/posts/${post.name}`);
                                        if (!response.ok) throw new Error(`File not found or unreadable (status ${response.status})`);
                                        const rawMarkdownContent = await response.text();
                                        
                                        tuiMainOutputElement.innerHTML = ''; // Clear loading message

                                        const lines = rawMarkdownContent.split('\n');
                                        let viFormattedContent = "";
                                        lines.forEach((line, index) => {
                                            // Pad line number to 3 digits for alignment
                                            viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3, ' ')}</span>${escapeHtml(line)}\n`;
                                        });

                                        const preElement = document.createElement('pre');
                                        // The inner div with white-space: pre is important for some browsers to respect \n correctly within pre
                                        preElement.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                                        tuiMainOutputElement.appendChild(preElement);

                                    } catch (error) {
                                        const errorMsg = document.createElement('div');
                                        errorMsg.className = 'error'; 
                                        errorMsg.textContent = `vi: ${post.name}: ${error.message}`;
                                        tuiMainOutputElement.appendChild(errorMsg);
                                        updateTuiStatusBar(`Error displaying ${post.name} with vi`);
                                    }
                                    tuiMainOutputElement.scrollTop = 0;
                                });
                                tuiMainOutputElement.appendChild(postDiv);
                            });
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'history') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; // Clear previous output
                            updateTuiStatusBar("Command History");

                            if (commandHistory.length === 0) {
                                const noHistoryMsg = document.createElement('div');
                                noHistoryMsg.textContent = "No commands in history.";
                                tuiMainOutputElement.appendChild(noHistoryMsg);
                            } else {
                                const reversedHistory = [...commandHistory].reverse();
                                reversedHistory.forEach((cmd, index) => {
                                    const historyItem = document.createElement('div');
                                    historyItem.className = 'tui-history-item'; // For styling
                                    historyItem.textContent = `  ${String(index + 1).padStart(3)}  ${cmd}`;
                                    tuiMainOutputElement.appendChild(historyItem);
                                });
                            }
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'whoami') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; 
                            const outputDiv = document.createElement('div');
                            outputDiv.textContent = 'guest';
                            tuiMainOutputElement.appendChild(outputDiv);
                            updateTuiStatusBar("whoami");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'date') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const outputDiv = document.createElement('div');
                            outputDiv.textContent = new Date().toString();
                            tuiMainOutputElement.appendChild(outputDiv);
                            updateTuiStatusBar("date");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'fortune') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = '';
                            const outputDiv = document.createElement('div');
                            outputDiv.textContent = fortunes[Math.floor(Math.random() * fortunes.length)];
                            tuiMainOutputElement.appendChild(outputDiv);
                            updateTuiStatusBar("fortune");
                            tuiMainOutputElement.scrollTop = 0;
                        } else if (command === 'clear') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; 
                            updateTuiStatusBar("Screen cleared");
                            tuiMainOutputElement.scrollTop = 0; 
                        } else if (command === 'exit') {
                            // Call the existing toggletui command, which handles switching back to CLI
                            commands.toggletui(); 
                            // Status bar update is handled by toggletui when switching to CLI
                        } else if (command === 'echo') {
                            if (!tuiMainOutputElement) tuiMainOutputElement = document.getElementById('tui-main-output');
                            tuiMainOutputElement.innerHTML = ''; 
                            const echoPlaceholder = document.createElement('div');
                            echoPlaceholder.textContent = "TUI echo: Please use CLI for echo with arguments for now.";
                            tuiMainOutputElement.appendChild(echoPlaceholder);
                            updateTuiStatusBar("echo");
                            tuiMainOutputElement.scrollTop = 0;
                        } else {
                            tuiMainOutputElement.textContent += `\n> ${command}\n`;
                            // Simulate command execution for now
                            tuiMainOutputElement.textContent += `Executed: ${command}. (Output would appear here)\n`;
                            tuiMainOutputElement.scrollTop = tuiMainOutputElement.scrollHeight; // Scroll to bottom
                            updateTuiStatusBar(`Executed: ${command}`);
                        }
                    } else {
                        // Fallback if tuiMainOutputElement is somehow still null
                        updateTuiStatusBar(`Error: TUI Main Output not found for ${command}`);
                    }
                }
            });

            tuiSidebarItems.push(item);
            tuiSidebarElement.appendChild(item);
        });
        isTuiSidebarPopulated = true;
    }
    
    async function init() {
        outputContainer.innerHTML = '';
        await fetchPostsManifest();

        displayOutput("Welcome to Terminal Blog!");
        displayOutput("Type 'help' to see available commands or '?' for a short list.");
        displayOutput("");

        createNewInputLine();

        if (!terminal.dataset.listenersAttached) {
            document.addEventListener('keydown', handleGlobalKeyPress);
            outputContainer.addEventListener('click', (event) => {
                if (currentView) return;
                if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
                    return;
                }
                if (activeCommandInput &&
                    currentInputLineDiv && !currentInputLineDiv.contains(event.target)) {
                    const selection = window.getSelection();
                     if (!(selection.toString().length > 0 && outputContainer.contains(selection.anchorNode))) {
                        attemptFocus(activeCommandInput);
                    }
                } else if (activeCommandInput && event.target === outputContainer) {
                    attemptFocus(activeCommandInput);
                }
            });
            terminal.dataset.listenersAttached = 'true';
        }
    }

    async function fetchPostsManifest() {
        try {
            const response = await fetch('public/posts/posts.json');
            if (!response.ok) { throw new Error(`HTTP error! ${response.status} ${response.statusText}`); }
            postsManifest = await response.json();
        } catch (error) {
            console.error("Failed to load posts.json:", error);
            const errDiv = document.createElement('div');
            errDiv.className = 'command-output-item error';
            errDiv.textContent = `Error: Could not load posts manifest. ${error.message}`;
            if (outputContainer) {
                if (currentInputLineDiv && outputContainer.contains(currentInputLineDiv)) {
                     outputContainer.insertBefore(errDiv, currentInputLineDiv);
                } else {
                    outputContainer.appendChild(errDiv);
                }
            } else {
                console.error("outputContainer not ready for fetchPostsManifest error.");
            }
            postsManifest = [];
        }
    }

    function displayOutput(text, type = 'output') {
        if (text === undefined || text === null) return;
        const div = document.createElement('div');

        if (type !== 'sl-animation-frame' && type !== 'cowsay-output') {
            div.classList.add('command-output-item');
        }

        if (type === 'error') {
            div.classList.add('error'); div.textContent = String(text);
        } else if (type === 'success') {
            div.classList.add('success'); div.textContent = String(text);
        } else if (type === 'rawhtml') {
            div.innerHTML = String(text);
        } else if (type === 'sl-animation-frame') {
            div.className = 'sl-animation-frame';
            div.textContent = String(text);
        } else if (type === 'cowsay-output') {
            div.className = 'cowsay-output command-output-item';
            div.textContent = String(text);
        }
         else {
            div.textContent = String(text);
        }

        if (currentInputLineDiv && outputContainer.contains(currentInputLineDiv)) {
            outputContainer.insertBefore(div, currentInputLineDiv);
        } else {
            outputContainer.appendChild(div);
        }
    }

    function addCopyButtonsToCodeBlocks(containerElement) {
        containerElement.querySelectorAll('pre').forEach(preBlock => {
            console.log('Found <pre> block:', preBlock);
    
            let wrapper = preBlock.parentElement;
    
            // Check for wrapper
            if (!wrapper || !wrapper.classList.contains('code-block-wrapper')) {
                console.log('No wrapper found, creating one.');
                const contentParent = preBlock.closest('.markdown-content, .modal-content');
                if (contentParent) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'code-block-wrapper';
                    preBlock.parentNode.insertBefore(wrapper, preBlock);
                    wrapper.appendChild(preBlock);
                    console.log('Wrapper created and <pre> moved inside.');
                } else {
                    wrapper = preBlock;
                    preBlock.style.position = 'relative';
                    console.log('Using <pre> as wrapper (no content parent found).');
                }
            }
    
            // Add copy button if it doesn't already exist
            if (!wrapper.querySelector('.code-copy-button')) {
                const button = document.createElement('button');
                button.className = 'code-copy-button';
                button.textContent = 'Copy';
                wrapper.appendChild(button);
                console.log('Copy button created and appended.');
            } else {
                console.log('Copy button already exists, skipping.');
            }
        });
    }
    
    

    async function handleCommandInputKeydown(e) {
        if (currentView || !activeCommandInput) return;

        if (slInterval && e.key.toLowerCase() !== 'c' && !e.ctrlKey) {
             e.preventDefault();
             return;
        }

        if (e.ctrlKey) {
            let preventDefault = true;
            switch (e.key.toLowerCase()) {
                case 'a': activeCommandInput.setSelectionRange(0, 0); break;
                case 'e': activeCommandInput.setSelectionRange(activeCommandInput.value.length, activeCommandInput.value.length); break;
                case 'u': activeCommandInput.value = ''; break;
                case 'l': commands.clear(); scrollToBottom(); break;
                case 'c':
                    if (slInterval) {
                        clearInterval(slInterval);
                        slInterval = null;
                        const slFrameDiv = outputContainer.querySelector('.sl-animation-frame');
                        if (slFrameDiv) {
                             slFrameDiv.textContent += "\n*** SL Interrupted ***";
                        } else {
                            displayOutput("*** SL Interrupted ***");
                        }
                         // Remove the input line that invoked SL, then create new.
                        if (currentInputLineDiv && currentInputLineDiv.parentNode === outputContainer) {
                            outputContainer.removeChild(currentInputLineDiv);
                        }
                        activeCommandInput = null; // Ensure it's cleared
                        currentInputLineDiv = null;
                        createNewInputLine();
                        preventDefault = true;
                    } else {
                        const currentCmdTextForCtrlC = activeCommandInput.value;
                        if (currentInputLineDiv && activeCommandInput) {
                            currentInputLineDiv.removeChild(activeCommandInput);
                            currentInputLineDiv.appendChild(document.createTextNode(currentCmdTextForCtrlC + "^C"));
                            activeCommandInput.removeEventListener('keydown', handleCommandInputKeydown);
                            activeCommandInput = null;
                            currentInputLineDiv = null;
                        }
                        createNewInputLine();
                    }
                    break;
                default: preventDefault = false;
            }
            if (preventDefault) e.preventDefault();
            if (['a','e','u','l','c'].includes(e.key.toLowerCase())) return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (slInterval) return;

            const commandText = activeCommandInput.value.trim();

            if (currentInputLineDiv && activeCommandInput) {
                 currentInputLineDiv.removeChild(activeCommandInput);
                 currentInputLineDiv.appendChild(document.createTextNode(commandText));
                 activeCommandInput.removeEventListener('keydown', handleCommandInputKeydown);
                 activeCommandInput = null;
                 currentInputLineDiv = null;
            }

            if (commandText) {
                commandHistory.unshift(commandText);
                historyIndex = -1;
            }

            await processCommand(commandText);

            if (!slInterval) {
                createNewInputLine();
            }
            return;
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0 && activeCommandInput) {
                historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
                activeCommandInput.value = commandHistory[historyIndex];
                activeCommandInput.setSelectionRange(activeCommandInput.value.length, activeCommandInput.value.length);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeCommandInput) {
                if (historyIndex > 0) {
                    historyIndex--;
                    activeCommandInput.value = commandHistory[historyIndex];
                    activeCommandInput.setSelectionRange(activeCommandInput.value.length, activeCommandInput.value.length);
                } else {
                    historyIndex = -1;
                    activeCommandInput.value = '';
                }
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (!activeCommandInput) return;

            const currentInputValue = activeCommandInput.value;
            const parts = currentInputValue.split(' ');
            // const currentWord = parts.length > 0 ? parts[parts.length - 1].toLowerCase() : ""; // Not strictly needed with currentArgText
            const atStartOfNewWord = currentInputValue.endsWith(" ") || parts[parts.length -1] === ""; // If true, currentArgText will be ""
            // const wordToComplete = atStartOfNewWord ? "" : parts[parts.length - 1]; // Replaced by currentArgText (non-lowercased)

            let suggestions = [];
            const commandName = parts[0].toLowerCase(); // command is a reserved keyword in some contexts
            const baseDirs = ["posts/", "repo/"];

            // Scenario 1: Completing the command itself
            if (parts.length === 1 && !currentInputValue.endsWith(" ")) {
                const commandPartToComplete = parts[0]; // wordToComplete equivalent for command
                suggestions = Object.keys(commands).filter(cmd => cmd.startsWith(commandPartToComplete));
            }
            // Scenario 2: Completing arguments for a command
            else if (parts.length >= 1 && commandName) { // Command name is present or fully typed
                const argIndex = currentInputValue.endsWith(" ") ? parts.length : parts.length - 1; // Keep only one
                const currentArgText = currentInputValue.endsWith(" ") ? "" : parts[parts.length - 1];

                // Ensure commandName is valid before proceeding with argument completion
                if (commandName && commands[commandName]) {
                    if (commandName === 'ls' || ['cat', 'less', 'vi', 'nano'].includes(commandName)) {
                        if (argIndex === 1) { // Completing the first argument (path)
                            if (currentArgText.startsWith("posts/")) {
                                const filePrefix = currentArgText.substring("posts/".length);
                            suggestions = postsManifest
                                .filter(post => post.name.toLowerCase().startsWith(filePrefix.toLowerCase()))
                                .map(p => "posts/" + p.name);
                        } else if (currentArgText.startsWith("repo/")) {
                            const repoPathPart = currentArgText.substring("repo/".length);
                            const repoPathSegments = repoPathPart.split('/');
                            
                            if (repoPathSegments.length === 1) { // Completing repo name: "repo/my-p" or "repo/"
                                const partialRepoName = repoPathSegments[0];
                                if (userRepoNamesCache === null) {
                                    showLoadingSuggestions(outputContainer, currentInputLineDiv);
                                    try {
                                        const repos = await fetchGitHubApi(`https://api.github.com/users/robertovacirca/repos`);
                                        userRepoNamesCache = repos.map(r => r.name);
                                    } catch (err) {
                                        displayOutput(`Error fetching repositories: ${err.message}`, 'error');
                                        userRepoNamesCache = []; // Avoid retrying on every tab for a failed fetch
                                    } finally {
                                        hideLoadingSuggestions();
                                    }
                                }
                                suggestions = (userRepoNamesCache || [])
                                    .filter(name => name.startsWith(partialRepoName))
                                    .map(name => `repo/${name}/`);
                            } else { // Completing path inside a repo: "repo/my-portfolio/sr" or "repo/my-portfolio/src/"
                                const repoName = repoPathSegments[0];
                                const pathPrefixSegments = repoPathSegments.slice(1, -1); // Path up to the part being completed
                                const itemToComplete = repoPathSegments[repoPathSegments.length - 1];
                                const cacheKey = `${repoName}/${pathPrefixSegments.join('/')}`;
                                const fullPathToFetch = `repos/robertovacirca/${repoName}/contents/${pathPrefixSegments.join('/')}`;

                                if (!repoContentsCache[cacheKey]) {
                                    showLoadingSuggestions(outputContainer, currentInputLineDiv);
                                    try {
                                        const contents = await fetchGitHubApi(`https://api.github.com/repos/robertovacirca/${repoName}/contents/${pathPrefixSegments.join('/')}`);
                                        if (Array.isArray(contents)) {
                                            repoContentsCache[cacheKey] = contents;
                                        } else {
                                            // If the API returns a single file object for a path that was expected to be a dir,
                                            // or any other non-array response that isn't an error.
                                            console.warn(`Tab completion: Expected array for ${cacheKey}, received:`, contents);
                                            repoContentsCache[cacheKey] = []; // Cache empty array
                                        }
                                    } catch (err) {
                                        displayOutput(`Error fetching suggestions for ${repoName}/${pathPrefixSegments.join('/')}: ${err.message}`, 'error');
                                        repoContentsCache[cacheKey] = []; // Cache empty array on error
                                    } finally {
                                        hideLoadingSuggestions();
                                    }
                                }
                                // Ensure that we only try to filter if repoContentsCache[cacheKey] is actually an array.
                                // The `|| []` handles cases where cacheKey might not exist yet if fetch failed early or is in progress.
                                const cachedContent = repoContentsCache[cacheKey];
                                suggestions = (Array.isArray(cachedContent) ? cachedContent : [])
                                    .filter(item => item.name.startsWith(itemToComplete))
                                    .map(item => `repo/${repoName}/${pathPrefixSegments.join('/') ? pathPrefixSegments.join('/') + '/' : ''}${item.name}${item.type === 'dir' ? '/' : ''}`);
                            }
                        } else { // Suggest "posts/" or "repo/"
                            suggestions = baseDirs.filter(dir => dir.startsWith(currentArgText));
                        }
                    }
                } else if (commandName === 'man') {
                    if (argIndex === 1) { // Completing the command name argument for 'man'
                         suggestions = Object.keys(commandHelp).filter(cmd => cmd.startsWith(currentArgText) && cmd !== '?');
                    }
                }
                // Add other command-specific argument completion logic here if needed
            }

            // Ensure suggestions are unique (e.g. if multiple logic paths could add the same suggestion)
            if (suggestions.length > 0) {
                suggestions = [...new Set(suggestions)];
            }

            if (suggestions.length === 1) {
                const suggestion = suggestions[0];
                parts[parts.length - 1] = suggestion; // Replace current word with suggestion

                let finalValue;
                if (suggestion.endsWith('/')) {
                    // For directory-like suggestions (e.g., "posts/"), complete without adding an extra space immediately after.
                    finalValue = parts.join(' ');
                } else {
                    // For commands or filenames, add a space after completion.
                    finalValue = parts.join(' ') + ' ';
                }
                activeCommandInput.value = finalValue;
                activeCommandInput.setSelectionRange(activeCommandInput.value.length, activeCommandInput.value.length);
            } else if (suggestions.length > 1) {
                displayOutput(`Suggestions: ${suggestions.join('  ')}`);
                scrollToBottom();
            }
        }
    }

async function processCommand(commandText) {
    const parts = commandText.split(/\s+/).filter(s => s.length > 0);
    const command = parts[0];
    const args = parts.slice(1);

    if (!command && commandText === "") {
        // Empty enter press
    } else if (command) {
        // Special routing for cat, less, vi, nano for repo paths
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
                    displayOutput(`${command}: '${fullPathArg}' is a directory. Please specify a file path.`, 'error');
                    // No further processing for this command if only a directory is given to cat/less etc.
                    // createNewInputLine(); // Not needed here as processCommand finishes and calls it
                    return; 
                }
                
                const targetReposCommandName = command.toLowerCase() + 'repos';
                if (commands[targetReposCommandName]) {
                    await commands[targetReposCommandName](repoName, fileOrDirPath);
                } else {
                    // This case should ideally not be hit if all ...repos commands are defined
                    console.error(`Internal error: Command ${targetReposCommandName} not found, but routing logic directed to it.`);
                    displayOutput(`Error: Command ${command} does not support repository operations for ${targetReposCommandName}.`, 'error');
                }
                return; // Exit after handling the repo-specific command
            } else { 
                 // Case where pathWithoutPrefix was empty or only contained slashes, making repoName empty.
                 // e.g., user typed "cat repo/" or "cat repos//"
                 displayOutput(`${command}: Invalid repository path specified: '${fullPathArg}'`, 'error');
                 // createNewInputLine(); // Not needed here
                 return;
            }
        }

        // Default command handling (includes local posts for cat, etc.)
        const cmdFunc = commands[command.toLowerCase()];
        if (cmdFunc) {
            try {
                await cmdFunc(args);
            } catch (error) {
                console.error(`Error executing command '${command}':`, error);
                displayOutput(`Error during ${command}: ${error.message}`, 'error');
            }
        } else {
            displayOutput(`bash: command not found: ${command}`, 'error');
            const commandNames = Object.keys(commands);
            const threshold = 2; 
            let suggestions = [];

            for (const validCommand of commandNames) {
                // Do not suggest '?' for commands longer than 1 char, unless the command itself is '?'
                if (validCommand === "?" && command !== "?" && command.length > 1) continue; 
                
                const distance = levenshtein(command, validCommand);
                if (distance <= threshold) {
                    suggestions.push({ command: validCommand, distance: distance });
                }
            }

            // Sort by distance, then alphabetically for commands with the same distance
            suggestions.sort((a, b) => {
                if (a.distance !== b.distance) {
                    return a.distance - b.distance;
                }
                return a.command.localeCompare(b.command); 
            });

            if (suggestions.length > 0) {
                let suggestionMsg = `Did you mean: ${suggestions[0].command} ?`;
                // If a second suggestion exists AND it has the same minimal distance
                // (already sorted alphabetically, so suggestions[0] and suggestions[1] are the chosen ones for ties)
                if (suggestions.length > 1 && suggestions[1].distance === suggestions[0].distance) {
                    suggestionMsg = `Did you mean: ${suggestions[0].command} or ${suggestions[1].command} ?`;
                }
                displayOutput(suggestionMsg);
            }
        }
    }
    if (!slInterval) {
         scrollToBottom();
    }
}

// Levenshtein distance function
function levenshtein(s1, s2) {
    if (s1.length < s2.length) { return levenshtein(s2, s1); }
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
}
    
    // Man, history implementations (already in full command object from prior response)
    commands.man = (args) => {
        if(args.length===0){displayOutput("What manual page do you want?",'error');return;}
        const cmdKey=args[0].toLowerCase();const helpData=commandHelp[cmdKey];
        if(helpData){let manOutput=`<div class="man-page"><strong>NAME</strong>\n    ${cmdKey} - ${helpData.description}\n\n`;if(helpData.usage)manOutput+=`<strong>SYNOPSIS</strong>\n    ${helpData.usage}\n\n`;if(helpData.details)manOutput+=`<strong>DESCRIPTION</strong>\n    ${helpData.details.replace(/\n/g,'\n    ')}\n`;manOutput+=`</div>`;displayOutput(manOutput,'rawhtml');}else{displayOutput(`No manual entry for ${cmdKey}`,'error');}
    };
    commands.history = () => {
        if(commandHistory.length===0){displayOutput("No commands in history.");return;}
        const reversedHistory=[...commandHistory].reverse(); 
        reversedHistory.forEach((cmd,index)=>{displayOutput(`  ${String(index+1).padStart(3)}  ${cmd}`);});
    };
}
    
    init();
});
