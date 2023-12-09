const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const inputFolder = './Messages';
const files = fs.readdirSync(inputFolder);

files.forEach(async (file) => {
    if (file.endsWith('.gz')) {
        const inputFilePath = path.join(inputFolder, file);
        const outputFilePath = path.join(inputFolder, file.replace(/\.gz$/, '.txt'));
        const gunzip = zlib.createGunzip();
        const readStream = fs.createReadStream(inputFilePath);
        const writeStream = fs.createWriteStream(outputFilePath);
        readStream.pipe(gunzip).pipe(writeStream);
        await new Promise((resolve) => writeStream.on('close', resolve));
    }
});
