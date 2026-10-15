(function(){
var T={
 en:{open:'Ask PIE Tech',title:'PIE Tech Assistant',sub:'Ask about courses, fees, admissions, hostel & placement',ph:'Type your question…',send:'Send',hello:'Hello! I am the PIE Tech assistant. How can I help you today?',note:'AI assistant. Answers come from our website - please confirm fees and dates with the admissions office: +91 8438940273.',src:'Source',err:'Sorry, I could not connect. Please call +91 8438940273.',
  chips:['What courses do you offer?','What are the tuition fees?','Scholarships for +2 students','Hostel and transport facilities','How can I apply?']},
 ta:{open:'PIE Tech-ஐ கேளுங்கள்',title:'PIE Tech உதவியாளர்',sub:'படிப்புகள், கட்டணம், சேர்க்கை, விடுதி, வேலைவாய்ப்பு பற்றி கேளுங்கள்',ph:'உங்கள் கேள்வியை எழுதுங்கள்…',send:'அனுப்பு',hello:'வணக்கம்! நான் PIE Tech உதவியாளர். உங்களுக்கு எப்படி உதவலாம்?',note:'AI உதவியாளர். பதில்கள் எங்கள் இணையதளத்திலிருந்து வருகின்றன - கட்டணம், தேதிகளை சேர்க்கை அலுவலகத்தில் உறுதிப்படுத்தவும்: +91 8438940273.',src:'மூலம்',err:'மன்னிக்கவும், இணைக்க முடியவில்லை. +91 8438940273 ஐ அழைக்கவும்.',
  chips:['என்னென்ன படிப்புகள் உள்ளன?','கல்வி கட்டணம் எவ்வளவு?','+2 மாணவர்களுக்கு உதவித்தொகை','விடுதி மற்றும் போக்குவரத்து வசதிகள்','எப்படி விண்ணப்பிப்பது?']}
};
var lang='en';try{lang=localStorage.getItem('pie-chat-lang')||'en'}catch(e){}
var hist=[],busy=false;
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(s){return esc(s).replace(/(https?:\/\/[^\s<)]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')}

var btn=el('button','chat-fab','<span class="chat-fab-ic">💬</span><span class="chat-fab-t"></span>');btn.setAttribute('aria-label','Open chat');
var box=el('section','chat-box');box.setAttribute('aria-label','PIE Tech assistant');box.hidden=true;
box.innerHTML='<header class="chat-head"><div><b class="ct"></b><small class="cs"></small></div><div class="chat-ctl"><button class="chat-lang" aria-label="Language">தமிழ்</button><button class="chat-x" aria-label="Close">×</button></div></header><div class="chat-msgs" aria-live="polite"></div><div class="chat-chips"></div><form class="chat-form"><input type="text" maxlength="500" autocomplete="off"><button class="btn" type="submit"></button></form><p class="chat-note"></p>';
document.body.appendChild(btn);document.body.appendChild(box);
var msgs=box.querySelector('.chat-msgs'),chips=box.querySelector('.chat-chips'),inp=box.querySelector('input'),form=box.querySelector('form');

function render(){var t=T[lang];btn.querySelector('.chat-fab-t').textContent=t.open;box.querySelector('.ct').textContent=t.title;box.querySelector('.cs').textContent=t.sub;inp.placeholder=t.ph;form.querySelector('.btn').textContent=t.send;box.querySelector('.chat-note').textContent=t.note;box.querySelector('.chat-lang').textContent=lang==='en'?'தமிழ்':'English';
 chips.innerHTML='';if(!hist.length)t.chips.forEach(function(c){var b=el('button','chip',esc(c));b.type='button';b.onclick=function(){ask(c)};chips.appendChild(b)})}
function add(who,html){var m=el('div','m '+who,html);msgs.appendChild(m);msgs.scrollTop=msgs.scrollHeight;return m}
function start(){msgs.innerHTML='';hist=[];add('bot',esc(T[lang].hello));render()}
async function ask(q){q=(q||'').trim();if(!q||busy)return;busy=true;chips.innerHTML='';add('user',esc(q));hist.push({role:'user',content:q});inp.value='';
 var w=add('bot typing','<i></i><i></i><i></i>');
 try{var r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:hist,lang:lang})});var d=await r.json();w.className='m bot';var h=fmt(d.reply||T[lang].err);
  if(d.sources&&d.sources.length)h+='<div class="srcs">'+T[lang].src+': '+d.sources.map(function(s){return '<a href="'+esc(s.url)+'">'+esc(s.title)+'</a>'}).join(' · ')+'</div>';
  w.innerHTML=h;hist.push({role:'assistant',content:d.reply||''})}
 catch(e){w.className='m bot';w.innerHTML=esc(T[lang].err);hist.pop()}
 busy=false;msgs.scrollTop=msgs.scrollHeight;inp.focus()}
form.addEventListener('submit',function(e){e.preventDefault();ask(inp.value)});
btn.onclick=function(){box.hidden=false;btn.classList.add('hide');if(!msgs.children.length)start();inp.focus()};
box.querySelector('.chat-x').onclick=function(){box.hidden=true;btn.classList.remove('hide')};
box.querySelector('.chat-lang').onclick=function(){lang=lang==='en'?'ta':'en';try{localStorage.setItem('pie-chat-lang',lang)}catch(e){}start()};
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!box.hidden)box.querySelector('.chat-x').click()});
render();
})();
