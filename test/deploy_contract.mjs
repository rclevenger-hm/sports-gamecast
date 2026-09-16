import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
const favorites = fs.readFileSync(path.join(root, 'favorites.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/cp .*notifications\.js/.test(workflow), 'Pages staging must copy notifications.js');
assert(/cp .*push-subscriptions\.js/.test(workflow), 'Pages staging must copy push-subscriptions.js');
assert(workflow.includes('<script src="push-subscriptions.js"></script>'), 'Pages staging must load the push subscription runtime');
assert(!workflow.includes('<script src="notifications.js"></script>'), 'Pages staging must not inject a second notifications.js runtime');
assert(favorites.includes('alerts.src = "notifications.js"'), 'favorites runtime must remain the single notification loader');
assert(workflow.includes('<script src="pwa.js"></script>'), 'Pages staging must preserve the PWA runtime');

const pushPosition = workflow.indexOf('<script src="push-subscriptions.js"></script>');
const pwaPosition = workflow.indexOf('<script src="pwa.js"></script>');
assert(pushPosition !== -1 && pwaPosition > pushPosition, 'push subscription runtime should load before the PWA runtime');

console.log('Pages deployment contract valid.');
