'use strict';
const {spawnSync}=require('node:child_process');
const executable=process.platform==='win32'?'python':'python3';
const result=spawnSync(executable,process.argv.slice(2),{stdio:'inherit',windowsHide:true});
if(result.error)console.error('Python 3 runtime is required');
process.exitCode=result.status??1;

