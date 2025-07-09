const bcrypt = require('bcryptjs');
async function generateHash() {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('wlin@synthpify.ai$168#99Success!', salt);
    console.log(hash);
}
generateHash();