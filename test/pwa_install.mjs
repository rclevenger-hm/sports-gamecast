import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pwa.js', import.meta.url), 'utf8');
const windowListeners = new Map();
let insertedButton = null;
let registeredWorker = null;

const controls = {
  firstChild: null,
  insertBefore(node) { insertedButton = node; },
};

function makeButton() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    async click() { return listeners.get('click')?.(); },
  };
}

const context = vm.createContext({
  console,
  document: {
    querySelector(selector) {
      return selector === '.topbar .controls:last-child' ? controls : null;
    },
    createElement(tag) {
      if (tag !== 'button') throw new Error(`unexpected element ${tag}`);
      return makeButton();
    },
  },
  navigator: {
    serviceWorker: {
      register(path) {
        registeredWorker = path;
        return Promise.resolve();
      },
    },
  },
  window: {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  },
});

vm.runInContext(source, context, { filename: 'pwa.js' });

if (!windowListeners.has('beforeinstallprompt')) throw new Error('beforeinstallprompt listener missing');
if (!windowListeners.has('appinstalled')) throw new Error('appinstalled listener missing');
if (!windowListeners.has('load')) throw new Error('service-worker load listener missing');

let prevented = false;
let prompted = 0;
const installEvent = {
  preventDefault() { prevented = true; },
  prompt() { prompted += 1; return Promise.resolve(); },
  userChoice: Promise.resolve({ outcome: 'accepted' }),
};

windowListeners.get('beforeinstallprompt')(installEvent);
if (!prevented) throw new Error('install event should be captured for explicit user action');
if (!insertedButton || insertedButton.hidden || insertedButton.disabled) throw new Error('install control should become available');

await insertedButton.click();
if (prompted !== 1) throw new Error('install control should invoke the deferred install prompt once');
if (!insertedButton.hidden || !insertedButton.disabled) throw new Error('install control should hide after prompting');

windowListeners.get('beforeinstallprompt')(installEvent);
windowListeners.get('appinstalled')();
if (!insertedButton.hidden || !insertedButton.disabled) throw new Error('installed apps should not keep an install control visible');

windowListeners.get('load')();
await Promise.resolve();
if (registeredWorker !== './sw.js') throw new Error('existing service-worker registration should be preserved');

console.log('PWA install UX contract passed.');
