import { hashCommandPassword } from '../commands/password-hash.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-command-password -- "your-password"');
  process.exit(1);
}

console.log(hashCommandPassword(password));
