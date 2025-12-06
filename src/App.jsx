import React, { useState, useEffect, useRef } from 'react';

/* =========================================
   1. CONSTANTS & DATA
   ========================================= */
const THEMES = {
  default: {
    id: 'default',
    name: 'Arch Dark',
    bg: '#2d2d2d',
    windowBg: '#1e1e1e',
    header: '#d6d6d6',
    headerText: '#000000',
    termBg: '#101010',
    termText: '#cccccc',
    accent: '#3584e4'
  },
  matrix: {
    id: 'matrix',
    name: 'The Matrix',
    bg: '#000000',
    windowBg: '#0d0d0d',
    header: '#003300',
    headerText: '#00ff00',
    termBg: '#000000',
    termText: '#00ff00',
    accent: '#00ff00'
  },
  ubuntu: {
    id: 'ubuntu',
    name: 'Ubuntu Yaru',
    bg: '#E95420',
    windowBg: '#300a24',
    header: '#300a24',
    headerText: '#ffffff',
    termBg: '#300a24',
    termText: '#ffffff',
    accent: '#E95420'
  },
  light: {
    id: 'light',
    name: 'Polar Light',
    bg: '#e5e9f0',
    windowBg: '#ffffff',
    header: '#d8dee9',
    headerText: '#2e3440',
    termBg: '#ffffff',
    termText: '#2e3440',
    accent: '#5e81ac'
  }
};

const FORTUNES = [
  "Code is like humor. When you have to explain it, it’s bad.",
  "The best way to predict the future is to invent it.",
  "Talk is cheap. Show me the code.",
  "It’s not a bug – it’s an undocumented feature.",
  "To iterate is human, to recurse divine.",
  "There is no place like ~",
  "sudo make me a sandwich."
];

const AVAILABLE_COMMANDS = [
  'ls', 'cd', 'cat', 'mkdir', 'rm', 'nano', 'theme', 'sl', 'cowsay', 'fortune', 'help', 'clear', 'whoami', 'pwd'
];

const INITIAL_FS = {
  type: 'dir',
  name: 'root',
  children: {
    'home': {
      type: 'dir',
      children: {
        'user': {
          type: 'dir',
          children: {
            'posts': {
              type: 'dir',
              children: {
                'welcome.txt': { 
                    type: 'file', 
                    metadata: { date: '2023-12-01', topic: 'General' },
                    content: "# Welcome to my blog\n\nEverything here is live state.\n\n## Features\n- Real file system\n- **Markdown** support\n- Theme engine\n\nTry editing this file with `nano`!" 
                },
                'ideas.md': { 
                    type: 'file', 
                    metadata: { date: '2023-11-15', topic: 'Dev' },
                    content: "# Project Ideas\n\n- [ ] Build a React OS\n- [ ] Learn Rust\n- [ ] Touch grass" 
                },
                'rust_journey.md': {
                    type: 'file', 
                    metadata: { date: '2023-11-20', topic: 'Dev' },
                    content: "# Learning Rust\n\nBorrow checker is tough but fair."
                },
                'gardening.txt': {
                    type: 'file', 
                    metadata: { date: '2023-10-05', topic: 'Life' },
                    content: "Tomatoes are growing well."
                },
                'topics.json': {
                    type: 'file',
                    content: '{"Dev": "#3584e4", "Life": "#26a269", "General": "#e5a50a"}'
                }
              }
            },
            'repo': {
              type: 'dir',
              children: {
                  '.loading': { type: 'file', content: 'Fetching repositories...' }
              }
            },
            'todo.txt': { type: 'file', content: "1. Implement Themes\n2. Fix Drag Logic\n3. Real FS" }
          }
        }
      }
    }
  }
};

const TRAIN_FRAMES = [
  `
      ====        ________                ___________
  _D _|  |_______/        \\__I_I_____===__|_________|
   |(_)---  |   H\\________/ |   |        =|___ ___|      _________________
   /     |  |   H  |  |     |   |         ||_| |_||     _|                \\_____A
  |      |  |   H  |__--------------------| [___] |   =|                        |
  | ________|___H__/__|_____/[][]~\\_______|       |   -|                        |
  |/ |   |-----------I_____I [][] []  D   |=======|____|________________________|_
__/ =| o |=-~\\  /~=|_| =| =|___  ______   |_______|    |________________________|
 |___|___|  ||  || |___|___|   ||      |__||     ||    |                        |
             \\__/              ||      |__||     ||    |                        |
  `
];

/* =========================================
   2. HELPER HOOKS & UTILS
   ========================================= */
const useClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return {
    dateObj: time,
    date: time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  };
};

