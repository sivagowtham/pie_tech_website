/* Data-driven sections (clubs, gallery, research).
   Each section reads a JSON file from /data. When a backend API is added later,
   point SRC at it (e.g. '/api/gallery') - the rendering below does not change. */
(function(){
var SRC={clubs:'data/clubs.json',gallery:'data/gallery.json',research:'data/research.json',news:'data/news.json',search:'data/search-index.json'};
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

/* ---- news & events ---- */
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dateBlock(iso){var p=(iso||'').split('-');if(p.length<3)return'<div class="nv-date"><b>&ndash;</b></div>';return'<div class="nv-date"><b>'+p[2]+'</b><span>'+MON[+p[1]-1]+'</span><em>'+p[0]+'</em></div>'}
var nh=$('[data-dyn="news-home"]');
if(nh)get('news').then(function(d){
 var n=+nh.getAttribute('data-count')||6;
 nh.innerHTML=d.news.slice(0,n).map(function(x){return'<a class="nv" href="news-events.html">'+dateBlock(x.date)+'<div><h3>'+esc(x.title)+'</h3>'+(x.summary?'<p>'+esc(x.summary.length>140?x.summary.slice(0,140)+'…':x.summary)+'</p>':'')+'</div></a>'}).join('');
}).catch(function(){});
var np=$('[data-dyn="news"]');
if(np)get('news').then(function(d){
 var all=d.news,years=[];all.forEach(function(x){var y=(x.date||'').slice(0,4);if(y&&years.indexOf(y)<0)years.push(y)});
 var yr='All',q='';
 np.innerHTML='<form class="search-form" onsubmit="return false"><input type="search" placeholder="Search news and events" aria-label="Search news and events"></form><div class="chips"></div><div class="nv-list"></div>';
 var inp=$('input',np),chips=$('.chips',np),list=$('.nv-list',np);
 function draw(){
  chips.innerHTML=['All'].concat(years).map(function(y){return'<button class="chip'+(y===yr?' on':'')+'" data-y="'+y+'">'+y+'</button>'}).join('');
  $$('.chip',chips).forEach(function(b){b.onclick=function(){yr=b.getAttribute('data-y');draw()}});
  var l=all.filter(function(x){return(yr==='All'||(x.date||'').slice(0,4)===yr)&&(!q||(x.title+' '+x.summary).toLowerCase().indexOf(q)>=0)});
  list.innerHTML=l.length?l.map(function(x){return'<article class="nv" style="cursor:default">'+dateBlock(x.date)+'<div><h3>'+esc(x.title)+'</h3>'+(x.summary?'<p>'+esc(x.summary)+'</p>':'')+(x.images&&x.images.length?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+x.images.map(function(i){return'<img src="'+esc(i)+'" alt="" loading="lazy" style="height:90px;width:auto;border-radius:8px">'}).join('')+'</div>':'')+'</div></article>'}).join(''):'<p>No matching news or events.</p>';
 }
 inp.oninput=function(){q=inp.value.trim().toLowerCase();draw()};draw();
}).catch(function(){});

/* ---- site search ---- */
var sp=$('[data-dyn="search"]');
if(sp)get('search').then(function(idx){
 var q0=new URLSearchParams(location.search).get('q')||'';
 sp.innerHTML='<form class="search-form" action="search.html"><input type="search" name="q" value="'+esc(q0)+'" placeholder="Search the PIE Tech website" aria-label="Search"><button class="btn" type="submit">Search</button></form><div class="results"></div>';
 var out=$('.results',sp);
 function run(q){
  var terms=q.toLowerCase().split(/\s+/).filter(function(t){return t.length>1});
  if(!terms.length){out.innerHTML='';return}
  var scored=idx.map(function(r){var t=(r.t||'').toLowerCase(),x=(r.x||'').toLowerCase(),sc=0;terms.forEach(function(w){if(t.indexOf(w)>=0)sc+=5;var i=-1,c=0;while((i=x.indexOf(w,i+1))>=0&&c<5){c++;sc+=1}});return{r:r,s:sc}}).filter(function(o){return o.s>0}).sort(function(a,b){return b.s-a.s});
  var seen={},rows=[];scored.forEach(function(o){var k=o.r.u+'|'+o.r.t;if(seen[k]||rows.length>=20)return;seen[k]=1;rows.push(o.r)});
  out.innerHTML=rows.length?rows.map(function(r){var x=r.x||'',lo=x.toLowerCase(),i=Math.max(0,lo.indexOf(terms[0])-60),sn=esc(x.slice(i,i+220));terms.forEach(function(w){sn=sn.replace(new RegExp('('+w.replace(/[^a-z0-9]/g,'')+')','ig'),'<mark>$1</mark>')});return'<div class="sr"><a href="'+esc(r.u)+'">'+esc(r.t)+'</a><p>'+(i>0?'…':'')+sn+'…</p><small>'+esc(r.u)+'</small></div>'}).join(''):'<p>No results for <strong>'+esc(q)+'</strong>. Try different words.</p>';
 }
 run(q0);
}).catch(function(){});
})();
