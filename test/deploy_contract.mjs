import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/cp .*notifications\.js/.test(workflow), 'Pages staging must copy notifications.js');
assert(/cp .*push-subscriptions\.js/.test(workflow), 'Pages staging must copy push-subscriptions.js');
assert(workflow.includes('<script src="push-subscriptions.js"></script>'), 'Pages staging must load the push subscription runtime');
assert(workflow.includes('<script src="notifications.js"></script>'), 'Pages staging must load notifications.js on the scoreboard');
assert(workflow.includes('<script src="pwa.js"></script>'), 'Pages staging must preserve the PWA runtime');

const pushPosition = workflow.indexOf('<script src="push-subscriptions.js"></script>');
const notificationPosition = workflow.indexOf('<script src="notifications.js"></script>');
const pwaPosition = workflow.indexOf('<script src="pwa.js"></script>');
assert(pushPosition !== -1 && notificationPosition > pushPosition, 'push subscription runtime should load before the notification UX');
assert(notificationPosition !== -1 && pwaPosition > notificationPosition, 'notification runtime should load before the PWA runtime');

console.log('Pages deployment contract valid.');
