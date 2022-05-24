const { argv } = require('process');
const fs = require('fs');
const path = require('path');
const paramStartIndex = 2;
const copyKeys = ['name', 'version', 'description', 'author', 'license', 'gypfile', 'dependencies'];

/**
 * param 0 inputFile 
 * param 1 outputFile
 */

let rawdata;
let inputPath = path.resolve(argv[paramStartIndex]);
let outputPath = path.resolve(argv[paramStartIndex + 1]);
console.log(`Input file:\t${inputPath}`);
console.log(`Output file:\t${outputPath}`);
try {

    rawdata = fs.readFileSync(inputPath);
} catch (error) {

    console.error('read file fail.');
    process.exit();
}
let readJson = JSON.parse(rawdata);

let newJson = {};
for (let i = 0; i < copyKeys.length; i++) {

    if (readJson[copyKeys[i]] === undefined) {

        continue;
    }
    newJson[copyKeys[i]] = readJson[copyKeys[i]];
}

let data = JSON.stringify(newJson, null, 2);
try {

    fs.writeFileSync(outputPath, data);
} catch (error) {

    console.error('write file fail.');
    process.exit();
}

