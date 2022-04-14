const Net = require('net');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const bufferReplace = require('buffer-replace');
const crypto = require('crypto');
const Jimp = require('jimp');

const listenPort = 25565;
const mcHost = "localhost";
const mcPort = 25569;
const serverName = "ayunMultiPort Server";
const serverMotd = ["line1", "line2"];
const serverMaxPlayers = 20;
const serverOnlinePlayers = 4;
const serverPlayers = ["Welcome to my", "ayunMultiPort-powered", "Eaglercraft server!"];
const serverIcon = "icon.png"; // set to null for no icon. MUST be 64x64. can be a url, if you want...
const httpPort = 8080;
const timeout = 10000;
const changeProtocol = true;
const removeSkin = true;
const prefix = "www";

let iconBuff = null;

if(serverIcon!=null){
  Jimp.read(serverIcon, function (err, image) {
    if(!err)iconBuff=Buffer.from(image.bitmap.data);
  });
}

let files = [];
let cache = {};

function throughDirectory(directory) {
  fs.readdirSync(directory).forEach(file => {
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).isDirectory()) return throughDirectory(absolute);
    else return files.push(absolute.toString().slice(prefix.length+1).replace(/\\/g,"/"));
  });
}

throughDirectory(prefix);

const httpsrv = require("http").createServer((req,res)=>{
  let url = req.url;
  if (url.includes("?")) url = url.slice(0, url.indexOf("?"));
  if(url.startsWith("/"))url=url.slice(1);
  if(url=="")url = "index.html";
  if(files.includes(url)){
    res.writeHead(200,{"Content-Type":mime.contentType(url)});
    if(!(url in cache)){
      cache[url]=fs.readFileSync(prefix+"/"+url);
    }
    res.end(cache[url]);
  }else{
    res.writeHead(404,{"Content-Type":"text/plain"});
    res.end("404 Not Found");
  }
});

const wss = new WebSocketServer({ server: httpsrv });

const motdBase = {data:{motd:serverMotd,cache:true,max:serverMaxPlayers,players:serverPlayers,icon:serverIcon!=null,online:serverOnlinePlayers},vers:"0.2.0",name:serverName,time:0,type:"motd",brand:"Eagtek",uuid:crypto.randomUUID(),cracked:true};
function getMotd(){
  motdBase.time = Date.now();
  return JSON.stringify(motdBase);
}

wss.on('connection', function(ws) {
  ws.on('error', function(er) {});
  
  let client = null;
  makeWsMcClient(ws,c=>client=c);
  
  let msgNum = 0;
  
  ws.on('message', function(data) {
    if(msgNum==0){
      msgNum++;
      if(data.toString()=="Accept: MOTD"){
        ws.send(getMotd());
        if(iconBuff!=null)ws.send(iconBuff);
        closeIt();
        return;
      }
      if(changeProtocol)data=bufferReplace(data,Buffer.from("0245","hex"),Buffer.from("023d","hex"));
    }else if(msgNum==1){
      msgNum++;
      if(removeSkin)return;//eaglercraft skin
    }
    writeData(data);
  });
  
  ws.on('close', function(){
    closeIt();
  });

  async function writeData(chunk){
    if(await waitForIt())client.write(chunk);
  }

  async function closeIt(){
    if(await waitForIt())client.end();
  }

  async function waitForIt(){
    let i=Date.now();
    while(client==null&&(Date.now()-i<timeout/10)){
      await new Promise(a=>setTimeout(a,10));
    }
    
    if(client==null){
      if(ws.readyState==WebSocket.OPEN)ws.close();
      return false;
    }
    
    return true;
  }
});

httpsrv.listen(httpPort);

const server = new Net.Server();
server.listen(listenPort, function() {
  //
});

server.on('connection', function(socket) {
  let client = null;
  
  let determinedClient = false;
  
  socket.on('data', function(chunk) {
    if(!determinedClient){
      let req = chunk.toString();
      if(req.startsWith("GET ")||req.startsWith("HEAD ")||req.startsWith("POST ")||req.startsWith("PUT ")||req.startsWith("DELETE ")||req.startsWith("CONNECT ")||req.startsWith("OPTIONS ")||req.startsWith("TRACE ")||req.startsWith("PATCH ")){
        makeClient("localhost",httpPort,socket,c=>client=c);
      }else{
        makeClient(mcHost,mcPort,socket,c=>client=c);
      }
      determinedClient=true;
    }
    
    writeData(chunk);
  });

  socket.on('end', function() {
    if(client!=null)client.end();
  });

  socket.on('error', function(err) {
    //console.log(`Server Error: ${err}`);
  });

  async function writeData(chunk){
    if(await waitForIt())client.write(chunk);
  }

  async function closeIt(){
    if(await waitForIt())client.end();
  }

  async function waitForIt(){
    let i=Date.now();
    while(client==null&&(Date.now()-i<timeout/10)){
      await new Promise(a=>setTimeout(a,10));
    }
    
    if(client==null){
      socket.end();
      return false;
    }
    
    return true;
  }
});

function makeClient(host,port,socket,cb){
  const client = new Net.Socket();
  client.connect({ port: port, host: host }, function() {
    cb(client);
  });
      
  client.on('end', function() {
    socket.end();
  });

  client.on('data', function(chunk) {
    socket.write(chunk);
  });

  client.on('error', function(err) {
    //console.log(`Client Error: ${err}`);
  });
}

function makeWsMcClient(ws,cb){
  const client = new Net.Socket();
  client.connect({ port: mcPort, host: mcHost }, function() {
    cb(client);
  });
      
  client.on('end', function() {
    if(ws.readyState==WebSocket.OPEN)ws.close();
  });

  client.on('data', function(chunk) {
    if(ws.readyState==WebSocket.OPEN)ws.send(chunk);
  });

  client.on('error', function(err) {
    //console.log(`Client Error: ${err}`);
  });
}
