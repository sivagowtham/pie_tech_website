/* PIE Tech content admin - plain JavaScript, no libraries. All text is set with textContent (never innerHTML). */
(function () {
  'use strict';
  var app = document.getElementById('app'), toastEl = document.getElementById('toast');
  var me = null, tab = 'gallery', docs = {}, dirty = false;

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) { el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    }
    return el;
  }
  function toast(msg, err) {
    toastEl.textContent = msg; toastEl.className = 'show' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = ''; }, err ? 6000 : 2600);
  }
  function api(path, opts) {
    opts = opts || {}; opts.credentials = 'same-origin';
    return fetch('../api/admin/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && path !== 'login') { me = null; render(); }
        if (!r.ok) { var e = new Error(d.error || ('Error ' + r.status)); e.status = r.status; e.data = d; throw e; }
        return d;
      });
    });
  }
  function put(name, data) {
    return api('save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, data: data, rev: docs[name]._rev || 0 }) }).then(function (d) { docs[name]._rev = d.rev; dirty = false; toast('Saved. The website is updated.'); });
  }
  function load(name) {
    return fetch('../api/data/' + name + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Could not load ' + name);
      return r.json();
    }).then(function (d) { docs[name] = d; return d; });
  }
  var today = function () { return new Date().toISOString().slice(0, 10); };

  /* ----- photo resize in the browser: max 1800 px, JPEG ----- */
  function resize(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Could not process the photo')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error(file.name + ' is not a photo the browser can read')); };
      img.src = u;
    });
  }
  function upload(file) {
    return resize(file).then(function (blob) {
      return fetch('../api/admin/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload failed'); return d.src; }); });
  }
  function pickFiles(multiple, cb) {
    var i = h('input', { type: 'file', accept: 'image/*', multiple: multiple, style: 'display:none' });
    i.addEventListener('change', function () { cb([].slice.call(i.files)); });
    document.body.appendChild(i); i.click(); setTimeout(function () { i.remove(); }, 60000);
  }

  /* ----- screens ----- */
  function render() {
    app.textContent = '';
    if (!me) return renderLogin();
    var tabs = [['gallery', 'Photo Gallery'], ['news', 'News & Events'], ['clubs', 'Clubs'], ['research', 'Research'], ['activity', 'Activity']];
    if (me.role === 'admin') tabs.push(['users', 'Editors']);
    app.appendChild(h('div', { class: 'top' }, h('img', { src: '../images/slider/logo.png', alt: '' }), h('b', { text: 'PIE Tech Content Admin' }), h('span', { class: 'sp' }),
      h('span', { text: 'Signed in as ' + me.name }), h('a', { href: '../index.html', target: '_blank', rel: 'noopener', text: 'View website' }),
      h('button', { class: 'btn sec sm', text: 'Sign out', onclick: function () { api('logout', { method: 'POST' }).then(function () { me = null; render(); }); } })));
    app.appendChild(h('div', { class: 'tabs' }, tabs.map(function (t) {
      return h('button', { class: t[0] === tab ? 'on' : '', text: t[1], onclick: function () { if (dirty && !confirm('You have unsaved changes. Leave this page anyway?')) return; dirty = false; tab = t[0]; render(); } });
    })));
    var main = h('main'); app.appendChild(main);
    var fn = { gallery: viewGallery, news: viewNews, clubs: viewClubs, research: viewResearch, activity: viewActivity, users: viewUsers }[tab];
    var need = { gallery: 'gallery', news: 'news', clubs: 'clubs', research: 'research' }[tab];
    if (need) load(need).then(function () { fn(main); }).catch(function (e) { main.appendChild(h('p', { text: e.message })); });
    else fn(main);
  }

  function renderLogin() {
    var u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', required: true }), p = h('input', { type: 'password', autocomplete: 'current-password', required: true }), err = h('p', { class: 'muted', style: 'color:#c0392b' });
    var f = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      api('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.value, password: p.value }) })
        .then(function (d) { me = d.user; render(); }).catch(function (x) { err.textContent = x.message; });
    } }, h('label', { text: 'Username' }), u, h('label', { text: 'Password' }), p, err, h('p', null, h('button', { class: 'btn', type: 'submit', text: 'Sign in' })));
    app.appendChild(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h2', { text: 'PIE Tech Content Admin' }), h('p', { class: 'muted', text: 'For faculty who maintain the website. Ask the website administrator for an account.' }), f)));
    u.focus();
  }

  function saveBar(main, name, getData) {
    var note = h('span', { text: 'Changes are not live until you press Save.' });
    var b = h('button', { class: 'btn', text: 'Save changes', onclick: function () {
      b.disabled = true;
      put(name, getData()).then(function () { note.textContent = 'All changes saved.'; note.className = ''; }).catch(function (e) { toast(e.message, true); if (e.status === 409) note.textContent = 'Reload this page to get the latest version.'; }).then(function () { b.disabled = false; });
    } });
    main.appendChild(h('div', { class: 'bar' }, note, b));
    return function mark() { dirty = true; note.textContent = 'You have unsaved changes.'; note.className = 'dirty'; };
  }

  /* ----- Gallery ----- */
  function viewGallery(main) {
    var d = docs.gallery, photos = d.photos.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var mark = saveBar(main, 'gallery', function () { return { photos: photos }; });
    var albums = function () { return photos.map(function (p) { return p.album; }).filter(function (a, i, s) { return a && s.indexOf(a) === i; }); };
    var album = h('input', { list: 'albums', value: albums()[0] || 'Campus & Facilities', placeholder: 'Album name' });
    var dl = h('datalist', { id: 'albums' }, albums().map(function (a) { return h('option', { value: a }); }));
    var grid = h('div', { class: 'photos' });
    function draw() {
      grid.textContent = '';
      photos.forEach(function (p, i) {
        var cap = h('input', { value: p.caption || '', placeholder: 'Caption', 'aria-label': 'Caption', oninput: function () { p.caption = cap.value; mark(); } });
        var alb = h('input', { value: p.album || '', list: 'albums', 'aria-label': 'Album', oninput: function () { p.album = alb.value; mark(); } });
        var dt = h('input', { type: 'date', value: p.date || '', 'aria-label': 'Date', onchange: function () { p.date = dt.value; mark(); } });
        grid.appendChild(h('div', { class: 'ph' }, h('img', { src: p.src.charAt(0) === '/' || /^https?:/.test(p.src) ? p.src : '../' + p.src, alt: p.caption || '', loading: 'lazy' }),
          h('div', null, cap, alb, dt, h('button', { class: 'btn del sm', text: 'Remove', onclick: function () {
            if (!confirm('Remove this photo from the gallery?')) return;
            if (p.src.indexOf('/media/u/') === 0) api('upload?key=' + encodeURIComponent(p.src.slice(7)), { method: 'DELETE' }).catch(function () {});
            photos.splice(i, 1); mark(); draw();
          } }))));
      });
    }
    var drop = h('div', { class: 'drop', tabindex: '0', role: 'button', text: 'Click here (or drop photos) to add photos. They are resized automatically.' });
    function add(files) {
      files = files.filter(function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      var n = 0; drop.textContent = 'Uploading...';
      files.reduce(function (pr, f) {
        return pr.then(function () { return upload(f).then(function (src) { photos.unshift({ src: src, caption: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), album: album.value || 'General', date: today() }); n++; drop.textContent = 'Uploaded ' + n + ' of ' + files.length + '...'; }); });
      }, Promise.resolve()).catch(function (e) { toast(e.message, true); }).then(function () { drop.textContent = 'Click here (or drop photos) to add photos. They are resized automatically.'; if (n) { toast(n + ' photo(s) added. Press Save to publish.'); mark(); draw(); } });
    }
    drop.onclick = function () { pickFiles(true, add); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') drop.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); add([].slice.call(e.dataTransfer.files)); };
    main.appendChild(h('h2', { text: 'Photo Gallery' }));
    main.appendChild(h('div', { class: 'help', text: 'Pick the album first, then add photos. Newest photos appear first on the website. Press Save when you are done.' }));
    main.appendChild(h('div', { class: 'card' }, h('label', { text: 'Add to album' }), album, dl, h('p'), drop));
    main.appendChild(grid); draw();
  }

  /* ----- News ----- */
  function viewNews(main) {
    var news = docs.news.news;
    var mark = saveBar(main, 'news', function () { return { news: news }; });
    var list = h('div', { class: 'card' });
    function draw() {
      list.textContent = '';
      news.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      news.forEach(function (n, i) {
        var dt = h('input', { type: 'date', value: n.date || '', onchange: function () { n.date = dt.value; mark(); } });
        var ti = h('input', { value: n.title, oninput: function () { n.title = ti.value; mark(); } });
        var su = h('textarea', { text: n.summary || '', oninput: function () { n.summary = su.value; mark(); } });
        var imgs = h('div', { class: 'flex' }, (n.images || []).map(function (s, k) { return h('span', null, h('img', { src: s.charAt(0) === '/' ? s : '../' + s, alt: '', style: 'height:54px;border-radius:6px' }), h('button', { class: 'btn del sm', text: 'x', 'aria-label': 'Remove photo', onclick: function () { n.images.splice(k, 1); mark(); draw(); } })); }));
        list.appendChild(h('div', { class: 'list-item' }, h('div', { class: 'row' }, h('div', null, h('label', { text: 'Date' }), dt), h('div', null, h('label', { text: 'Title' }), ti)),
          h('label', { text: 'Details' }), su, imgs,
          h('div', { class: 'flex' }, h('button', { class: 'btn sec sm', text: 'Add photo', onclick: function () { pickFiles(false, function (f) { upload(f[0]).then(function (src) { (n.images = n.images || []).push(src); mark(); draw(); }).catch(function (e) { toast(e.message, true); }); }); } }),
            h('button', { class: 'btn del sm', text: 'Delete this item', onclick: function () { if (confirm('Delete "' + n.title + '"?')) { news.splice(i, 1); mark(); draw(); } } }))));
      });
    }
    main.appendChild(h('h2', { text: 'News & Events' }));
    main.appendChild(h('div', { class: 'help', text: 'The latest six items show on the home page. Add an item with the button below, fill it in, then press Save.' }));
    main.appendChild(h('p', null, h('button', { class: 'btn', text: '+ Add news or event', onclick: function () { news.unshift({ date: today(), title: 'New event', summary: '', images: [] }); mark(); draw(); } })));
    main.appendChild(list); draw();
  }

  /* ----- Clubs ----- */
  function viewClubs(main) {
    var d = docs.clubs, mark = saveBar(main, 'clubs', function () { return d; });
    var list = h('div');
    function draw() {
      list.textContent = '';
      d.clubs.forEach(function (c, i) {
        var f = function (k, ta) { var el = h(ta ? 'textarea' : 'input', { value: c[k] || '', text: ta ? c[k] || '' : undefined, oninput: function () { c[k] = el.value; mark(); } }); return el; };
        var cat = h('select', { onchange: function () { c.category = cat.value; mark(); } }, d.categories.map(function (x) { return h('option', { value: x, text: x, selected: x === c.category }); }));
        var acts = h('textarea', { text: (c.activities || []).join('\n'), oninput: function () { c.activities = acts.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); mark(); } });
        list.appendChild(h('div', { class: 'card' }, h('h3', { text: c.name || 'New club' }), h('div', { class: 'row' }, h('div', null, h('label', { text: 'Club name' }), f('name')), h('div', null, h('label', { text: 'Group' }), cat), h('div', null, h('label', { text: 'Staff coordinator (optional)' }), f('coordinator'))),
          h('label', { text: 'One-line summary' }), f('summary'), h('label', { text: 'About the club' }), f('description', true), h('label', { text: 'Activities (one per line)' }), acts,
          c.page ? h('p', { class: 'muted', text: 'This club has its own page (' + c.page + '); the About text above is used only in search.' }) : null,
          h('p', null, h('button', { class: 'btn del sm', text: 'Delete club', onclick: function () { if (confirm('Delete ' + c.name + '?')) { d.clubs.splice(i, 1); mark(); draw(); } } }))));
      });
    }
    main.appendChild(h('h2', { text: 'Clubs' }));
    main.appendChild(h('p', null, h('button', { class: 'btn', text: '+ Add a club', onclick: function () {
      var name = prompt('Name of the new club?'); if (!name) return;
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      if (d.clubs.some(function (c) { return c.id === id; })) { toast('A club with that name already exists', true); return; }
      d.clubs.unshift({ id: id, name: name, category: d.categories[0], summary: '', description: '', activities: [] }); mark(); draw();
    } })));
    main.appendChild(list); draw();
  }

  /* ----- Research ----- */
  function viewResearch(main) {
    var d = docs.research, mark = saveBar(main, 'research', function () { return d; });
    var box = h('div');
    function draw() {
      box.textContent = '';
      var areas = h('textarea', { text: d.areas.join('\n'), oninput: function () { d.areas = areas.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); mark(); } });
      box.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Research areas' }), h('p', { class: 'muted', text: 'One area per line.' }), areas));
      d.members.forEach(function (m, i) {
        var f = function (k, ta) { var el = h(ta ? 'textarea' : 'input', { value: m[k] || '', text: ta ? m[k] || '' : undefined, oninput: function () { m[k] = el.value; mark(); } }); return el; };
        box.appendChild(h('div', { class: 'card' }, h('h3', { text: m.name || 'New member' }), h('div', { class: 'row' }, h('div', null, h('label', { text: 'Name' }), f('name')), h('div', null, h('label', { text: 'Role / designation' }), f('role')), h('div', null, h('label', { text: 'Qualification' }), f('qualification')), h('div', null, h('label', { text: 'Research area' }), f('area'))),
          h('label', { text: 'Short profile' }), f('bio', true), h('p', null, h('button', { class: 'btn del sm', text: 'Remove member', onclick: function () { if (confirm('Remove ' + m.name + '?')) { d.members.splice(i, 1); mark(); draw(); } } }))));
      });
      box.appendChild(h('p', null, h('button', { class: 'btn sec', text: '+ Add research member', onclick: function () { d.members.push({ name: 'New member' }); mark(); draw(); } })));
      d.sections.forEach(function (s) {
        var tb = h('table', null, h('tr', null, s.columns.map(function (c) { return h('th', { text: c }); }), h('th')));
        s.items.forEach(function (r, ri) {
          tb.appendChild(h('tr', null, s.columns.map(function (_, ci) { var el = h('input', { value: r[ci] || '', 'aria-label': s.columns[ci], oninput: function () { r[ci] = el.value; mark(); } }); return h('td', null, el); }),
            h('td', null, h('button', { class: 'btn del sm', text: 'x', 'aria-label': 'Remove row', onclick: function () { s.items.splice(ri, 1); mark(); draw(); } }))));
        });
        box.appendChild(h('div', { class: 'card' }, h('h3', { text: s.title }), s.items.length ? null : h('p', { class: 'muted', text: 'Nothing here yet, so this section is hidden on the website. Add a row to show it.' }),
          h('div', { style: 'overflow-x:auto' }, tb), h('p', null, h('button', { class: 'btn sec sm', text: '+ Add row', onclick: function () { s.items.push(s.columns.map(function () { return ''; })); mark(); draw(); } }))));
      });
    }
    main.appendChild(h('h2', { text: 'Research' })); main.appendChild(box); draw();
  }

  /* ----- Activity + editors ----- */
  function viewActivity(main) {
    main.appendChild(h('h2', { text: 'Recent activity' }));
    var card = h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Loading...' })); main.appendChild(card);
    api('audit').then(function (d) {
      card.textContent = '';
      if (!d.rows.length) card.appendChild(h('p', { text: 'No activity yet.' }));
      d.rows.forEach(function (r) { card.appendChild(h('div', { class: 'list-item' }, h('b', { text: r.who }), ' ' + r.action + (r.doc ? ' - ' + r.doc : ''), h('div', { class: 'muted', text: new Date(r.t).toLocaleString() }))); });
    }).catch(function (e) { card.textContent = e.message; });
  }

  function viewUsers(main) {
    main.appendChild(h('h2', { text: 'Editors' }));
    main.appendChild(h('div', { class: 'help', text: 'Create a login for each faculty member who will update the website. Use a password of at least 10 characters and share it privately. Remove the account when they no longer need access.' }));
    var list = h('div', { class: 'card' });
    function draw() {
      list.textContent = '';
      api('users').then(function (d) {
        if (!d.users.length) list.appendChild(h('p', { class: 'muted', text: 'No editor accounts yet.' }));
        d.users.forEach(function (u) { list.appendChild(h('div', { class: 'list-item flex' }, h('b', { text: u.name }), h('span', { class: 'muted', text: u.role }), h('span', { class: 'sp' }), h('button', { class: 'btn del sm', text: 'Remove', onclick: function () { if (confirm('Remove ' + u.name + '?')) api('users?name=' + encodeURIComponent(u.name), { method: 'DELETE' }).then(draw); } }))); });
      });
    }
    var n = h('input', { autocapitalize: 'none', placeholder: 'e.g. priya.cse' }), p = h('input', { type: 'password', autocomplete: 'new-password' }), r = h('select', null, h('option', { value: 'editor', text: 'Editor (can edit content)' }), h('option', { value: 'admin', text: 'Admin (can also manage editors)' }));
    main.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Add or reset an editor' }), h('div', { class: 'row' }, h('div', null, h('label', { text: 'Username' }), n), h('div', null, h('label', { text: 'Password' }), p), h('div', null, h('label', { text: 'Role' }), r)),
      h('p', null, h('button', { class: 'btn', text: 'Save account', onclick: function () { api('users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n.value, password: p.value, role: r.value }) }).then(function () { toast('Account saved'); n.value = ''; p.value = ''; draw(); }).catch(function (e) { toast(e.message, true); }); } }))));
    main.appendChild(list); draw();
  }

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  api('me').then(function (d) { me = d.user; render(); }).catch(function () { me = null; render(); });
})();
