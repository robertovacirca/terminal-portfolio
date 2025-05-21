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
            const currentWord = parts.length > 0 ? parts[parts.length - 1].toLowerCase() : "";
            const atStartOfNewWord = currentInputValue.endsWith(" ") || (parts.length === 1 && currentWord === "");
            const wordToComplete = atStartOfNewWord ? "" : currentWord;

            const isCompletingCommand = parts.length === 1 && !currentInputValue.endsWith(" ");
            const isCompletingFile = parts.length > 1 &&
                                     ['cat', 'less', 'vi', 'nano'].includes(parts[0].toLowerCase()) &&
                                     !currentInputValue.endsWith(" ");
            const isCompletingManArg = parts.length > 1 && parts[0].toLowerCase() === 'man' && !currentInputValue.endsWith(" ");
            let suggestions = [];

            if (isCompletingCommand || (parts.length === 1 && (atStartOfNewWord || currentInputValue === "" ))) {
                suggestions = Object.keys(commands).filter(cmd => cmd.startsWith(wordToComplete));
            } else if (isCompletingFile) {
                 suggestions = postsManifest.filter(post => post.name.toLowerCase().startsWith(wordToComplete)).map(p => p.name);
            } else if (isCompletingManArg) {
                suggestions = Object.keys(commandHelp).filter(cmd => cmd.startsWith(wordToComplete) && cmd !== '?');
            }

            if (suggestions.length === 1) {
                parts[parts.length - 1] = suggestions[0];
                let suffix = ' ';
                if (isCompletingFile && !isCompletingCommand && !isCompletingManArg) suffix = '';
                activeCommandInput.value = parts.join(' ') + suffix;
                activeCommandInput.setSelectionRange(activeCommandInput.value.length, activeCommandInput.value.length);
            } else if (suggestions.length > 1) {
                displayOutput(`Suggestions: ${suggestions.join('  ')}`);
                scrollToBottom();
            }
        }
    }

    async function processCommand(commandText) {
        const [command, ...args] = commandText.split(/\s+/).filter(s => s.length > 0);

        if (!command && commandText === "") {
            // Empty enter press
        } else if (command) {
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
            }
        }
        if (!slInterval) {
             scrollToBottom();
        }
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
        sudo: { description: "Execute a command as another user (simulated)." }
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
        ls: (args) => {
            if (!postsManifest || postsManifest.length === 0) { displayOutput("No posts found. (Is posts.json loaded?)"); return; }
            let postsToDisplay = [...postsManifest];
            let longFormat = args.includes('-lt');
            if (longFormat) postsToDisplay.sort((a,b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
            else postsToDisplay.sort((a,b) => a.name.localeCompare(b.name));
            if (postsToDisplay.length === 0) { displayOutput("No posts available."); return; }
            if (longFormat) postsToDisplay.forEach(p => displayOutput(`-rw-r--r-- 1 guest guest ${String(p.size||0).padStart(6,' ')} ${new Date(p.lastModified).toLocaleString('en-US',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} ${p.name}`));
            else postsToDisplay.forEach(p => displayOutput(p.name));
        },
        cat: async (args) => {
            if (args.length === 0) { displayOutput("Usage: cat <filename>", 'error'); return; }
            const filename = args[0];
            const post = postsManifest.find(p => p.name === filename);
            if (!post) { displayOutput(`cat: ${filename}: No such file or directory`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${filename}`);
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
            } catch (error) { displayOutput(`cat: ${filename}: ${error.message}`, 'error'); }
        },
        less: async (args) => {
            if (args.length === 0) { displayOutput("Usage: less <filename>", 'error'); return; }
            const filename = args[0];
            const post = postsManifest.find(p => p.name === filename);
            if (!post) { displayOutput(`less: ${filename}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${filename}`);
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
                modalFooter.innerHTML = `${filename} (Press 'q' to quit, Arrows/PgUp/PgDn/Home/End/Space to scroll)`;
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`less: ${filename}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
        },
        vi: async (args) => {
            if (args.length === 0) { displayOutput("Usage: vi <filename>", 'error'); return; }
            const filename = args[0];
            const post = postsManifest.find(p => p.name === filename);
            if (!post) { displayOutput(`vi: ${filename}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${filename}`);
                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                const textContent = await response.text();
                const lines = textContent.split('\n');
                let viFormattedContent = "";
                lines.forEach((line, index) => { viFormattedContent += `<span class="line-number">${String(index + 1).padStart(3,' ')}</span>${escapeHtml(line)}\n`; });
                currentView = 'vi';
                modalContentWrapper.classList.add('vi-mode'); modalContentWrapper.classList.remove('nano-mode', 'less-mode');
                modalNanoHeader.style.display = 'none';
                modalContent.innerHTML = `<div style="white-space: pre;">${viFormattedContent}</div>`;
                
                modalFooter.innerHTML = `"${filename}" [readonly] (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (vi):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);

                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`vi: ${filename}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
        },
        nano: async (args) => {
            if (args.length === 0) { displayOutput("Usage: nano <filename>", 'error'); return; }
            const filename = args[0];
            const post = postsManifest.find(p => p.name === filename);
            if (!post) { displayOutput(`nano: ${filename}: No such file`, 'error'); return; }
            try {
                const response = await fetch(`public/posts/${filename}`);
                if (!response.ok) throw new Error(`File not found (status ${response.status})`);
                const textContent = await response.text();
                currentView = 'nano';
                modalContentWrapper.classList.add('nano-mode'); modalContentWrapper.classList.remove('vi-mode', 'less-mode');
                modalNanoHeader.textContent = `GNU nano (simulated)  File: ${filename}`;
                modalNanoHeader.style.display = 'block';
                modalContent.innerHTML = `<div style="white-space: pre;">${escapeHtml(textContent)}</div>`;

                modalFooter.innerHTML = `^X Exit (Press 'q' to quit)`;
                const copyAllButton = document.createElement('button');
                copyAllButton.textContent = 'Copy All'; copyAllButton.className = 'modal-copy-all-button';
                copyAllButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(textContent).then(() => { copyAllButton.textContent = 'Copied!'; copyAllButton.classList.add('copied'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('copied');}, 2000);}).catch(err => { console.error('Failed to copy (nano):', err); copyAllButton.textContent = 'Error!'; copyAllButton.classList.add('error'); setTimeout(()=> { copyAllButton.textContent='Copy All'; copyAllButton.classList.remove('error');}, 2000);}); };
                modalFooter.appendChild(copyAllButton);
                
                modalView.style.display = 'flex'; modalContent.scrollTop = 0; if(activeCommandInput) activeCommandInput.disabled = true;
            } catch (error) { displayOutput(`nano: ${filename}: ${error.message}`, 'error'); if(activeCommandInput) activeCommandInput.disabled = false; }
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
        }
    };
    
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

    function handleGlobalKeyPress(e) { 
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
    
    init();
});
