/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * This file is the entry point for browserify.
 */

/// <reference path="../typings/xterm.d.ts"/>

// Use tsc version (yarn watch)
import { Terminal } from '../out/browser/public/Terminal';
import { AttachAddon } from '../addons/xterm-addon-attach/out/AttachAddon';
import { FitAddon } from '../addons/xterm-addon-fit/out/FitAddon';
import { SearchAddon, ISearchOptions } from '../addons/xterm-addon-search/out/SearchAddon';
import { SerializeAddon } from '../addons/xterm-addon-serialize/out/SerializeAddon';
import { WebLinksAddon } from '../addons/xterm-addon-web-links/out/WebLinksAddon';
import { WebglAddon } from '../addons/xterm-addon-webgl/out/WebglAddon';
import { Unicode11Addon } from '../addons/xterm-addon-unicode11/out/Unicode11Addon';
import { LigaturesAddon } from '../addons/xterm-addon-ligatures/out/LigaturesAddon';

// Use webpacked version (yarn package)
// import { Terminal } from '../lib/xterm';
// import { AttachAddon } from 'xterm-addon-attach';
// import { FitAddon } from 'xterm-addon-fit';
// import { SearchAddon, ISearchOptions } from 'xterm-addon-search';
// import { SerializeAddon } from 'xterm-addon-serialize';
// import { WebLinksAddon } from 'xterm-addon-web-links';
// import { WebglAddon } from 'xterm-addon-webgl';
// import { Unicode11Addon } from 'xterm-addon-unicode11';
// import { LigaturesAddon } from 'xterm-addon-ligatures';

// Pulling in the module's types relies on the <reference> above, it's looks a
// little weird here as we're importing "this" module
import { Terminal as TerminalType, ITerminalOptions } from 'xterm';

export interface IWindowWithTerminal extends Window {
  term: TerminalType;
  Terminal?: typeof TerminalType;
  AttachAddon?: typeof AttachAddon;
  FitAddon?: typeof FitAddon;
  SearchAddon?: typeof SearchAddon;
  SerializeAddon?: typeof SerializeAddon;
  WebLinksAddon?: typeof WebLinksAddon;
  WebglAddon?: typeof WebglAddon;
  Unicode11Addon?: typeof Unicode11Addon;
  LigaturesAddon?: typeof LigaturesAddon;
}
declare let window: IWindowWithTerminal;

let term;
let protocol;
let socketURL;
let socket;
let pid;

type AddonType = 'attach' | 'fit' | 'search' | 'serialize' | 'unicode11' | 'web-links' | 'webgl' | 'ligatures';

interface IDemoAddon<T extends AddonType> {
  name: T;
  canChange: boolean;
  ctor:
    T extends 'attach' ? typeof AttachAddon :
    T extends 'fit' ? typeof FitAddon :
    T extends 'search' ? typeof SearchAddon :
    T extends 'serialize' ? typeof SerializeAddon :
    T extends 'web-links' ? typeof WebLinksAddon :
    T extends 'unicode11' ? typeof Unicode11Addon :
    T extends 'ligatures' ? typeof LigaturesAddon :
    typeof WebglAddon;
    instance?:
    T extends 'attach' ? AttachAddon :
    T extends 'fit' ? FitAddon :
    T extends 'search' ? SearchAddon :
    T extends 'serialize' ? SerializeAddon :
    T extends 'web-links' ? WebLinksAddon :
    T extends 'webgl' ? WebglAddon :
    T extends 'unicode11' ? typeof Unicode11Addon :
    T extends 'ligatures' ? typeof LigaturesAddon :
    never;
}

const addons: { [T in AddonType]: IDemoAddon<T>} = {
  attach: { name: 'attach', ctor: AttachAddon, canChange: false },
  fit: { name: 'fit', ctor: FitAddon, canChange: false },
  search: { name: 'search', ctor: SearchAddon, canChange: true },
  serialize: { name: 'serialize', ctor: SerializeAddon, canChange: true },
  'web-links': { name: 'web-links', ctor: WebLinksAddon, canChange: true },
  webgl: { name: 'webgl', ctor: WebglAddon, canChange: true },
  unicode11: { name: 'unicode11', ctor: Unicode11Addon, canChange: true },
  ligatures: { name: 'ligatures', ctor: LigaturesAddon, canChange: true }
};

