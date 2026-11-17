/* Data-driven sections (clubs, gallery, research).
   Each section reads a JSON file from /data. When a backend API is added later,
   point SRC at it (e.g. '/api/gallery') - the rendering below does not change. */
(function(){
var SRC={clubs:'data/clubs.json',gallery:'data/gallery.json',research:'data/research.json'};
var $=function(s,c){return(c||document).querySelector(s)},$$=function(s,c){return[].slice.call((c||document).querySelectorAll(s))};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function get(k){return fetch(SRC[k],{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})}
function initials(n){return n.replace(/\(.*?\)/g,'').split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0]}).join('').toUpperCase()}
function href(c){return c.page||('club.html?id='+encodeURIComponent(c.id))}

/* ---- clubs hub ---- */
var hub=$('[data-dyn="clubs"]');
if(hub)get('clubs').then(function(d){
 var cats=d.categories,clubs=d.clubs,cur='All';
 function draw(){
  var h='<div class="chips" role="tablist">'+['All'].concat(cats).map(function(c){return'<button class="chip'+(c===cur?' on':'')+'" data-c="'+esc(c)+'">'+esc(c)+'</button>'}).join('')+'</div>';
  cats.forEach(function(cat){
   if(cur!=='All'&&cur!==cat)return;
   var list=clubs.filter(function(c){return c.category===cat});if(!list.length)return;
   h+='<h3 class="club-cat">'+esc(cat)+'</h3><div class="club-grid">'+list.map(function(c){return'<a class="club-card" href="'+esc(href(c))+'"><span class="badge">'+esc(initials(c.name))+'</span><h3>'+esc(c.name)+'</h3><p>'+esc(c.summary)+'</p><span class="go">Know more &rarr;</span></a>'}).join('')+'</div>';
  });
  hub.innerHTML=h;
  $$('.chip',hub).forEach(function(b){b.onclick=function(){cur=b.getAttribute('data-c');draw()}});
 }
 draw();
}).catch(function(){});

/* ---- single club page ---- */
var one=$('[data-dyn="club"]');
if(one)get('clubs').then(function(d){
 var id=new URLSearchParams(location.search).get('id'),c=d.clubs.filter(function(x){return x.id===id})[0];
 if(!c){one.innerHTML='<p>We could not find that club. <a href="clubs.html">See all clubs</a>.</p>';return}
 document.title=c.name+' | PIE Tech';var h1=$('.page-hero h1');if(h1)h1.textContent=c.name;var cr=$$('.page-hero .crumbs li');if(cr.length)cr[cr.length-1].textContent=c.name;
 one.innerHTML='<div class="club-detail"><span class="club-meta">'+esc(c.category)+'</span><p>'+esc(c.description)+'</p>'+
  (c.activities&&c.activities.length?'<h3>What the club does</h3><ul>'+c.activities.map(function(a){return'<li>'+esc(a)+'</li>'}).join('')+'</ul>':'')+
  (c.coordinator?'<h3>Staff coordinator</h3><p>'+esc(c.coordinator)+'</p>':'')+
  '<p><a class="btn" href="clubs.html">&larr; All clubs</a></p></div>';
}).catch(function(){});

/* ---- gallery ---- */
function lightbox(items){
 var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<button aria-label="Close">&times;</button><img alt=""><p></p>';document.body.appendChild(lb);
 var im=$('img',lb),cap=$('p',lb);
 function show(i){var p=items[i];im.src=p.src;im.alt=p.caption||'';cap.textContent=p.caption||''}
 lb.onclick=function(e){if(e.target!==im)lb.classList.remove('open')};
 document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('open')});
 return function(i){show(i);lb.classList.add('open')};
}
var gal=$('[data-dyn="gallery"]');
if(gal)get('gallery').then(function(d){
 var photos=d.photos.slice().sort(function(a,b){return(b.date||'').localeCompare(a.date||'')});
 var albums=[];photos.forEach(function(p){if(albums.indexOf(p.album)<0)albums.push(p.album)});
 var cur='All',open;
 function draw(){
  var list=photos.filter(function(p){return cur==='All'||p.album===cur});
  gal.innerHTML='<div class="chips">'+['All'].concat(albums).map(function(a){return'<button class="chip'+(a===cur?' on':'')+'" data-a="'+esc(a)+'">'+esc(a)+'</button>'}).join('')+'</div><div class="album-grid">'+list.map(function(p,i){return'<figure data-i="'+i+'"><img src="'+esc(p.src)+'" alt="'+esc(p.caption||'PIE Tech photo')+'" loading="lazy">'+(p.caption?'<figcaption>'+esc(p.caption)+'</figcaption>':'')+'</figure>'}).join('')+'</div>';
  open=lightbox(list);
  $$('.chip',gal).forEach(function(b){b.onclick=function(){cur=b.getAttribute('data-a');$$('.lb').forEach(function(x){x.remove()});draw()}});
  $$('figure',gal).forEach(function(f){f.onclick=function(){open(+f.getAttribute('data-i'))}});
 }
 draw();
}).catch(function(){});

/* latest photos strip on the home page */
var latest=$('[data-dyn="gallery-latest"]');
if(latest)get('gallery').then(function(d){
 var n=+latest.getAttribute('data-count')||8;
 var p=d.photos.slice().sort(function(a,b){return(b.date||'').localeCompare(a.date||'')}).slice(0,n);
 if(p.length)latest.innerHTML=p.map(function(x){return'<a href="gallery.html" class="g-item"><img src="'+esc(x.src)+'" alt="'+esc(x.caption||'PIE Tech photo')+'" loading="lazy"></a>'}).join('');
}).catch(function(){});

/* ---- research ---- */
var rm=$('[data-dyn="research-members"]');
if(rm)get('research').then(function(d){
 rm.innerHTML='<div class="member-grid">'+d.members.map(function(m){return'<article class="member"><h3>'+esc(m.name)+'</h3>'+(m.role?'<p class="role">'+esc(m.role)+'</p>':'')+(m.qualification?'<p class="qual">'+esc(m.qualification)+'</p>':'')+(m.area?'<p><strong>Research area:</strong> '+esc(m.area)+'</p>':'')+(m.bio?'<p>'+esc(m.bio)+'</p>':'')+'</article>'}).join('')+'</div>';
}).catch(function(){});
var ra=$('[data-dyn="research-areas"]');
if(ra)get('research').then(function(d){ra.innerHTML='<div class="area-grid">'+d.areas.map(function(a){return'<div class="area">'+esc(a)+'</div>'}).join('')+'</div>'}).catch(function(){});
var rl=$('[data-dyn="research-list"]');
if(rl)get('research').then(function(d){
 var h='';(d.sections||[]).forEach(function(s){if(!s.items||!s.items.length)return;
  h+='<h3>'+esc(s.title)+'</h3><div class="table-scroll"><table class="data-table"><thead><tr>'+s.columns.map(function(c){return'<th>'+esc(c)+'</th>'}).join('')+'</tr></thead><tbody>'+s.items.map(function(r){return'<tr>'+r.map(function(c){return'<td>'+esc(c)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>'});
 rl.innerHTML=h;
}).catch(function(){});
})();