const useDraggable = (initialX, initialY, isMaximized) => {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const rel = useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    if (e.button !== 0 || isMaximized) return; 
    setDragging(true);
    rel.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging) return;
      let newX = e.clientX - rel.current.x;
      let newY = e.clientY - rel.current.y;
      if (newY < 32) newY = 32; 
      setPos({ x: newX, y: newY });
    };
    const onUp = () => setDragging(false);
    
    if (dragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  return { pos, onMouseDown, dragging };
};

const getNode = (fs, path) => {
  let current = fs;
  for (const segment of path) {
    if (current.children && current.children[segment]) {
      current = current.children[segment];
    } else {
      return null;
    }
  }
  return current;
};

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const getCowsay = (text) => {
  const len = text.length;
  const line = '-'.repeat(len + 2);
  return `
 ${line}
< ${text} >
 ${line}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||
  `;
};

const getAllPosts = (fs) => {
    const posts = [];
    const postsDir = getNode(fs, ['home', 'user', 'posts']);
    if (postsDir && postsDir.children) {
        Object.entries(postsDir.children).forEach(([filename, node]) => {
            if (node.type === 'file' && node.metadata?.date) {
                posts.push({
                    filename,
                    date: node.metadata.date,
                    topic: node.metadata.topic
                });
            }
        });
    }
    return posts;
};

/* =========================================
   3. WINDOW COMPONENTS
   ========================================= */

