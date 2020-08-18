'use strict';

const Controller = require('egg').Controller;
const fs = require('fs');
const fsPromises = fs.promises;
const readline = require('readline');
const crypto = require('crypto');
function md5(data){
  let hash = crypto.createHash('md5');
  return hash.update(data).digest('base64');
}
let preveMd5 = null,
    fsWait = false

class HomeController extends Controller {
  async index() {
    const { ctx } = this;
    const fileStream=fs.createReadStream('/tmp/fastnetmon.dat')
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
   fs.watch('/tmp/fastnetmon.dat',(eventType,filename)=>{
     if(!filename||fsWait)return
     fsWait = setTimeout(()=>fsWait=false,100)
     if(md5(fs.readFileSync('/tmp/' + filename))===preveMd5)return
     console.log(`提供的文件名${filename}`)
   })
   const result=[]
     for await (const line of rl) {
	     //if(/^\D/.test(line))continue
	     result.push(line)
    // input.txt 中的每一行在这里将会被连续地用作 `line`。
    //console.log(`Line from file: ${line}`);
  }
	  ctx.body=result
	  //ctx.body = await fsPromises.readFile('/tmp/fastnetmon.dat', 'utf8');
	 
  }
}

module.exports = HomeController;
