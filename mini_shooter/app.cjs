// Mini Shooter — serveur complet (Express + Socket.IO) + client intégré
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

// --- Réseau (rooms)
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', (p = {}) => {
    const { room } = p;
    if (!room) return;
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = room;
    socket.join(room);

    socket.to(room).emit('join', p);
    socket.to(room).emit('syncRequest', { id: p.id });
  });

  socket.on('state',  (p) => currentRoom && io.to(currentRoom).emit('state',  p));
  socket.on('bullet', (p) => currentRoom && socket.to(currentRoom).emit('bullet', p));
  socket.on('hit',    (p) => currentRoom && io.to(currentRoom).emit('hit',    p));
  socket.on('leave',  (p) => { if(!currentRoom) return; socket.to(currentRoom).emit('leave', p); socket.leave(currentRoom); currentRoom=null; });
});

// --- Client (HTML intégré, sert sur /)
const CLIENT_HTML = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Mini Shooter — En ligne</title>
<style>
:root{--bg:#0b0f14;--panel:#111824;--primary:#4cc9f0;--text:#e6edf3}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,Segoe UI,Roboto,Ubuntu,Arial}
#game{display:block;width:100vw;height:100vh;background:radial-gradient(1200px 1200px at 50% 50%,#0e1520 0,#0b0f14 60%)}
.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0f14e6;backdrop-filter:blur(6px)}
.card{width:min(520px,92vw);background:#111824;border:1px solid #223047;border-radius:16px;padding:18px}
.row{display:flex;gap:10px;align-items:center;margin:.6rem 0}.row label{min-width:110px;color:#9fb0c3}.row input{flex:1;padding:10px 12px;background:#0c121b;border:1px solid #24354c;color:#e6edf3;border-radius:10px}
.btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}.btn.primary{background:linear-gradient(180deg,#4cc9f0,#3aa8ce);color:#041016}
.hud{position:fixed;left:10px;top:10px;display:flex;flex-direction:column;gap:6px}.chip{background:#0c121b;border:1px solid #203149;border-radius:10px;padding:6px 10px}
.board{position:fixed;right:10px;top:10px;min-width:180px;background:#0c121b;border:1px solid #203149;border-radius:10px;padding:6px 8px}
.rowli{display:flex;justify-content:space-between;padding:4px 6px;border-radius:8px}.rowli.me{background:#152233}
.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#101826;border:1px solid #2a3c58;padding:10px 14px;border-radius:10px;color:#cfe3ff;opacity:.95}
</style>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js" crossorigin="anonymous"></script>
</head><body>
<canvas id="game"></canvas>
<div class="hud" id="hud" hidden>
  <div class="chip">Joueur: <b id="hudName">-</b></div>
  <div class="chip">Salle: <b id="hudRoom">-</b></div>
  <div class="chip">Kills: <b id="hudKills">0</b></div>
</div>
<div class="board" id="board" hidden><b style="color:#9fb0c3">Joueurs</b><div id="boardList"></div></div>
<div class="overlay" id="menu">
  <div class="card">
    <h2 style="margin:0 0 10px">Mini Shooter — En ligne</h2>
    <div class="row"><label>Pseudo</label><input id="inpName" placeholder="Votre pseudo" maxlength="16"></div>
    <div class="row"><label>Code salle</label><input id="inpRoom" placeholder="ex: alpha" maxlength="24"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="btnJoin">Créer / Rejoindre</button></div>
    <div style="color:#9fb0c3;font-size:.92rem">ZQSD/WASD bouger • souris viser • clic tirer • Échap menu.</div>
  </div>
</div>
<div class="toast" id="toast" hidden></div>
<script>
const $=s=>document.querySelector(s), clamp=(v,a,b)=>v<a?a:(v>b?b:v), rand=(a,b)=>Math.random()*(b-a)+a, uuid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
const COLORS=["#4cc9f0","#f72585","#72efdd","#ffd166","#90be6d","#f94144","#577590","#ff9f1c","#06d6a0"];
const canvas=$("#game"), ctx=canvas.getContext("2d"); let vw=0,vh=0,dpr=1; function resize(){dpr=Math.max(1,Math.min(2,devicePixelRatio||1));vw=innerWidth|0;vh=innerHeight|0;canvas.width=(vw*dpr)|0;canvas.height=(vh*dpr)|0;canvas.style.width=vw+"px";canvas.style.height=vh+"px";ctx.setTransform(dpr,0,0,dpr,0,0);} addEventListener("resize",resize); resize();
const world={w:2200,h:1400}; let cam={x:0,y:0};
function grid(){const g=50;ctx.save();ctx.globalAlpha=.25;ctx.strokeStyle="#203149";for(let x=0;x<world.w;x+=g){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.h);ctx.stroke();}for(let y=0;y<world.h;y+=g){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.w,y);ctx.stroke();}ctx.restore();}
function drawP(p){const r=18;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle||0);ctx.fillStyle=p.color;ctx.strokeStyle="#05111a";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(-r*.8,-r*.7);ctx.lineTo(-r*.4,0);ctx.lineTo(-r*.8,r*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#cfe3ff";ctx.fillRect(r*.2,-3,r*.8,6);ctx.restore();ctx.save();ctx.font="600 12px system-ui,Segoe UI,Roboto";ctx.textAlign="center";ctx.fillStyle="#cfe3ff";ctx.strokeStyle="#0009";ctx.lineWidth=3;ctx.strokeText(p.name,p.x,p.y-26);ctx.fillText(p.name,p.x,p.y-26);ctx.restore();}
function drawB(b){ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fillStyle="#e0fbfc";ctx.fill();}
function toast(msg,ms=1500){const el=$("#toast"); el.textContent=msg; el.hidden=false; el.style.opacity=.95; clearTimeout(el._t); el._t=setTimeout(()=>{el.style.opacity=0; setTimeout(()=>el.hidden=true,250)},ms);}

const keys=new Set(); let mouseX=0,mouseY=0,shoot=false;
addEventListener("keydown",e=>{if(e.repeat) return; keys.add(e.code); if(e.code==="Escape") leave();});
addEventListener("keyup",e=>keys.delete(e.code));
canvas.addEventListener("mousemove",e=>{const r=canvas.getBoundingClientRect();mouseX=e.clientX-r.left;mouseY=e.clientY-r.top;});
canvas.addEventListener("mousedown",()=>shoot=true); addEventListener("mouseup",()=>shoot=false);

let socket=null;
function connect(){ if(socket){ try{socket.disconnect()}catch(_){ } } socket = io("/", { transports:["websocket"] }); socket.on("join", onNet); socket.on("state", onNet); socket.on("leave", onNet); socket.on("bullet", onNet); socket.on("hit", onNet); socket.on("syncRequest", ()=>{ if(state.me){ send("state", {...state.me, room:state.room}); }}); }
function send(type,payload){ if(!socket) return; socket.emit(type, payload); }

const state={me:null,room:null,players:new Map(),bullets:new Map(),lastSend:0};
function onNet(m){
  if(!m) return;
  if(m.b){ if(!state.bullets.has(m.b.id)) state.bullets.set(m.b.id,m.b); return; }
  if(m.targetId!==undefined){ const tgt=(state.me&&state.me.id===m.targetId)?state.me:state.players.get(m.targetId); if(tgt){ respawn(tgt); } if(state.me&&state.me.id===m.shooterId){ state.me.kills=(state.me.kills||0)+1; updateHUD(); } const sh=state.players.get(m.shooterId); if(sh) sh.kills=(sh.kills||0)+1; return; }
  if(m.name!==undefined && m.x!==undefined){ if(state.me && m.id===state.me.id) return; const p=state.players.get(m.id)||{kills:0}; Object.assign(p,{id:m.id,name:m.name,color:m.color,x:m.x,y:m.y,angle:m.angle||0}); p.kills=m.kills||p.kills; p.last=performance.now(); const isNew=!state.players.has(m.id); state.players.set(m.id,p); if(isNew && state.me) toast(\`\${m.name} a rejoint la partie\`); return; }
  if(m.type==="leave"){ if(state.players.has(m.id)){ const gone=state.players.get(m.id); state.players.delete(m.id); toast(\`\${gone?.name||"Un joueur"} a quitté\`);} return; }
}

function start({name,room}){ $("#menu").hidden=true; $("#menu").style.display="none"; $("#hud").hidden=false; $("#board").hidden=false;
  state.room=room||"alpha"; const color=["#4cc9f0","#f72585","#72efdd","#ffd166","#90be6d","#f94144","#577590","#ff9f1c","#06d6a0"][(Math.random()*10)|0];
  state.me={ id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2), name:name||"Joueur", color, x:200+Math.random()*1800, y:200+Math.random()*1000, angle:0, kills:0 };
  state.players.clear(); state.bullets.clear(); connect(); send("join",{ type:"join", room:state.room, ...state.me}); updateHUD(); last=performance.now(); requestAnimationFrame(loop); }

function leave(){ try{ if(state.me) send("leave",{ type:"leave", room:state.room, id:state.me.id }); }catch(_){ } state.me=null; state.room=null; state.players.clear(); state.bullets.clear(); $("#menu").hidden=false; $("#menu").style.display=""; $("#hud").hidden=true; $("#board").hidden=true; }
function updateHUD(){ $("#hudName").textContent=state.me?.name||"-"; $("#hudRoom").textContent=state.room||"-"; $("#hudKills").textContent=String(state.me?.kills||0); }
function respawn(p){ p.x=120+Math.random()*(2200-240); p.y=120+Math.random()*(1400-240); p.angle=0; }

let last=performance.now(), fireCd=0; let cam={x:0,y:0};
function handle(dt){ const p=state.me; if(!p) return; let vx=0,vy=0,s=240; if(keys.has("KeyZ")||keys.has("KeyW")||keys.has("ArrowUp")) vy-=1; if(keys.has("KeyS")||keys.has("ArrowDown")) vy+=1; if(keys.has("KeyQ")||keys.has("ArrowLeft")) vx-=1; if(keys.has("KeyD")||keys.has("ArrowRight")) vx+=1; if(vx||vy){const l=Math.hypot(vx,vy); vx/=l; vy/=l; p.x+=vx*s*dt; p.y+=vy*s*dt;} p.x=clamp(p.x,20,2180); p.y=clamp(p.y,20,1380); const cx=p.x-cam.x, cy=p.y-cam.y; p.angle=Math.atan2(mouseY-cy,mouseX-cx); fireCd-=dt; if(shoot&&fireCd<=0){fireCd=.18; fire(p);} }
function fire(p){ const sp=580, a=p.angle+(Math.random()-.5)*.02; const b={ id:uuid(), shooterId:p.id, x:p.x+Math.cos(a)*20, y:p.y+Math.sin(a)*20, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, ttl:1.6, room:state.room }; state.bullets.set(b.id,b); send("bullet",{ type:"bullet", room:state.room, b}); }
function bullets(dt){ for(const b of state.bullets.values()){ b.x+=b.vx*dt; b.y+=b.vy*dt; b.ttl-=dt; if(b.x<0||b.y<0||b.x>2200||b.y>1400) b.ttl=0; if(b.ttl<=0){ state.bullets.delete(b.id); continue; } if(state.me && b.shooterId===state.me.id){ for(const p of state.players.values()){ if(Math.hypot(p.x-b.x,p.y-b.y)<16){ state.bullets.delete(b.id); send("hit",{ type:"hit", room:state.room, targetId:p.id, shooterId:state.me.id }); state.me.kills++; updateHUD(); respawn(p); break; } } } } }
function board(){ const list=$("#boardList"); const all=[]; if(state.me) all.push({id:state.me.id,name:state.me.name,kills:state.me.kills,color:state.me.color,isMe:true}); state.players.forEach(p=>all.push({id:p.id,name:p.name,kills:p.kills,color:p.color,isMe:false})); all.sort((a,b)=>(b.kills|0)-(a.kills|0)); list.innerHTML=all.map(it=>\`<div class="rowli \${it.isMe?'me':''}"><span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:\${it.color};margin-right:6px;"></span>\${it.name}</span><b>\${it.kills|0}</b></div>\`).join(""); }
function gridDraw(){const g=50;ctx.save();ctx.globalAlpha=.25;ctx.strokeStyle="#203149";for(let x=0;x<2200;x+=g){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1400);ctx.stroke();}for(let y=0;y<1400;y+=g){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(2200,y);ctx.stroke();}ctx.restore();}
function loop(now){ if(!state.me) return; const dt=Math.min(.033,(now-last)/1000); last=now; handle(dt); bullets(dt); if(now-(state.lastSend||0)>60){ state.lastSend=now; if(state.me) send("state",{ type:"state", room:state.room, ...state.me }); } cam.x=clamp(state.me.x - vw/2, 0, Math.max(0,2200-vw)); cam.y=clamp(state.me.y - vh/2, 0, Math.max(0,1400-vh)); ctx.save(); ctx.clearRect(0,0,vw,vh); ctx.translate(-cam.x,-cam.y); grid(); for(const b of state.bullets.values()) drawB(b); state.players.forEach(p=>drawP(p)); drawP(state.me); ctx.restore(); board(); requestAnimationFrame(loop); }
document.getElementById("btnJoin").addEventListener("click",()=>{ const name=(document.getElementById("inpName").value||"").trim()||"Joueur"; const room=(document.getElementById("inpRoom").value||"").trim()||"alpha"; try{localStorage.setItem("mini-shooter-name",name);}catch(_){ } start({name,room}); toast('Salle « '+room+' » rejointe'); });
try{ const lastName=localStorage.getItem("mini-shooter-name"); if(lastName) document.getElementById("inpName").value=lastName; }catch(_){}
</script></body></html>`;
app.get('/', (_req, res) => res.type('html').send(CLIENT_HTML));

// Démarrage
server.listen(PORT, () => console.log('Mini Shooter server running on :' + PORT));