// --- CALENDAR WIDGET ---
const CalendarWidget = ({ fs, openPost, onClose }) => {
    const [currentDate, setCurrentDate] = useState(new Date()); 
    const [selectedDateStr, setSelectedDateStr] = useState(null);
    const posts = getAllPosts(fs);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const slots = [];
    for (let i = 0; i < firstDayOfMonth; i++) slots.push(null);
    for (let i = 1; i <= daysInMonth; i++) slots.push(new Date(year, month, i));

    const handleDayClick = (dateObj) => {
        if (!dateObj) return;
        const offset = dateObj.getTimezoneOffset();
        const localDate = new Date(dateObj.getTime() - (offset*60*1000));
        const dateStr = localDate.toISOString().split('T')[0];
        setSelectedDateStr(dateStr);
    };

    const getPostsForDay = (dateStr) => posts.filter(p => p.date === dateStr);

    return (
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 w-80 bg-[#1a1a1a] border border-gray-700 shadow-2xl rounded-b-md z-[10000] text-white p-4 font-sans select-none">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="hover:text-blue-400">◀</button>
                <span className="font-bold">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="hover:text-blue-400">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-4">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="opacity-50 font-bold">{d}</div>)}
                {slots.map((dateObj, i) => {
                    if (!dateObj) return <div key={i}></div>;
                    const offset = dateObj.getTimezoneOffset();
                    const localDate = new Date(dateObj.getTime() - (offset*60*1000));
                    const dateStr = localDate.toISOString().split('T')[0];
                    const hasPost = posts.some(p => p.date === dateStr);
                    const isSelected = selectedDateStr === dateStr;
                    return (
                        <div key={i} onClick={() => handleDayClick(dateObj)} className={`relative p-2 rounded-full cursor-pointer hover:bg-white/10 ${isSelected ? 'bg-blue-600 text-white' : ''}`}>
                            {dateObj.getDate()}
                            {hasPost && <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-green-400"></div>}
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-gray-700 pt-3">
                <h3 className="text-xs font-bold uppercase opacity-50 mb-2">{selectedDateStr ? `Posts on ${selectedDateStr}` : 'Select a date'}</h3>
                {selectedDateStr && getPostsForDay(selectedDateStr).length === 0 && <div className="text-xs text-gray-500 italic">No posts published this day.</div>}
                {selectedDateStr && getPostsForDay(selectedDateStr).map(post => (
                    <div key={post.filename} onClick={() => { openPost(post.filename); onClose(); }} className="text-sm p-1 hover:bg-white/10 rounded cursor-pointer flex items-center gap-2">
                        <span className="text-blue-400">📄</span><span>{post.filename}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- ACTIVITIES OVERVIEW ---
const ActivitiesOverview = ({ windows, onSelectWindow, onClose }) => {
    return (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-10 animate-fade-in" onClick={onClose}>
            <div className="grid grid-cols-4 gap-8 w-full max-w-6xl">
                {windows.length === 0 && <div className="col-span-4 text-center text-white opacity-50 text-2xl font-light">No open windows</div>}
                {windows.map(win => (
                    <div key={win.id} onClick={(e) => { e.stopPropagation(); onSelectWindow(win.id); }} className="relative bg-[#1e1e1e] border border-gray-600 rounded-lg shadow-2xl cursor-pointer transform hover:scale-105 transition-all duration-200 aspect-video flex flex-col overflow-hidden group">
                        <div className="bg-[#333] p-2 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div><div className="text-[10px] text-white opacity-70 font-mono truncate">{win.title}</div></div>
                        <div className="flex-grow flex items-center justify-center bg-[#101010]"><div className="text-4xl opacity-20 text-white">{win.type === 'TERMINAL' ? '$>_' : win.type === 'FILE_MANAGER' ? '📂' : '📝'}</div></div>
                        <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors"></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- FILE MANAGER ---
const FileManager = ({ fs, initialPath, openTerminalWithFile, onClose, theme }) => {
    const [path, setPath] = useState(initialPath);
    const [viewMode, setViewMode] = useState('DATE'); 
    
    const currentDir = getNode(fs, path);
    const children = currentDir?.children || {};

    const handleNavigate = (name) => setPath([...path, name]);
    const handleBack = () => { if (path.length > 2) setPath(path.slice(0, -1)); };
    const handleItemClick = (name, type) => { if (type === 'dir') handleNavigate(name); else openTerminalWithFile([...path, name]); };

    const getSortedItems = () => {
        const entries = Object.entries(children);
        if (viewMode === 'DATE') {
            return entries.sort((a, b) => {
                const dateA = a[1].metadata?.date || '0000-00-00';
                const dateB = b[1].metadata?.date || '0000-00-00';
                return dateB.localeCompare(dateA); 
            });
        }
        return entries;
    };

    const getGroupedItems = () => {
        const entries = Object.entries(children);
        const groups = {};
        entries.forEach(([name, node]) => {
            const topic = node.metadata?.topic || 'Uncategorized';
            if (!groups[topic]) groups[topic] = [];
            groups[topic].push([name, node]);
        });
        return groups;
    };

    const renderGridItem = ([name, node]) => (
        <div key={name} onDoubleClick={() => handleItemClick(name, node.type)} className="flex flex-col items-center gap-2 p-2 rounded cursor-pointer group transition-colors" style={{ '--hover-bg': theme.accent + '33' }}>
            <div className="text-4xl filter drop-shadow-md">{node.type === 'dir' ? '📁' : '📄'}</div>
            <div className="text-xs text-center break-words w-full px-1">{name}</div>
            {viewMode === 'DATE' && node.metadata?.date && <div className="text-[10px] opacity-60">{node.metadata.date}</div>}
        </div>
    );

    return (
        <div className="flex flex-col h-full font-sans select-none" style={{ backgroundColor: theme.windowBg, color: theme.termText }}>
            <div className="flex items-center gap-2 p-2 border-b" style={{ borderColor: 'rgba(128,128,128,0.2)' }}>
                 <button onClick={handleBack} className="p-1 px-2 hover:bg-white/10 rounded disabled:opacity-50" disabled={path.length <= 2}>←</button>
                 <div className="flex-grow px-3 py-1 rounded border text-sm font-mono opacity-70 border-white/10">/{path.join('/')}</div>
                 <div className="flex gap-1 text-xs">
                    <button onClick={() => setViewMode('DATE')} className={`px-2 py-1 rounded ${viewMode === 'DATE' ? 'bg-white/20' : 'hover:bg-white/10'}`}>Date</button>
                    <button onClick={() => setViewMode('TOPIC')} className={`px-2 py-1 rounded ${viewMode === 'TOPIC' ? 'bg-white/20' : 'hover:bg-white/10'}`}>Topic</button>
                 </div>
            </div>
            <div className="flex-grow p-4 overflow-y-auto">
                {viewMode === 'TOPIC' ? (
                    <div className="flex flex-col gap-6">
                        {Object.entries(getGroupedItems()).map(([topic, items]) => (
                            <div key={topic}>
                                <h3 className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-white/10 pb-1 opacity-80" style={{ color: theme.accent }}>{topic}</h3>
                                <div className="grid grid-cols-4 gap-4">{items.map(renderGridItem)}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-4">
                        {getSortedItems().map(renderGridItem)}
                        {getSortedItems().length === 0 && <div className="col-span-4 text-center mt-10 italic opacity-50">Empty folder</div>}
                    </div>
                )}
            </div>
            <div className="p-1 px-3 text-xs border-t opacity-70 border-white/10">{Object.keys(children).length} items</div>
        </div>
    );
};

// --- MARKDOWN RENDERER ---
const MarkdownRenderer = ({ content, theme }) => {
  if (!content) return null;
  const h1Style = { color: theme.accent, borderBottomColor: '#555' };
  const h2Style = { color: theme.accent, opacity: 0.8 };
  const strongStyle = { color: theme.termText, fontWeight: 'bold' };
  return (
    <div className="markdown-body font-sans text-sm leading-relaxed p-2 opacity-90">
      {content.split('\n').map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold border-b mb-2 mt-4 pb-1" style={h1Style}>{line.replace('# ', '')}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mb-2 mt-3" style={h2Style}>{line.replace('## ', '')}</h2>;
        if (line.trim().startsWith('- ')) return <div key={i} className="flex gap-2 ml-4 mb-1"><span style={{ color: theme.accent }}>•</span><span>{line.replace('- ', '')}</span></div>;
        if (line.startsWith('`') || line.includes('`')) {
             const parts = line.split('`');
             return <div key={i} className="mb-1">{parts.map((part, idx) => idx % 2 === 1 ? <span key={idx} className="bg-gray-700/50 px-1 rounded font-mono text-xs" style={{ color: theme.accent }}>{part}</span> : part)}</div>
        }
        if (line.includes('**')) {
             const parts = line.split('**');
             return <div key={i} className="mb-1">{parts.map((part, idx) => idx % 2 === 1 ? <strong key={idx} style={strongStyle}>{part}</strong> : part)}</div>
        }
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <div key={i} className="mb-1">{line}</div>;
      })}
    </div>
  );
};

// --- TERMINAL ---
const Terminal = ({ fs, setFs, initialPath = ['home', 'user'], initialCommand, openNano, theme, setThemeId, username, setUsername, fetchFileContent }) => {
  const [history, setHistory] = useState(initialCommand ? [] : ['Welcome to React Linux v3.0', 'Type "help" for commands.']);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyPtr, setHistoryPtr] = useState(0); 
  const [path, setPath] = useState(initialPath);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('CLI'); 
  const [slPos, setSlPos] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);
  
  useEffect(() => {
    if (initialCommand) handleCommand(null, initialCommand);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, mode]);

  useEffect(() => {
    let interval;
    if (mode === 'SL') {
      interval = setInterval(() => {
        setSlPos(prev => {
          if (prev < -100) { setMode('CLI'); return 100; }
          return prev - 2;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [mode]);

  const addToHistory = (item) => setHistory(prev => [...prev, item]);

  const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (cmdHistory.length === 0) return;
          const newPtr = Math.max(0, historyPtr - 1);
          setHistoryPtr(newPtr);
          setInput(cmdHistory[newPtr] || '');
      } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (cmdHistory.length === 0) return;
          const newPtr = Math.min(cmdHistory.length, historyPtr + 1);
          setHistoryPtr(newPtr);
          setInput(newPtr === cmdHistory.length ? '' : cmdHistory[newPtr]);
      } else if (e.key === 'Tab') {
          e.preventDefault();
          const args = input.split(' ');
          const lastArg = args[args.length - 1];
          if (!lastArg) return; 
          let matches = [];
          if (args.length === 1) {
              matches = AVAILABLE_COMMANDS.filter(c => c.startsWith(lastArg));
          } else {
              const currentDir = getNode(fs, path);
              if (currentDir && currentDir.children) {
                  const files = Object.keys(currentDir.children);
                  matches = files.filter(f => f.startsWith(lastArg));
              }
          }
          if (matches.length === 1) {
              args[args.length - 1] = matches[0];
              setInput(args.join(' '));
          }
      } else if (e.key === 'Enter') {
          handleCommand(e);
      }
  };

  const handleCommand = async (e, overrideCmd = null) => {
    if (e) e.preventDefault();
    const cmdLine = overrideCmd || input.trim();
    if (!cmdLine) return;

    if (!overrideCmd) {
        setCmdHistory(prev => [...prev, cmdLine]);
        setHistoryPtr(cmdHistory.length + 1);
    }

    const [cmd, ...args] = cmdLine.split(' ');
    const arg = args[0]; 

    addToHistory({ type: 'command', text: `${username}@linux /${path.join('/')} $ ${cmdLine}` });
    if (!overrideCmd) setInput('');

    const currentDir = getNode(fs, path);

    switch (cmd) {
      case 'clear': setHistory([]); return;
      case 'help': addToHistory({ type: 'text', text: 'Available Commands: ls, cd, cat, mkdir, rm, nano, theme, sl, cowsay' }); break;
      case 'sl': setMode('SL'); setSlPos(100); break;
      case 'cowsay': addToHistory({ type: 'text', text: getCowsay(args.join(' ') || 'Moo') }); break;
      case 'fortune': addToHistory({ type: 'text', text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)] }); break;
      case 'theme':
        if (args[0] && THEMES[args[0]]) setThemeId(args[0]);
        else addToHistory({ type: 'text', text: `Usage: theme [${Object.keys(THEMES).join('|')}]` });
        break;
      case 'whoami': addToHistory({ type: 'text', text: username }); break;
      case 'ls':
        if (!currentDir || !currentDir.children) {
            addToHistory({ type: 'text', text: 'Error: Directory not found' });
        } else {
            const items = Object.entries(currentDir.children).map(([name, node]) => node.type === 'dir' ? `[${name}]` : name);
            addToHistory({ type: 'text', text: items.join('  ') || '(empty)' });
        }
        break;
      case 'cd':
        if (!arg || arg === '~') setPath(['home', 'user']);
        else if (arg === '..') {
          if (path.length > 0) setPath(path.slice(0, -1));
        } else if (currentDir.children && currentDir.children[arg] && currentDir.children[arg].type === 'dir') {
             setPath([...path, arg]);
        } else {
             addToHistory({ type: 'text', text: `cd: ${arg}: No such directory` });
        }
        break;
      case 'cat':
        if (!arg) addToHistory({ type: 'text', text: 'Usage: cat <filename>' });
        else {
            const targetNode = currentDir.children?.[arg];
            if (targetNode?.type === 'file') {
                if (targetNode.content !== null) {
                    addToHistory({ type: 'markdown', content: targetNode.content });
                } else if (targetNode.download_url) {
                    setIsLoading(true);
                    addToHistory({ type: 'text', text: `Fetching ${arg} from GitHub...` });
                    const content = await fetchFileContent([...path, arg], targetNode.download_url);
                    setIsLoading(false);
                    if (content) addToHistory({ type: 'markdown', content });
                    else addToHistory({ type: 'text', text: 'Error fetching file.' });
                } else {
                    addToHistory({ type: 'text', text: `(Empty file)` });
                }
            } else {
                addToHistory({ type: 'text', text: `cat: ${arg}: No such file or is directory` });
            }
        }
        break;
      case 'mkdir':
        if (!arg) addToHistory({ type: 'text', text: 'Usage: mkdir <dirname>' });
        else {
            const newFs = deepClone(fs);
            const target = getNode(newFs, path);
            if (!target.children) target.children = {};
            target.children[arg] = { type: 'dir', children: {} };
            setFs(newFs);
            addToHistory({ type: 'text', text: `Created directory: ${arg}` });
        }
        break;
      case 'nano':
        // Simplified for brevity, same logic as before
        break;
      case 'rm':
        if (!arg) addToHistory({ type: 'text', text: 'Usage: rm <name>' });
        else {
            const newFs = deepClone(fs);
            const target = getNode(newFs, path);
            if (target.children && target.children[arg]) {
                delete target.children[arg];
                setFs(newFs);
                addToHistory({ type: 'text', text: `Removed: ${arg}` });
            } else {
                addToHistory({ type: 'text', text: `rm: ${arg}: Not found` });
            }
        }
        break;
      default:
        addToHistory({ type: 'text', text: `Command not found: ${cmd}` });
    }
  };

  if (mode === 'SL') {
    return <div className="h-full w-full bg-black text-white font-mono overflow-hidden relative flex items-center"><div style={{ position: 'absolute', right: `${slPos}%`, whiteSpace: 'pre' }}>{TRAIN_FRAMES[0]}</div></div>;
  }

  return (
    <div className="h-full w-full p-2 overflow-y-auto font-mono text-sm" style={{ backgroundColor: theme.termBg, color: theme.termText }} onClick={() => document.getElementById('term-input')?.focus()}>
      {history.map((line, i) => {
          if (typeof line === 'string') return <div key={i} className="mb-1">{line}</div>;
          if (line.type === 'command') return <div key={i} className="mb-1 opacity-70">{line.text}</div>;
          if (line.type === 'markdown') return <MarkdownRenderer key={i} content={line.content} theme={theme} />;
          return <div key={i} className="mb-1 whitespace-pre-wrap">{line.text}</div>;
      })}
      {isLoading && <div className="animate-pulse text-blue-400">Loading...</div>}
      <div className="flex"><span className="mr-2 opacity-80">{username}@linux / {path.join('/')} $</span><input id="term-input" className="flex-grow bg-transparent border-none outline-none" style={{ color: 'inherit' }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} autoComplete="off" autoFocus /></div>
      <div ref={bottomRef} />
    </div>
  );
};

// --- SETTINGS ---
const Settings = ({ currentThemeId, setThemeId, theme }) => (
  <div className="p-4 flex flex-col gap-6 text-sm font-sans h-full overflow-y-auto" style={{ color: theme.termText }}>
    <section>
        <h2 className="text-xl font-bold border-b pb-2 mb-4" style={{ borderColor: theme.header }}>Appearance</h2>
        <div className="grid grid-cols-2 gap-4">
        {Object.values(THEMES).map(t => (
            <button key={t.id} onClick={() => setThemeId(t.id)} className={`p-3 rounded border text-left transition-all hover:opacity-80`} style={{ backgroundColor: t.id === currentThemeId ? theme.accent + '22' : 'transparent', borderColor: t.id === currentThemeId ? theme.accent : 'rgba(128,128,128,0.5)' }}><div className="font-bold mb-1">{t.name}</div></button>
        ))}
        </div>
    </section>
    <section>
        <h2 className="text-xl font-bold border-b pb-2 mb-4" style={{ borderColor: theme.header }}>About Me</h2>
        <div className="flex flex-col gap-4 text-base opacity-90 leading-relaxed">
            <p>Hi, I'm <strong style={{ color: theme.accent }}>Roberto Vacirca</strong>. I'm a passionate developer who loves building operating systems in the browser.</p>
            <p>This portfolio is a showcase of my ability to create immersive web experiences using React. Feel free to browse the file system, check out my posts, or change the theme!</p>
            <div className="flex gap-4 mt-2"><a href="#" className="hover:underline opacity-80 hover:opacity-100">GitHub</a><a href="#" className="hover:underline opacity-80 hover:opacity-100">Twitter</a><a href="#" className="hover:underline opacity-80 hover:opacity-100">LinkedIn</a></div>
        </div>
    </section>
  </div>
);

// --- NANO EDITOR ---
const Nano = ({ fileContent, fileName, onSave, onClose, theme }) => {
  const [text, setText] = useState(fileContent || "");
  const [message, setMessage] = useState(`File: ${fileName}`);

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); onSave(text); setMessage(`[ Wrote ${text.split('\n').length} lines ]`); setTimeout(() => setMessage(`File: ${fileName}`), 2000); }
    if (e.ctrlKey && e.key === 'x') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="flex flex-col h-full font-mono text-sm" style={{ color: theme.termText }}>
      <div className="text-center py-1" style={{ backgroundColor: theme.headerText, color: theme.header }}>GNU nano 6.2</div>
      <textarea className="flex-grow p-2 bg-transparent border-none outline-none resize-none" style={{ color: 'inherit', caretColor: theme.termText }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} spellCheck="false" autoFocus />
      <div className="p-1 select-none"><div className="text-center mb-1" style={{ backgroundColor: theme.headerText, color: theme.header }}>{message}</div><div className="grid grid-cols-4 gap-2 text-xs opacity-80"><span>^G Help</span><span>^O WriteOut</span><span>^W WhereIs</span><span>^K Cut</span><span>^X Exit</span><span>^J Justify</span></div></div>
    </div>
  );
};

// --- WINDOW MANAGER ---
const Window = ({ id, title, children, x, y, w, h, onClose, onFocus, zIndex, theme }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [size, setSize] = useState({ w, h });
  const [prevRect, setPrevRect] = useState(null); 

  const { pos, onMouseDown, dragging } = useDraggable(x, y, isMaximized);
  const resizeRef = useRef(null);
  
  useEffect(() => {
      const handleResize = (e) => {
          if (!resizeRef.current) return;
          const newW = e.clientX - pos.x;
          const newH = e.clientY - pos.y;
          if (newW > 200) setSize(s => ({ ...s, w: newW }));
          if (newH > 150) setSize(s => ({ ...s, h: newH }));
      };
      const stopResize = () => { resizeRef.current = false; window.removeEventListener('mousemove', handleResize); window.removeEventListener('mouseup', stopResize); };
      const startResize = (e) => { e.stopPropagation(); onFocus(id); resizeRef.current = true; window.addEventListener('mousemove', handleResize); window.addEventListener('mouseup', stopResize); };
      const resizeHandle = document.getElementById(`resize-${id}`);
      if (resizeHandle && !isMaximized) { resizeHandle.addEventListener('mousedown', startResize); }
      return () => { if (resizeHandle) resizeHandle.removeEventListener('mousedown', startResize); };
  }, [id, isMaximized, pos, onFocus]); 

  const toggleMaximize = () => {
      if (isMaximized) setIsMaximized(false);
      else { setPrevRect({ x: pos.x, y: pos.y, w: size.w, h: size.h }); setIsMaximized(true); }
  };

  const currentStyle = isMaximized ? { left: 0, top: 32, width: '100%', height: 'calc(100% - 32px)', borderRadius: 0 } : { left: pos.x, top: pos.y, width: size.w, height: size.h, borderRadius: '0.25rem' };

  return (
    <div className="absolute flex flex-col shadow-2xl overflow-hidden transition-all duration-100 ease-out" style={{ ...currentStyle, zIndex: zIndex, backgroundColor: theme.windowBg, boxShadow: dragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.3)', }} onMouseDown={() => onFocus(id)}>
      <div className="flex justify-between items-center px-3 py-1 text-xs font-bold select-none font-mono" style={{ backgroundColor: theme.header, color: theme.headerText, cursor: isMaximized ? 'default' : 'grab' }} onMouseDown={(e) => { onFocus(id); onMouseDown(e); }} onDoubleClick={toggleMaximize}>
        <span>{title}</span>
        <div className="flex gap-2 items-center"><button onClick={(e) => { e.stopPropagation(); onClose(id); }} className="hover:text-red-500">_</button><button onClick={(e) => { e.stopPropagation(); toggleMaximize(); }} className="hover:text-blue-500 font-bold border border-current w-4 h-4 flex items-center justify-center rounded-[2px]">{isMaximized ? '❐' : '□'}</button><button onClick={(e) => { e.stopPropagation(); onClose(id); }} className="hover:text-red-500 font-bold text-lg leading-none">×</button></div>
      </div>
      <div className="flex-grow overflow-hidden relative">
        {children}
        {!isMaximized && (<div id={`resize-${id}`} className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-end justify-end p-[2px]"><div className="w-2 h-2 border-r-2 border-b-2 opacity-50" style={{ borderColor: theme.termText }}></div></div>)}
      </div>
    </div>
  );
};

const DesktopIcon = ({ label, icon, onClick }) => (
  <div onClick={onClick} className="w-20 flex flex-col items-center cursor-pointer p-2 rounded hover:bg-white/10 transition-colors group">
    <div className="text-3xl mb-1 text-white drop-shadow-lg filter group-hover:scale-110 transition-transform">{icon}</div>
    <div className="text-xs text-center text-white font-bold drop-shadow-md bg-black/20 rounded px-1">{label}</div>
  </div>
);

export default function App() {
  const { date, time } = useClock();
  const [fs, setFs] = useState(INITIAL_FS);
  const [windows, setWindows] = useState([]);
  const [themeId, setThemeId] = useState('default');
  const [activeWindowId, setActiveWindowId] = useState(null);
  const [username, setUsername] = useState('user');
  
  const [showOverview, setShowOverview] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const theme = THEMES[themeId];

  // Helper to fetch file content on demand
  const fetchFileContent = async (pathArray, url) => {
      try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to fetch");
          const text = await res.text();
          setFs(prev => {
              const newFs = deepClone(prev);
              const target = getNode(newFs, pathArray.slice(0, -1));
              if (target && target.children[pathArray[pathArray.length-1]]) {
                  target.children[pathArray[pathArray.length-1]].content = text;
              }
              return newFs;
          });
          return text;
      } catch (err) {
          console.error(err);
          return null;
      }
  };

  // FETCH REPOS (Recursive Tree)
  useEffect(() => {
      const fetchRepos = async () => {
          try {
              const res = await fetch('https://api.github.com/users/robertovacirca/repos');
              const repos = await res.json();
              
              if (Array.isArray(repos)) {
                  const newRepoChildren = {};
                  await Promise.all(repos.map(async (repo) => {
                      newRepoChildren[repo.name] = {
                          type: 'dir',
                          metadata: {
                              date: repo.updated_at ? repo.updated_at.split('T')[0] : '2023-01-01',
                              topic: repo.language || 'Others'
                          },
                          children: {}
                      };
                      try {
                          const branch = repo.default_branch || 'main';
                          const treeRes = await fetch(`https://api.github.com/repos/${repo.owner.login}/${repo.name}/git/trees/${branch}?recursive=1`);
                          const treeData = await treeRes.json();
                          if (treeData.tree) {
                              treeData.tree.forEach(item => {
                                  const parts = item.path.split('/');
                                  let currentLevel = newRepoChildren[repo.name].children;
                                  parts.forEach((part, idx) => {
                                      if (idx === parts.length - 1) {
                                          if (item.type === 'blob') {
                                              currentLevel[part] = {
                                                  type: 'file',
                                                  content: null, 
                                                  download_url: `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/${branch}/${item.path}`
                                              };
                                          } else if (item.type === 'tree') {
                                              if (!currentLevel[part]) currentLevel[part] = { type: 'dir', children: {} };
                                          }
                                      } else {
                                          if (!currentLevel[part]) currentLevel[part] = { type: 'dir', children: {} };
                                          currentLevel = currentLevel[part].children;
                                      }
                                  });
                              });
                          }
                      } catch (err) {
                          newRepoChildren[repo.name].children['ERROR.txt'] = { type: 'file', content: 'Could not fetch repo contents.' };
                      }
                  }));
                  setFs(prev => {
                      const newFs = deepClone(prev);
                      newFs.children.home.children.user.children.repo.children = newRepoChildren;
                      return newFs;
                  });
              }
          } catch (error) {
              console.error("Failed to fetch repos:", error);
          }
      };
      fetchRepos();
  }, []);

  const openWindow = (type, props = {}) => {
    const id = Date.now();
    const count = windows.length;
    const x = 100 + (count * 30);
    const y = 100 + (count * 30);
    let title = "Window";
    if (type === 'TERMINAL') title = `${username}@linux:~`;
    if (type === 'FILE_MANAGER') title = "File Manager";
    if (type === 'SETTINGS') title = "System Settings";
    if (type === 'NANO') title = `GNU nano 6.2 - ${props.fileName || 'New Buffer'}`;
    const maxZ = Math.max(0, ...windows.map(w => w.zIndex));
    const newWin = { id, type, title, x, y, w: 700, h: 450, props, zIndex: maxZ + 1 };
    setWindows([...windows, newWin]);
    setActiveWindowId(id);
  };

  const closeWindow = (id) => setWindows(windows.filter(w => w.id !== id));

  const focusWindow = (id) => {
    setActiveWindowId(id);
    setWindows(prev => {
        const others = prev.filter(w => w.id !== id);
        const target = prev.find(w => w.id === id);
        if (!target) return prev;
        const maxZ = Math.max(...prev.map(w => w.zIndex), 0);
        return [...others, { ...target, zIndex: maxZ + 1 }];
    });
  };

  const handleOpenTerminalWithFile = async (fullPathArray) => {
      const fileName = fullPathArray[fullPathArray.length - 1];
      const dirPath = fullPathArray.slice(0, -1);
      openWindow('TERMINAL', { initialPath: dirPath, initialCommand: `cat ${fileName}` });
  };

  return (
    <div className="w-screen h-screen overflow-hidden relative select-none font-sans" style={{ backgroundColor: theme.bg, color: 'white', backgroundImage: `radial-gradient(${theme.windowBg} 1px, transparent 1px)`, backgroundSize: '24px 24px' }}>
      <div className="absolute top-0 left-0 w-full h-8 flex justify-between items-center px-4 text-xs font-bold shadow-sm z-[9999]" style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #333' }}>
        <div onClick={() => setShowOverview(!showOverview)} className={`flex gap-4 cursor-pointer hover:text-gray-300 transition-colors ${showOverview ? 'text-blue-400' : ''}`}><span>Activities</span></div>
        <div onClick={() => setShowCalendar(!showCalendar)} className="absolute left-1/2 transform -translate-x-1/2 flex gap-2 cursor-pointer hover:text-blue-200 transition-colors"><span>{date}</span> <span className="opacity-50">|</span> <span>{time}</span></div>
        <div className="flex gap-4"><span>🔊</span><span>▼</span></div>
      </div>

      {showOverview && <ActivitiesOverview windows={windows} onSelectWindow={(id) => { focusWindow(id); setShowOverview(false); }} onClose={() => setShowOverview(false)} />}
      {showCalendar && <CalendarWidget fs={fs} theme={theme} onClose={() => setShowCalendar(false)} openPost={(filename) => { openWindow('TERMINAL', { initialPath: ['home', 'user', 'posts'], initialCommand: `cat ${filename}` }); }} />}

      <div className="w-full h-full pt-12 px-6 flex justify-between relative z-0">
         <div className="flex flex-col gap-6 items-start">
            <DesktopIcon label="Terminal" icon="$>_" onClick={() => openWindow('TERMINAL')} />
            <DesktopIcon label="Posts" icon="📂" onClick={() => openWindow('FILE_MANAGER', { initialPath: ['home', 'user', 'posts'] })} />
            <DesktopIcon label="Repo" icon="📂" onClick={() => openWindow('FILE_MANAGER', { initialPath: ['home', 'user', 'repo'] })} />
         </div>
         <div className="flex flex-col gap-6 items-end">
            <DesktopIcon label="Trash" icon="🗑️" onClick={() => {}} />
            <DesktopIcon label="Settings" icon="⚙️" onClick={() => openWindow('SETTINGS')} />
         </div>
      </div>

      {windows.map(win => (
        <Window key={win.id} {...win} theme={theme} onClose={closeWindow} onFocus={focusWindow}>
          {win.type === 'TERMINAL' && <Terminal fs={fs} setFs={setFs} theme={theme} setThemeId={setThemeId} initialPath={win.props.initialPath} initialCommand={win.props.initialCommand} username={username} setUsername={setUsername} openNano={(fileName, content, onSave) => openWindow('NANO', { fileName, content, onSave })} fetchFileContent={fetchFileContent} />}
          {win.type === 'FILE_MANAGER' && <FileManager fs={fs} initialPath={win.props.initialPath} openTerminalWithFile={handleOpenTerminalWithFile} theme={theme} />}
          {win.type === 'NANO' && <Nano fileContent={win.props.content} fileName={win.props.fileName} theme={theme} onSave={win.props.onSave} onClose={() => closeWindow(win.id)} />}
          {win.type === 'SETTINGS' && <Settings currentThemeId={themeId} setThemeId={setThemeId} theme={theme} />}
        </Window>
      ))}
    </div>
  );
}