const terminalContainer = document.getElementById('terminal-container');
const actionElements = {
  findNext: <HTMLInputElement>document.querySelector('#find-next'),
  findPrevious: <HTMLInputElement>document.querySelector('#find-previous')
};
const paddingElement = <HTMLInputElement>document.getElementById('padding');

function setPadding(): void {
  term.element.style.padding = parseInt(paddingElement.value, 10).toString() + 'px';
  addons.fit.instance.fit();
}

function getSearchOptions(e: KeyboardEvent): ISearchOptions {
  return {
    regex: (document.getElementById('regex') as HTMLInputElement).checked,
    wholeWord: (document.getElementById('whole-word') as HTMLInputElement).checked,
    caseSensitive: (document.getElementById('case-sensitive') as HTMLInputElement).checked,
    incremental: e.key !== `Enter`
  };
}

const disposeRecreateButtonHandler = () => {
  // If the terminal exists dispose of it, otherwise recreate it
  if (term) {
    term.dispose();
    term = null;
    window.term = null;
    socket = null;
    addons.attach.instance = undefined;
    addons.fit.instance = undefined;
    addons.search.instance = undefined;
    addons.serialize.instance = undefined;
    addons.unicode11.instance = undefined;
    addons.ligatures.instance = undefined;
    addons['web-links'].instance = undefined;
    addons.webgl.instance = undefined;
    document.getElementById('dispose').innerHTML = 'Recreate Terminal';
  } else {
    createTerminal();
    document.getElementById('dispose').innerHTML = 'Dispose terminal';
  }
};

if (document.location.pathname === '/test') {
  window.Terminal = Terminal;
  window.AttachAddon = AttachAddon;
  window.FitAddon = FitAddon;
  window.SearchAddon = SearchAddon;
  window.SerializeAddon = SerializeAddon;
  window.Unicode11Addon = Unicode11Addon;
  window.LigaturesAddon = LigaturesAddon;
  window.WebLinksAddon = WebLinksAddon;
  window.WebglAddon = WebglAddon;
} else {
  createTerminal();
  document.getElementById('dispose').addEventListener('click', disposeRecreateButtonHandler);
  document.getElementById('serialize').addEventListener('click', serializeButtonHandler);
  document.getElementById('custom-glyph').addEventListener('click', writeCustomGlyphHandler);
  document.getElementById('load-test').addEventListener('click', loadTest);
}

function createTerminal(): void {
  // Clean terminal
  while (terminalContainer.children.length) {
    terminalContainer.removeChild(terminalContainer.children[0]);
  }

  const isWindows = ['Windows', 'Win16', 'Win32', 'WinCE'].indexOf(navigator.platform) >= 0;
  term = new Terminal({
    windowsMode: isWindows,
    fontFamily: 'Fira Code, courier-new, courier, monospace'
  } as ITerminalOptions);

  // Load addons
  const typedTerm = term as TerminalType;
  addons.search.instance = new SearchAddon();
  addons.serialize.instance = new SerializeAddon();
  addons.fit.instance = new FitAddon();
  addons.unicode11.instance = new Unicode11Addon();
  // TODO: Remove arguments when link provider API is the default
  addons['web-links'].instance = new WebLinksAddon(undefined, undefined, true);
  typedTerm.loadAddon(addons.fit.instance);
  typedTerm.loadAddon(addons.search.instance);
  typedTerm.loadAddon(addons.serialize.instance);
  typedTerm.loadAddon(addons.unicode11.instance);
  typedTerm.loadAddon(addons['web-links'].instance);

  window.term = term;  // Expose `term` to window for debugging purposes
  term.onResize((size: { cols: number, rows: number }) => {
    if (!pid) {
      return;
    }
    const cols = size.cols;
    const rows = size.rows;
    const url = '/terminals/' + pid + '/size?cols=' + cols + '&rows=' + rows;

    fetch(url, {method: 'POST'});
  });
  protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
  socketURL = protocol + location.hostname + ((location.port) ? (':' + location.port) : '') + '/terminals/';

  term.open(terminalContainer);
  addons.fit.instance!.fit();
  term.focus();

  addDomListener(paddingElement, 'change', setPadding);

  addDomListener(actionElements.findNext, 'keyup', (e) => {
    addons.search.instance.findNext(actionElements.findNext.value, getSearchOptions(e));
  });

  addDomListener(actionElements.findPrevious, 'keyup', (e) => {
    addons.search.instance.findPrevious(actionElements.findPrevious.value, getSearchOptions(e));
  });

  // fit is called within a setTimeout, cols and rows need this.
  setTimeout(() => {
    initOptions(term);
    // TODO: Clean this up, opt-cols/rows doesn't exist anymore
    (<HTMLInputElement>document.getElementById(`opt-cols`)).value = term.cols;
    (<HTMLInputElement>document.getElementById(`opt-rows`)).value = term.rows;
    paddingElement.value = '0';

    // Set terminal size again to set the specific dimensions on the demo
    updateTerminalSize();

    fetch('/terminals?cols=' + term.cols + '&rows=' + term.rows, {method: 'POST'}).then((res) => {
      res.text().then((processId) => {
        pid = processId;
        socketURL += processId;
        socket = new WebSocket(socketURL);
        socket.onopen = runRealTerminal;
        socket.onclose = runFakeTerminal;
        socket.onerror = runFakeTerminal;
      });
    });
  }, 0);
}

