const crypto = require('crypto');
const password = crypto.randomBytes(8).toString('hex');
console.log('Generated Admin Password:', password);