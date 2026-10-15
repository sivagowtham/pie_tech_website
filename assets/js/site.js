(function(){
var $=function(s,c){return(c||document).querySelector(s)},$$=function(s,c){return[].slice.call((c||document).querySelectorAll(s))};
/* mobile menu */
var mb=$('.menu-btn'),nav=$('.main-nav');
if(mb)mb.addEventListener('click',function(){var o=nav.classList.toggle('open');mb.setAttribute('aria-expanded',o)});
$$('.sub-toggle').forEach(function(b){b.addEventListener('click',function(){b.parentNode.classList.toggle('open')})});
/* hero slider */
var hero=$('.hero');
if(hero){var sl=$$('.slide',hero),dots=$('.hero-dots'),bar=$('.hero-progress span'),i=0,T=6000,tm,start;
 sl.forEach(function(_,n){var d=document.createElement('button');d.setAttribute('aria-label','Slide '+(n+1));d.onclick=function(){go(n)};dots.appendChild(d)});
 function go(n){sl[i].classList.remove('active');dots.children[i].classList.remove('on');i=(n+sl.length)%sl.length;sl[i].classList.add('active');dots.children[i].classList.add('on');run()}
 function run(){clearTimeout(tm);start=Date.now();bar.style.transition='none';bar.style.width='0';requestAnimationFrame(function(){requestAnimationFrame(function(){bar.style.transition='width '+T+'ms linear';bar.style.width='100%'})});tm=setTimeout(function(){go(i+1)},T)}
 $('.next',hero).onclick=function(){go(i+1)};$('.prev',hero).onclick=function(){go(i-1)};
 hero.addEventListener('mouseenter',function(){clearTimeout(tm);bar.style.transition='none'});hero.addEventListener('mouseleave',run);
 var sx=0;hero.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});hero.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40)go(i+(dx<0?1:-1))});
 document.addEventListener('keydown',function(e){if(e.key==='ArrowRight')go(i+1);if(e.key==='ArrowLeft')go(i-1)});
 dots.children[0].classList.add('on');run()}
/* tabs */
$$('.tab').forEach(function(t){t.addEventListener('click',function(){$$('.tab').forEach(function(x){x.classList.remove('active')});$$('.tabpane').forEach(function(x){x.classList.remove('active')});t.classList.add('active');$('#'+t.dataset.tab).classList.add('active')})});
/* reveal + counters */
var io='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;e.target.classList.add('in');$$('[data-count]',e.target).forEach(count);io.unobserve(e.target)})},{threshold:0,rootMargin:"0px 0px -5% 0px"}):null;
$$('.reveal').forEach(function(r){io?io.observe(r):r.classList.add('in')});
function count(el){if(el.dataset.plain!==undefined)return;var n=+el.dataset.count,s=performance.now();(function f(t){var p=Math.min((t-s)/1200,1);el.textContent=Math.round(n*p);if(p<1)requestAnimationFrame(f)})(s)}
/* to top */
var tt=$('.to-top');window.addEventListener('scroll',function(){tt.classList.toggle('show',scrollY>600)},{passive:true});tt.onclick=function(){scrollTo({top:0,behavior:'smooth'})};
/* lightbox */
var gi=$$('.gi');
if(gi.length){var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<button aria-label="Close">×</button><img alt="">';document.body.appendChild(lb);
 gi.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();$('img',lb).src=a.href;lb.classList.add('open')})});
 lb.addEventListener('click',function(){lb.classList.remove('open')});document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('open')})}
})();
