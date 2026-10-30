const express=require('express'),http=require('http'),fs=require('fs'),path=require('path');
const {Server}=require('socket.io'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const SECRET=process.env.JWT_SECRET||'change-me-set-JWT_SECRET-on-render';
const DIR=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DIR,{recursive:true});
const F=path.join(DIR,'db.json');
let db={users:{},posts:[],statuses:[],messages:[]};
try{db=JSON.parse(fs.readFileSync(F))}catch(e){}
let tm;const save=()=>{clearTimeout(tm);tm=setTimeout(()=>fs.writeFile(F,JSON.stringify(db),()=>{}),500)};
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const img=s=>/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(s)&&s.length<3e6?s:'';
const app=express();app.use(express.json({limit:'4mb'}));app.use(express.static(path.join(__dirname,'public')));
app.get('/',(q,r)=>{const a=path.join(__dirname,'public','index.html'),b=path.join(__dirname,'index.html');r.sendFile(fs.existsSync(a)?a:b)});
const srv=http.createServer(app),io=new Server(srv,{maxHttpBufferSize:1e6});
const pub=u=>({username:u.username,followers:u.followers.length,following:u.following.length});
const tok=u=>jwt.sign({u},SECRET,{expiresIn:'30d'});
function auth(q,r,n){try{q.u=db.users[jwt.verify((q.headers.authorization||'').slice(7),SECRET).u];if(!q.u)throw 0;n()}catch(e){r.status(401).json({error:'Login required'})}}
app.post('/api/register',async(q,r)=>{const u=String(q.body.username||'').trim().toLowerCase(),p=String(q.body.password||'');
 if(!/^[a-z0-9_]{3,20}$/.test(u))return r.status(400).json({error:'Username: 3-20 letters, numbers or _'});
 if(p.length<6)return r.status(400).json({error:'Password must be 6+ characters'});
 if(db.users[u])return r.status(400).json({error:'Username already taken'});
 db.users[u]={username:u,hash:await bcrypt.hash(p,10),followers:[],following:[]};save();r.json({token:tok(u)})});
app.post('/api/login',async(q,r)=>{const u=db.users[String(q.body.username||'').trim().toLowerCase()];
 if(!u||!await bcrypt.compare(String(q.body.password||''),u.hash))return r.status(400).json({error:'Wrong username or password'});
 r.json({token:tok(u.username)})});
app.get('/api/me',auth,(q,r)=>r.json(pub(q.u)));
app.get('/api/users',auth,(q,r)=>{const s=String(q.query.q||'').toLowerCase();
 r.json(Object.values(db.users).filter(x=>x.username!==q.u.username&&x.username.includes(s)).slice(0,30).map(x=>({...pub(x),followed:q.u.following.includes(x.username)})))});
app.post('/api/follow/:n',auth,(q,r)=>{const o=db.users[q.params.n];if(!o||o===q.u)return r.status(400).json({error:'Invalid user'});
 const i=q.u.following.indexOf(o.username);
 if(i<0){q.u.following.push(o.username);o.followers.push(q.u.username)}else{q.u.following.splice(i,1);o.followers=o.followers.filter(x=>x!==q.u.username)}
 save();r.json({followed:i<0})});
app.get('/api/feed',auth,(q,r)=>r.json(db.posts.slice(-100).reverse()));
app.post('/api/posts',auth,(q,r)=>{const text=String(q.body.text||'').trim().slice(0,500),image=img(String(q.body.image||''));
 if(!text&&!image)return r.status(400).json({error:'Write something or add a photo'});
 db.posts.push({id:id(),user:q.u.username,text,image,time:Date.now(),likes:[],comments:[]});save();r.json({ok:1})});
app.post('/api/posts/:id/like',auth,(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);
 const i=p.likes.indexOf(q.u.username);i<0?p.likes.push(q.u.username):p.likes.splice(i,1);save();r.json({ok:1})});
app.post('/api/posts/:id/comment',auth,(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id),t=String(q.body.text||'').trim().slice(0,300);
 if(!p||!t)return r.sendStatus(400);p.comments.push({user:q.u.username,text:t,time:Date.now()});save();r.json({ok:1})});
app.get('/api/statuses',auth,(q,r)=>{const c=Date.now()-864e5;db.statuses=db.statuses.filter(s=>s.time>c);r.json(db.statuses.slice().reverse())});
app.post('/api/status',auth,(q,r)=>{const text=String(q.body.text||'').trim().slice(0,200),image=img(String(q.body.image||''));
 if(!text&&!image)return r.sendStatus(400);db.statuses.push({id:id(),user:q.u.username,text,image,time:Date.now()});save();r.json({ok:1})});
app.get('/api/messages/:n',auth,(q,r)=>{const a=q.u.username,b=q.params.n;r.json(db.messages.filter(m=>(m.from===a&&m.to===b)||(m.from===b&&m.to===a)).slice(-200))});
app.get('/api/chats',auth,(q,r)=>{const s=new Set();db.messages.forEach(m=>{if(m.from===q.u.username)s.add(m.to);if(m.to===q.u.username)s.add(m.from)});r.json([...s])});

const online={},locs={},lives={};
const emitTo=(u,ev,d)=>(online[u]||[]).forEach(i=>io.to(i).emit(ev,d));
function pushLocs(){for(const [u,set] of Object.entries(online)){const me=db.users[u];
 const v=Object.values(locs).filter(l=>l.user===u||me.following.includes(l.user));set.forEach(i=>io.to(i).emit('locs',v))}}
io.use((s,n)=>{try{s.user=jwt.verify(s.handshake.auth.token,SECRET).u;if(!db.users[s.user])throw 0;n()}catch(e){n(new Error('auth'))}});
io.on('connection',s=>{const u=s.user;(online[u]=online[u]||new Set()).add(s.id);
 s.emit('lives',Object.keys(lives));pushLocs();
 s.on('dm',({to,text})=>{text=String(text||'').trim().slice(0,1000);if(!db.users[to]||!text||to===u)return;
  const m={id:id(),from:u,to,text,time:Date.now()};db.messages.push(m);save();emitTo(to,'dm',m);emitTo(u,'dm',m)});
 s.on('loc',l=>{if(isFinite(l.lat)&&isFinite(l.lng)){locs[u]={user:u,lat:+l.lat,lng:+l.lng,time:Date.now()};pushLocs()}});
 s.on('loc:stop',()=>{delete locs[u];pushLocs()});
 s.on('rtc',({to,data})=>emitTo(to,'rtc',{from:u,data}));
 s.on('live:start',()=>{lives[u]=s.id;s.join('live:'+u);io.emit('lives',Object.keys(lives))});
 s.on('live:stop',()=>{if(lives[u]===s.id){delete lives[u];io.emit('lives',Object.keys(lives));io.emit('live:ended',u)}});
 s.on('live:join',h=>{if(lives[h]){s.join('live:'+h);io.to(lives[h]).emit('live:viewer',{id:s.id,user:u})}});
 s.on('live:sig',({to,data})=>io.to(to).emit('live:sig',{from:s.id,data}));
 s.on('live:chat',({host,text})=>{text=String(text||'').trim().slice(0,200);if(text&&s.rooms.has('live:'+host))io.to('live:'+host).emit('live:chat',{user:u,text})});
 s.on('disconnect',()=>{online[u].delete(s.id);
  if(!online[u].size){delete online[u];delete locs[u];pushLocs()}
  if(lives[u]===s.id){delete lives[u];io.emit('lives',Object.keys(lives));io.emit('live:ended',u)}});
});
srv.listen(process.env.PORT||3000,()=>console.log('Cyber World running'));
