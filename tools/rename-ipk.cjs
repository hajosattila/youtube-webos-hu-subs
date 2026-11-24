const { renameSync } = require('node:fs');
const appInfo = require('../assets/appinfo.json');
const { version } = require('../package.json');

const packageName = `${appInfo.id}_${version}_all`;
renameSync(`${packageName}.ipk`, `${packageName}-hu.ipk`);