function runRealTerminal(): void {
  addons.attach.instance = new AttachAddon(socket);
  term.loadAddon(addons.attach.instance);
  term._initialized = true;
  initAddons(term);
}

function runFakeTerminal(): void {
  if (term._initialized) {
    return;
  }

  term._initialized = true;
  initAddons(term);

  term.prompt = () => {
    term.write('\r\n$ ');
  };

  term.writeln('Welcome to xterm.js');
  term.writeln('This is a local terminal emulation, without a real terminal in the back-end.');
  term.writeln('Type some keys and commands to play around.');
  term.writeln('');
  term.prompt();

  term.onKey((e: { key: string, domEvent: KeyboardEvent }) => {
    const ev = e.domEvent;
    const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

    if (ev.keyCode === 13) {
      term.prompt();
    } else if (ev.keyCode === 8) {
     // Do not delete the prompt
      if (term._core.buffer.x > 2) {
        term.write('\b \b');
      }
    } else if (printable) {
      term.write(e.key);
    }
  });
}

function initOptions(term: TerminalType): void {
  const blacklistedOptions = [
    // Internal only options
    'cancelEvents',
    'convertEol',
    'termName',
    // Complex option
    'theme',
    'windowOptions'
  ];
  const stringOptions = {
    bellSound: null,
    bellStyle: ['none', 'sound'],
    cursorStyle: ['block', 'underline', 'bar'],
    fastScrollModifier: ['alt', 'ctrl', 'shift', undefined],
    fontFamily: null,
    fontWeight: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    fontWeightBold: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    logLevel: ['debug', 'info', 'warn', 'error', 'off'],
    rendererType: ['dom', 'canvas'],
    wordSeparator: null
  };
  const options = Object.keys(term.options);
  const booleanOptions = [];
  const numberOptions = [];
  options.filter(o => blacklistedOptions.indexOf(o) === -1).forEach(o => {
    switch (typeof term.options[o]) {
      case 'boolean':
        booleanOptions.push(o);
        break;
      case 'number':
        numberOptions.push(o);
        break;
      default:
        if (Object.keys(stringOptions).indexOf(o) === -1) {
          console.warn(`Unrecognized option: "${o}"`);
        }
    }
  });

  let html = '';
  html += '<div class="option-group">';
  booleanOptions.forEach(o => {
    html += `<div class="option"><label><input id="opt-${o}" type="checkbox" ${term.options[o] ? 'checked' : ''}/> ${o}</label></div>`;
  });
  html += '</div><div class="option-group">';
  numberOptions.forEach(o => {
    html += `<div class="option"><label>${o} <input id="opt-${o}" type="number" value="${term.options[o]}" step="${o === 'lineHeight' || o === 'scrollSensitivity' ? '0.1' : '1'}"/></label></div>`;
  });
  html += '</div><div class="option-group">';
  Object.keys(stringOptions).forEach(o => {
    if (stringOptions[o]) {
      html += `<div class="option"><label>${o} <select id="opt-${o}">${stringOptions[o].map(v => `<option ${term.options[o] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>`;
    } else {
      html += `<div class="option"><label>${o} <input id="opt-${o}" type="text" value="${term.options[o]}"/></label></div>`;
    }
  });
  html += '</div>';

  const container = document.getElementById('options-container');
  container.innerHTML = html;

  // Attach listeners
  booleanOptions.forEach(o => {
    const input = <HTMLInputElement>document.getElementById(`opt-${o}`);
    addDomListener(input, 'change', () => {
      console.log('change', o, input.checked);
      term.options[o] = input.checked;
    });
  });
  numberOptions.forEach(o => {
    const input = <HTMLInputElement>document.getElementById(`opt-${o}`);
    addDomListener(input, 'change', () => {
      console.log('change', o, input.value);
      if (o === 'cols' || o === 'rows') {
        updateTerminalSize();
      } else if (o === 'lineHeight') {
        term.options.lineHeight = parseFloat(input.value);
        updateTerminalSize();
      } else if (o === 'scrollSensitivity') {
        term.options.scrollSensitivity = parseFloat(input.value);
        updateTerminalSize();
      } else if(o === 'scrollback') {
        term.options.scrollback = parseInt(input.value);
        setTimeout(() => updateTerminalSize(), 5);
      } else {
        term.options[o] = parseInt(input.value);
      }
    });
  });
  Object.keys(stringOptions).forEach(o => {
    const input = <HTMLInputElement>document.getElementById(`opt-${o}`);
    addDomListener(input, 'change', () => {
      console.log('change', o, input.value);
      term.options[o] = input.value;
    });
  });
}

function initAddons(term: TerminalType): void {
  const fragment = document.createDocumentFragment();
  Object.keys(addons).forEach((name: AddonType) => {
    const addon = addons[name];
    const checkbox = document.createElement('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.checked = !!addon.instance;
    if (!addon.canChange) {
      checkbox.disabled = true;
    }
    if(name === 'unicode11' && checkbox.checked) {
      term.unicode.activeVersion = '11';
    }
    addDomListener(checkbox, 'change', () => {
      if (checkbox.checked) {
        addon.instance = new addon.ctor();
        term.loadAddon(addon.instance);
        if (name === 'webgl') {
          setTimeout(() => {
            document.body.appendChild((addon.instance as WebglAddon).textureAtlas);
          }, 0);
        } else if (name === 'unicode11') {
          term.unicode.activeVersion = '11';
        }
      } else {
        if (name === 'webgl') {
          document.body.removeChild((addon.instance as WebglAddon).textureAtlas);
        } else if (name === 'unicode11') {
          term.unicode.activeVersion = '6';
        }
        addon.instance!.dispose();
        addon.instance = undefined;
      }
    });
    const label = document.createElement('label');
    label.classList.add('addon');
    if (!addon.canChange) {
      label.title = 'This addon is needed for the demo to operate';
    }
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(name));
    const wrapper = document.createElement('div');
    wrapper.classList.add('addon');
    wrapper.appendChild(label);
    fragment.appendChild(wrapper);
  });
  const container = document.getElementById('addons-container');
  container.innerHTML = '';
  container.appendChild(fragment);
}

function addDomListener(element: HTMLElement, type: string, handler: (...args: any[]) => any): void {
  element.addEventListener(type, handler);
  term._core.register({ dispose: () => element.removeEventListener(type, handler) });
}

function updateTerminalSize(): void {
  const cols = parseInt((<HTMLInputElement>document.getElementById(`opt-cols`)).value, 10);
  const rows = parseInt((<HTMLInputElement>document.getElementById(`opt-rows`)).value, 10);
  const width = (cols * term._core._renderService.dimensions.actualCellWidth + term._core.viewport.scrollBarWidth).toString() + 'px';
  const height = (rows * term._core._renderService.dimensions.actualCellHeight).toString() + 'px';
  terminalContainer.style.width = width;
  terminalContainer.style.height = height;
  addons.fit.instance.fit();
}

function serializeButtonHandler(): void {
  const output = addons.serialize.instance.serialize();
  const outputString = JSON.stringify(output);

  document.getElementById('serialize-output').innerText = outputString;
  if ((document.getElementById('write-to-terminal') as HTMLInputElement).checked) {
    term.reset();
    term.write(output);
  }
}


function writeCustomGlyphHandler() {
  term.write('\n\r');
  term.write('\n\r');
  term.write('Box styles:       ┎┰┒┍┯┑╓╥╖╒╤╕ ┏┳┓┌┲┓┌┬┐┏┱┐\n\r');
  term.write('┌─┬─┐ ┏━┳━┓ ╔═╦═╗ ┠╂┨┝┿┥╟╫╢╞╪╡ ┡╇┩├╊┫┢╈┪┣╉┤\n\r');
  term.write('│ │ │ ┃ ┃ ┃ ║ ║ ║ ┖┸┚┕┷┙╙╨╜╘╧╛ └┴┘└┺┛┗┻┛┗┹┘\n\r');
  term.write('├─┼─┤ ┣━╋━┫ ╠═╬═╣ ┏┱┐┌┲┓┌┬┐┌┬┐ ┏┳┓┌┮┓┌┬┐┏┭┐\n\r');
  term.write('│ │ │ ┃ ┃ ┃ ║ ║ ║ ┡╃┤├╄┩├╆┪┢╅┤ ┞╀┦├┾┫┟╁┧┣┽┤\n\r');
  term.write('└─┴─┘ ┗━┻━┛ ╚═╩═╝ └┴┘└┴┘└┺┛┗┹┘ └┴┘└┶┛┗┻┛┗┵┘\n\r');
  term.write('\n\r');
  term.write('Other:\n\r');
  term.write('╭─╮ ╲ ╱ ╷╻╎╏┆┇┊┋ ╺╾╴ ╌╌╌ ┄┄┄ ┈┈┈\n\r');
  term.write('│ │  ╳  ╽╿╎╏┆┇┊┋ ╶╼╸ ╍╍╍ ┅┅┅ ┉┉┉\n\r');
  term.write('╰─╯ ╱ ╲ ╹╵╎╏┆┇┊┋\n\r');
  term.write('\n\r');
  term.write('All box drawing characters:\n\r');
  term.write('─ ━ │ ┃ ┄ ┅ ┆ ┇ ┈ ┉ ┊ ┋ ┌ ┍ ┎ ┏\n\r');
  term.write('┐ ┑ ┒ ┓ └ ┕ ┖ ┗ ┘ ┙ ┚ ┛ ├ ┝ ┞ ┟\n\r');
  term.write('┠ ┡ ┢ ┣ ┤ ┥ ┦ ┧ ┨ ┩ ┪ ┫ ┬ ┭ ┮ ┯\n\r');
  term.write('┰ ┱ ┲ ┳ ┴ ┵ ┶ ┷ ┸ ┹ ┺ ┻ ┼ ┽ ┾ ┿\n\r');
  term.write('╀ ╁ ╂ ╃ ╄ ╅ ╆ ╇ ╈ ╉ ╊ ╋ ╌ ╍ ╎ ╏\n\r');
  term.write('═ ║ ╒ ╓ ╔ ╕ ╖ ╗ ╘ ╙ ╚ ╛ ╜ ╝ ╞ ╟\n\r');
  term.write('╠ ╡ ╢ ╣ ╤ ╥ ╦ ╧ ╨ ╩ ╪ ╫ ╬ ╭ ╮ ╯\n\r');
  term.write('╰ ╱ ╲ ╳ ╴ ╵ ╶ ╷ ╸ ╹ ╺ ╻ ╼ ╽ ╾ ╿\n\r');
  term.write('Box drawing alignment tests:\x1b[31m                                          █\n\r');
  term.write('                                                                      ▉\n\r');
  term.write('  ╔══╦══╗  ┌──┬──┐  ╭──┬──╮  ╭──┬──╮  ┏━━┳━━┓  ┎┒┏┑   ╷  ╻ ┏┯┓ ┌┰┐    ▊ ╱╲╱╲╳╳╳\n\r');
  term.write('  ║┌─╨─┐║  │╔═╧═╗│  │╒═╪═╕│  │╓─╁─╖│  ┃┌─╂─┐┃  ┗╃╄┙  ╶┼╴╺╋╸┠┼┨ ┝╋┥    ▋ ╲╱╲╱╳╳╳\n\r');
  term.write('  ║│╲ ╱│║  │║   ║│  ││ │ ││  │║ ┃ ║│  ┃│ ╿ │┃  ┍╅╆┓   ╵  ╹ ┗┷┛ └┸┘    ▌ ╱╲╱╲╳╳╳\n\r');
  term.write('  ╠╡ ╳ ╞╣  ├╢   ╟┤  ├┼─┼─┼┤  ├╫─╂─╫┤  ┣┿╾┼╼┿┫  ┕┛┖┚     ┌┄┄┐ ╎ ┏┅┅┓ ┋ ▍ ╲╱╲╱╳╳╳\n\r');
  term.write('  ║│╱ ╲│║  │║   ║│  ││ │ ││  │║ ┃ ║│  ┃│ ╽ │┃  ░░▒▒▓▓██ ┊  ┆ ╎ ╏  ┇ ┋ ▎\n\r');
  term.write('  ║└─╥─┘║  │╚═╤═╝│  │╘═╪═╛│  │╙─╀─╜│  ┃└─╂─┘┃  ░░▒▒▓▓██ ┊  ┆ ╎ ╏  ┇ ┋ ▏\n\r');
  term.write('  ╚══╩══╝  └──┴──┘  ╰──┴──╯  ╰──┴──╯  ┗━━┻━━┛           └╌╌┘ ╎ ┗╍╍┛ ┋  ▁▂▃▄▅▆▇█\n\r');
  term.write('Box drawing alignment tests:\x1b[32m                                          █\n\r');
  term.write('                                                                      ▉\n\r');
  term.write('  ╔══╦══╗  ┌──┬──┐  ╭──┬──╮  ╭──┬──╮  ┏━━┳━━┓  ┎┒┏┑   ╷  ╻ ┏┯┓ ┌┰┐    ▊ ╱╲╱╲╳╳╳\n\r');
  term.write('  ║┌─╨─┐║  │╔═╧═╗│  │╒═╪═╕│  │╓─╁─╖│  ┃┌─╂─┐┃  ┗╃╄┙  ╶┼╴╺╋╸┠┼┨ ┝╋┥    ▋ ╲╱╲╱╳╳╳\n\r');
  term.write('  ║│╲ ╱│║  │║   ║│  ││ │ ││  │║ ┃ ║│  ┃│ ╿ │┃  ┍╅╆┓   ╵  ╹ ┗┷┛ └┸┘    ▌ ╱╲╱╲╳╳╳\n\r');
  term.write('  ╠╡ ╳ ╞╣  ├╢   ╟┤  ├┼─┼─┼┤  ├╫─╂─╫┤  ┣┿╾┼╼┿┫  ┕┛┖┚     ┌┄┄┐ ╎ ┏┅┅┓ ┋ ▍ ╲╱╲╱╳╳╳\n\r');
  term.write('  ║│╱ ╲│║  │║   ║│  ││ │ ││  │║ ┃ ║│  ┃│ ╽ │┃  ░░▒▒▓▓██ ┊  ┆ ╎ ╏  ┇ ┋ ▎\n\r');
  term.write('  ║└─╥─┘║  │╚═╤═╝│  │╘═╪═╛│  │╙─╀─╜│  ┃└─╂─┘┃  ░░▒▒▓▓██ ┊  ┆ ╎ ╏  ┇ ┋ ▏\n\r');
  term.write('  ╚══╩══╝  └──┴──┘  ╰──┴──╯  ╰──┴──╯  ┗━━┻━━┛           └╌╌┘ ╎ ┗╍╍┛ ┋  ▁▂▃▄▅▆▇█\n\r');
  window.scrollTo(0, 0);
}

function loadTest() {
  const isWebglEnabled = !!addons.webgl.instance;
  const testData = [];
  let byteCount = 0;
  for (let i = 0; i < 50; i++) {
    const count = 1 + Math.floor(Math.random() * 79);
    byteCount += count + 2;
    const data = new Uint8Array(count + 2);
    data[0] = 0x0A; // \n
    for (let i = 1; i < count + 1; i++) {
      data[i] = 0x61 + Math.floor(Math.random() * (0x7A - 0x61));
    }
    // End each line with \r so the cursor remains constant, this is what ls/tree do and improves
    // performance significantly due to the cursor DOM element not needing to change
    data[data.length - 1] = 0x0D; // \r
    testData.push(data);
  }
  const start = performance.now();
  for (let i = 0; i < 1024; i++) {
    for (const d of testData) {
      term.write(d);
    }
  }
  // Wait for all data to be parsed before evaluating time
  term.write('', () => {
    const time = Math.round(performance.now() - start);
    const mbs = ((byteCount / 1024) * (1 / (time / 1000))).toFixed(2);
    term.write(`\n\r\nWrote ${byteCount}kB in ${time}ms (${mbs}MB/s) using the (${isWebglEnabled ? 'webgl' : 'canvas'} renderer)`);
    // Send ^C to get a new prompt
    term._core._onData.fire('\x03');
  });
}
