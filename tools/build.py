#!/usr/bin/env python3
"""Builds the PIE Tech static site from a mirror of https://www.pietech.edu.in.

usage: build.py <mirror_dir> <out_dir>
 mirror_dir has pages/*.php (raw HTML) and img/ (originals).
Content text and links are carried over verbatim; hidden SEO-spam links and
tracking/miner iframes on the live pages are dropped.
"""
import sys, re, os, html, shutil, json
from urllib.parse import quote, unquote
from bs4 import BeautifulSoup, Comment

SRC, OUT = sys.argv[1], sys.argv[2]
LIVE = 'https://www.pietech.edu.in/'
SPAM = re.compile(r'parajumpers|moncler|coinpot|boutique', re.I)

pages = {}
for f in os.listdir(f'{SRC}/pages'):
    raw = open(f'{SRC}/pages/{f}', encoding='utf-8', errors='ignore').read()
    if len(raw) < 1500 and '404' in raw[:600]:
        continue
    pages[f] = raw

def slug(name):
    n = unquote(name).rsplit('.', 1)[0].strip().lower()
    return re.sub(r'[^a-z0-9]+', '-', n).strip('-')

# live page name (as in href) -> output html
name_map = {}
exact = {}
used = {}
for f in sorted(pages):
    if f == 'gallery.php_id_1':
        continue
    key = f.replace('_', ' ') if f not in pages else f
    s = slug(f)
    if s in used and used[s] != f:
        s += '-2'
    used[s] = f
    name_map.setdefault(f.replace('_', ' ').lower(), s + '.html')
    name_map.setdefault(f.lower(), s + '.html')
    exact[f.replace('_', ' ')] = s + '.html'
    exact[f] = s + '.html'
name_map['index.php'] = 'index.html'

def fix_href(h):
    if not h or h.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
        return h
    if SPAM.search(h):
        return None
    if re.match(r'https?://(www\.)?pietech\.edu\.in(/|$)', h) and not h.startswith(('http://www.pietech.edu.in:', )):
        rel = re.sub(r'^https?://(www\.)?pietech\.edu\.in/?', '', h) or 'index.php'
        h = rel if re.match(r'(?i)(.*\.php|doc/|images/)', unquote(rel)) else h
    if re.match(r'https?://', h):
        return h
    base, q = (h.split('?', 1) + [''])[:2]
    key = unquote(base).lower()
    if unquote(base) in exact:
        return exact[unquote(base)]
    if key.endswith('.php'):
        if key == 'gallery.php':
            return 'gallery.html'
        if key in name_map:
            return name_map[key]
        return False  # dead page on the live site
    if re.match(r'circular/', unquote(base), re.I):
        return quote('images/' + unquote(base))
    if re.match(r'(doc|images)/', unquote(base), re.I):
        if unquote(base).lower().startswith('doc/'):
            return LIVE + quote(unquote(base))
        return quote(unquote(base))
    return h

def clean_fragment(soup_el):
    for c in soup_el.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for t in soup_el.find_all(['script', 'style', 'iframe', 'noscript', 'link', 'meta']):
        t.decompose()
    for t in soup_el.select('.BPJS'):
        t.decompose()
    for a in soup_el.find_all('a'):
        if (a.get('href') or '').strip() in ('--', '-', ''):
            a.unwrap(); continue
        r = fix_href(a.get('href'))
        if r is None:
            a.decompose(); continue
        if r is False:
            a.unwrap(); continue
        a['href'] = r
        if r.startswith(('http://', 'https://')) and 'pietech.edu.in' not in r or r.startswith(LIVE):
            a['target'] = '_blank'; a['rel'] = 'noopener'
    for im in soup_el.find_all('img'):
        s = im.get('src', '')
        if s.startswith('http'):
            continue
        s = unquote(s).replace('\\', '/')
        if re.match(r'(?i)circular/', s): s = 'images/' + s
        if 'IQAC1.png' in s or 'icc 12' in s or 'admin/assets' in s:
            im.decompose(); continue
        im['src'] = quote(s)
        im['loading'] = 'lazy'
        for at in ('width', 'height', 'border', 'hspace', 'vspace', 'align'):
            im.attrs.pop(at, None)
        if not im.get('alt'): im['alt'] = ''
    for t in soup_el.find_all(True):
        for at in ('style', 'bgcolor', 'color', 'face', 'size', 'id', 'onmouseover', 'onmouseout', 'onclick', 'cellpadding', 'cellspacing', 'valign', 'nowrap', 'width', 'height'):
            if at in t.attrs and not (at in ('width', 'height') and t.name in ('iframe',)):
                del t.attrs[at]
    keep = re.compile(r'^(col-md-\d+|img-responsive|broucher-main|down-app|nav_list|list-unstyled|emergency|course)$')
    for t in soup_el.find_all(class_=True):
        cl = [c for c in t.get('class', []) if keep.match(c)]
        if cl: t['class'] = cl
        else: del t['class']
    for t in soup_el.find_all(['font', 'center']):
        t.unwrap()
    for t in soup_el.find_all('marquee'):
        t.name = 'div'
    for t in soup_el.find_all('table'):
        t['class'] = ['data-table']
        w = BeautifulSoup('<div class="table-scroll"></div>', 'html.parser').div
        t.wrap(w)
    return soup_el

def parse_menu(raw):
    s = BeautifulSoup(re.sub(r'<!--.*?-->', '', raw, flags=re.S), 'html.parser')
    nav = s.find('nav')
    def items(ul):
        out = []
        for li in ul.find_all('li', recursive=False):
            a = li.find('a', recursive=False)
            sub = li.find('ul', recursive=False)
            if not a: continue
            h = fix_href(a.get('href'))
            out.append({'t': a.get_text(' ', strip=True), 'h': h or '#', 'c': items(sub) if sub else []})
        return out
    top = nav.find('ul')
    return items(top)

# The live nav HTML is malformed (unclosed <li>, broken href), so the structure is transcribed by hand.
# Groups without a label on the live site are named after the live breadcrumbs: Admissions, Departments, Faculty.
def M(t, h='#', c=None): return {'t': t, 'h': fix_href(h) or '#', 'c': c or []}
menu = [
 M('About Us', 'index.php', [M('PIE Tech','trust.php'), M('Management','Management.php'),
   M('Administration','#',[M('Governing Council','college-commitee.php'),M('Chairman','chairman.php'),M('Secretary','secretary.php'),M('Principal','principal.php'),M('Deans','dean.php'),M('HoDs','hod.php')]),
   M('Committees','#',[M('Anti Ragging Committee','Anti-Ragging Committee.php'),M('Internal Complaints Committee','Internal-Complaints-Committee.php'),M('Discipline and welfare Committee','Discipline-and-welfare-Committee.php'),M('Finance Committee','Finance-Committee.php'),M('Students Grievance Redressal committee','Grievance-Redressal.php'),M('Health and wellness committee','Health and Wellness Committee.php')]),
   M('Organizational Structure','Organogram.php')]),
 M('Academics', '#', [M('Programmes Offered','courses.php'),M('Anna University Regulations','syllabus.php'),M('Academic Calendar','doc/Academic Calendar 25-26.pdf'),M('Activity Calendar','doc/Academic Calendar 25-26.pdf'),M('Examinations','#'),M('Faculty Sheet','doc/Faculty Details.pdf')]),
 M('Admissions', 'admissions.php', [M('Programmes Offered','courses.php'),M('Eligibility','admissions.php'),M('Scholarships','scholarships.php'),M('Financial Aid','financial-aid.php'),M('Tuition Fees','tuition.php'),M('Campus Life','campus-life.php'),M('Online Admission Form','https://forms.gle/6W159TxYHu7MThev9')]),
 M('Research', '#', [M('Research Policy and Promotions','research.php'),M('Research Members','Research Members.php'),M('IPR','IPR.php'),M('IIC','IIC.php')]),
 M('Departments', 'courses.php', [M('Artificial Intelligence & Data Science','pietech-ai.php'),M('B.Tech Information Technology','pietech-it.php'),M('Mechanical','pietech-mechanical.php'),M('Civil','pietech-civil.php'),M('Computer Science','pietech-cse.php'),M('Electronics & Communication','pietech-ece.php'),M('Electrical & Electronics','pietech-eee.php'),M('Science & Humanities','pietech-sci-human.php'),M('Exam Cell','exam-cell.php')]),
 M('Placement', '#', [M('Placement Cell','placementcell.php'),M('Recruiters Visited','placement-logo.php'),M('Placement Record','placement-record.php')]),
 M('Faculty', '#', [M('Principal','principal.php'),M('Faculty name list','faculty-name-list.php'),M('Research','research.php')]),
 M('Student Zone', '#', [M('NSS','NSS.php'),M('Clubs','#',[M('Natural Club','Nature-club.php'),M('Tamil Mandram','TamilMandram.php'),M('Coding Club','Coding.php'),M('YRC','YRC.php'),M('ENGLISH LITERARY CLUB','English-Club.php'),M('SCIENCE CLUB','Science-Club.php')]),M('Scholarships','scholarships.php'),M('Students Union','Student Union.php')]),
 M('Alumni', '#', [M('Alumni','Alumni.php'),M('Alumni Registration','https://pietech.kredovoiceout.in/#/OtherFeedbacks'),M('Alumni Feedback','https://pietech.kredovoiceout.in/#/OtherFeedbacks')]),
 M('Explore', '#', [M('Laboratories','Lab.php'),M('Sports','sports-club.php'),M('Hostel','hostel-facilities.php'),M('Cafeteria','Cafeteria.php'),M('Transport','transport.php'),M('Photo Gallery','gallery.php')]),
 M('ERP', 'contact.php', [M('Academic ERP','https://laudea.pietech.edu.in/'),M('Fees ERP','https://fees.pietech.edu.in/student#!/login')]),
 M('Contact Us', 'contact.php', [M('Suggestion Box','contact.php'),M('Emergency Contact','emergency.php')]),
]
def render_menu(items, depth=0):
    h = ''
    for it in items:
        href = it['h']
        attrs = ' target="_blank" rel="noopener"' if href.startswith('http') else ''
        if it['c']:
            h += f'<li class="has-sub"><a href="{html.escape(href)}"{attrs}>{html.escape(it["t"])}</a><button class="sub-toggle" aria-label="Toggle {html.escape(it["t"])} submenu"></button><ul class="sub sub-{depth+1}">{render_menu(it["c"], depth+1)}</ul></li>'
        else:
            h += f'<li><a href="{html.escape(href)}"{attrs}>{html.escape(it["t"])}</a></li>'
    return h

MENU_HTML = render_menu(menu)

TICKER = 'Placement 2025 : TCS-5 | Wipro-3 | Infosys-8 | KGiSL-2 | Tech Mahindra-2 | Zoho-1 | Deloitte-1 | Steel Strip Wheels India-6 | Natesan-1 | PSA AVTEC-1 | LGB-1 | ZF Rane-6 | Danfoss-3 | Sutherland-2 | Vintroix-1 | KYB-30 | Quality Kiosk-1| HRH Next-41 | Skyraan-4 | Foxconn-9 | IVA Technos-11'

def shell(title, body, home=False, desc=''):
    t = html.escape(title)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t}</title>
<meta name="description" content="{html.escape(desc or 'Pollachi Institute of Engineering and Technology (PIE Tech), Pollachi - engineering college managed by Hayagreeva Educational and Charitable Trust.')}">
<link rel="icon" href="images/slider/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/site.css">
</head>
<body class="{'home' if home else 'inner'}">
<a class="skip" href="#main">Skip to content</a>
<div class="topbar"><div class="wrap">
 <div class="ticker" aria-label="Placement 2025"><div class="ticker-track"><span>{html.escape(TICKER)}</span><span aria-hidden="true">{html.escape(TICKER)}</span></div></div>
 <div class="toplinks"><a href="tel:+918438940273">Call Us (Admission) +91 8438940273, 9342224893</a><a href="https://forms.gle/SbP8aP95euqRNZfr5" target="_blank" rel="noopener">Admission</a><a href="http://www.pietech.edu.in/webmail" target="_blank" rel="noopener">Webmail</a></div>
</div></div>
<header class="site-header" id="top"><div class="wrap head-row">
 <a class="brand" href="index.html" aria-label="PIE Tech home"><img src="images/slider/logo.png" alt="Pollachi Institute of Engineering and Technology"></a>
 <div class="head-badges"><a href="https://forms.gle/SbP8aP95euqRNZfr5" target="_blank" rel="noopener" class="btn btn-apply">Online Admission Form</a></div>
 <button class="menu-btn" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
</div>
<nav class="main-nav" aria-label="Main navigation"><div class="wrap"><ul class="menu"><li><a href="index.html">Home</a></li>{MENU_HTML}</ul></div></nav>
</header>
{body}
{FOOTER}
<button class="to-top" aria-label="Back to top">↑</button>
<script src="assets/js/site.js" defer></script>
<script src="assets/js/chat.js" defer></script>
</body></html>'''

FOOTER = '''<footer class="site-footer"><div class="wrap foot-grid">
<div><h4>Quick Links</h4><ul><li><a href="college.html">About Us</a></li><li><a href="students-center.html">Students</a></li><li><a href="admissions.html">Admissions</a></li><li><a href="https://www.pietech.edu.in/doc/Help%20Desk.pdf" target="_blank" rel="noopener">Help Desk</a></li><li><a href="placementcell.html">Placement</a></li><li><a href="http://www.pietech.edu.in/webmail" target="_blank" rel="noopener">Web Mail</a></li></ul></div>
<div><h4>Information</h4><ul><li><a href="scholarships.html">Scholarships</a></li><li><a href="campus-life.html">Campus Life</a></li><li><a href="jobs.html">Jobs</a></li><li><a href="gallery.html">Photo Gallery</a></li><li><a href="emergency.html">Emergency Contact</a></li></ul></div>
<div><h4>&nbsp;</h4><ul><li><a href="https://www.pietech.edu.in/doc/Acadimic%20calender%202021-2022odd.pdf" target="_blank" rel="noopener">Academic Calendar</a></li><li><a href="contact.html">Suggestion Box</a></li><li><a href="library.html">Library</a></li><li><a href="registration.html">Grievance Registration Portal</a></li><li><a href="internal-compliants.html">Internal Complaints Committee</a></li></ul></div>
<div><h4>Contact Us</h4><p>Pollachi Institute of Engineering and Technology<br>PIE Tech Campus, 107/1B, Main Road,<br>Poosaripatti,<br>Pollachi-642 205<br>Coimbatore District.</p><p>Phone: <a href="tel:+918438940273">+91-8438940273</a><br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="tel:+919342224893">+91-9342224893</a></p><p>Enquiry: <a href="mailto:dean@pietech.edu.in">dean@pietech.edu.in</a><br>Career: <a href="mailto:dean@pietech.edu.in">dean@pietech.edu.in</a><br>Principal: <a href="mailto:principal@pietech.edu.in">principal@pietech.edu.in</a></p></div>
</div>
<div class="foot-bottom"><div class="wrap">&copy; Pollachi Institute of Engineering and Technology. All rights reserved<span class="foot-icons"><a href="anti-ragging.html"><img src="images/slider/anti-ragging.jpg" alt="Anti-Ragging"></a><a href="https://www.facebook.com/pieTechn/" target="_blank" rel="noopener" aria-label="Facebook">f</a></span></div></div></footer>'''


# ---------------- inner pages ----------------
def build_fallback(fname, soup):
    ft = soup.find('div', class_='footer_bg')
    if not ft:
        return None
    parts = []
    for sib in ft.find_previous_siblings():
        if sib.name != 'div' or sib.find('nav') or sib.find('iframe') or sib.find(class_='fwslider'):
            break
        parts.append(sib)
    parts.reverse()
    t = soup.title.get_text(' ', strip=True) if soup.title else fname
    t = re.sub(r'\s*\|.*$', '', t).strip()
    ttl = soup.find(['h2', 'h3'], class_=re.compile('style|title'))
    box = BeautifulSoup('<div class="legacy"></div>', 'html.parser').div
    for p_ in parts: box.append(p_.extract())
    clean_fragment(box)
    h = box.find(['h2', 'h3'])
    title = (h.get_text(' ', strip=True) if h else '') or t
    inner = re.sub(r'(<br\\s*/?>\\s*){3,}', '<br/>', str(box))
    body = f'''<main id="main"><section class="page-hero"><div class="wrap"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>{html.escape(title)}</li></ol><h1>{html.escape(title)}</h1></div></section>
<section class="page-body"><div class="wrap">{inner}</div></section></main>'''
    return title, body

def build_inner(fname, raw):
    soup = BeautifulSoup(raw, 'html.parser')
    mb = soup.find('div', class_='main_bg')
    if not mb:
        return build_fallback(fname, soup)
    h3 = mb.find('h3')
    title = h3.get_text(' ', strip=True) if h3 else ''
    crumbs = [(li.get_text(' ', strip=True), fix_href(li.a.get('href')) if li.a else None) for li in mb.select('ol.breadcrumb li')]
    crumb_html = ''
    for i, (t, h) in enumerate(crumbs):
        crumb_html += f'<li><a href="{h}">{html.escape(t)}</a></li>' if h and h is not False and i < len(crumbs) - 1 else f'<li>{html.escape(t)}</li>'
    parts = []
    for sib in mb.find_next_siblings():
        if sib.name == 'div' and any(c in (sib.get('class') or []) for c in ('footer_bg', 'footer1_bg')):
            break
        if sib.name == 'div':
            parts.append(sib)
    frag = BeautifulSoup('<div class="legacy"></div>', 'html.parser')
    box = frag.div
    for p_ in parts:
        box.append(p_.extract())
    clean_fragment(box)
    inner = str(box)
    inner = re.sub(r'(<br\s*/?>\s*){3,}', '<br/>', inner)
    body = f'''<main id="main">
<section class="page-hero"><div class="wrap"><ol class="crumbs">{crumb_html}</ol><h1>{html.escape(title)}</h1></div></section>
<section class="page-body"><div class="wrap">{inner}</div></section></main>'''
    return title or fname, body

out_pages = {}
for f, raw in sorted(pages.items()):
    if f in ('index.php', 'gallery.php_id_1'):
        continue
    r = build_inner(f, raw)
    if r:
        out_pages[exact[f]] = r

# ---------------- home ----------------
SLIDES = ['slide-1.png','KYB.jpg','Placement.jpg','Steel.jpg','Slide-53.JPG','Slide-54.JPG','Slide-55.JPG','Slide-56.JPG','Slide-57.JPG','slide-11.png','slide-12.png','slide-13.png','slide-14.png','slide-16.png','slide-17.png','slide-18.png','slide-19.png','slide-20.png','slide-21.png']
NEWS = [l.strip() for l in '''18.09.2026 : One-Day Workshop on “GREEN HYDROGEN TECHNOLOGY: Electrolysis, Storage and PEM Fuel Cell Applications
27.05.2026 : Guest Lecture on “Cybersecurity & Ethical Hacking for a safer Digital world”
25.08.2026 : Guest Lecture on “Code Today, Lead Tomorrow”
14.08.2026 : Guest Lecture on “Next Gen Privacy Mitigations: Differential Privacy in Federated Learning”
01.08.2026 : Computer Stream Association Inauguration
30.07.2026 : Inauguration of Tamil Mandram Club
23.07.2026 : Industry 4.0 Skills for Mechanical Engineering Student
18.07.2026 : Alumni Talk-Campus to Career
10.04.2026 : Project Expo" Tech Nova-2026"
28.03.2026 : Graduation Day
26.03.2026 : 14TH ANNUAL, SPORTS AND PLACEMENT DAY
23.03.2026 : Award Day
05.03.2026 : Women's Day Celebrations
18.02.2026 : Webinar on Current Status of BIM Adoption in India
11.02.2026 : Seminar on Explainable Artificial Intelligence
06.02.2026 : Alumni Interaction
03.02.2026 : Guest Lecture
15.09.2025 : CSE Alumni Talk
09.09.2025 : Electrical Science Association Inauguration
02.09.2025 : Seminar on Generative AI-Redefining Creativity with Technology
01.09.2025 : AI&DS and CSE Association Inauguration
25.08.2025 : First Year Inauguration Programme-2025
15.07.2025 : Space Tutor of ISRO
25.04.2025 : Protecting Intellectual Property Rights and IP Management for Startups
21.04.2025 : World Creativity and Innovation Day
29.03.2025 : Alumni Talk-Campus to Career
21.03.2025 : 13th Annual,Sports & Placement Day
18.03.2025 : WEBINAR ON THE SCIENCE BEHIND DATA SCIENCE
12.03.2025 : Alumni Interaction
07.03.2025 : International Women's day'''.split('\n')]
COURSES = [('pietech-ai.html','B.Tech Artificial Intelligence and Data Science','AI'),('pietech-it.html','B.Tech Information Technology','IT'),('pietech-civil.html','B.E Civil Engineering','CE'),('pietech-cse.html','B.E Computer Science and Engineering','CSE'),('pietech-eee.html','B.E Electrical and Electronics Engineering','EEE'),('pietech-ece.html','B.E Electronics and Communication Engineering','ECE'),('pietech-mechanical.html','B.E Mechanical Engineering','ME')]
E_ = html.escape

def home_body():
    slides = ''.join(f'<div class="slide{" active" if i==0 else ""}"><img class="slide-bg" src="images/slider/{s}" alt="" aria-hidden="true" loading="{"eager" if i==0 else "lazy"}"><img class="slide-img" src="images/slider/{s}" alt="PIE Tech slide {i+1}" loading="{"eager" if i==0 else "lazy"}"></div>' for i, s in enumerate(SLIDES))
    news = ''.join(f'<li><a href="news-events.html"><span class="nd">{E_(n.split(" : ",1)[0])}</span>{E_(n.split(" : ",1)[1])}</a></li>' for n in NEWS)
    courses = ''.join(f'<a class="course-card" href="{h}"><span class="badge">{b}</span><span class="cn">{E_(t)}</span><span class="go">View department &rarr;</span></a>' for h, t, b in COURSES)
    recs = ''.join(f'<img src="images/recruiters/{i:02d}.png" alt="Recruiter {i}" loading="lazy">' for i in range(1, 26))
    gal = ''.join(f'<a href="gallery.html" class="g-item"><img src="images/slider/Slide-{52+i}.JPG" alt="PIE Tech gallery {i}" loading="lazy"></a>' for i in range(1, 5))
    return f'''<main id="main">
<section class="hero" aria-roledescription="carousel" aria-label="PIE Tech highlights">
 <div class="slides">{slides}</div>
 <button class="hero-nav prev" aria-label="Previous slide">&#8249;</button><button class="hero-nav next" aria-label="Next slide">&#8250;</button>
 <div class="hero-dots" role="tablist"></div><div class="hero-progress"><span></span></div>
</section>
<section class="quick"><div class="wrap quick-grid">
 <a href="https://forms.gle/SbP8aP95euqRNZfr5" target="_blank" rel="noopener"><b>Online Admission Form</b><span>Apply now</span></a>
 <a href="courses.html"><b>Engineering Courses</b><span>Programmes offered</span></a>
 <a href="placementcell.html"><b>Placement</b><span>Placement Cell &amp; records</span></a>
 <a href="scholarships.html"><b>Scholarships</b><span>For Diploma &amp; +2 students</span></a>
</div></section>
<section class="sec welcome"><div class="wrap two">
 <div class="reveal"><span class="kicker">Welcome</span><h2>Welcome To Hayagreeva Educational and Charitable Trust</h2>
 <p>Pollachi Institute of Engineering and Technology (PIE Tech) is a premier educational institution managed by Hayagreeva Educational and Charitable Trust. The Trust manages one more institution namely Pollachi College of Arts and Science(PCAS). <a class="more" href="college-trust.html">Read more</a></p>
 <p>Pollachi Institute of Engineering &amp; Technology (PIE Tech) was established in 2012 with a mission of providing competent technical education and creating proficient engineers who will add newer dimensions to the technical arena and thereby serve the need of the Indian Society as a whole. Its commitment is best encapsulated in its vision to become a globally recognized institute of engineering. <a class="more" href="college.html">Read more</a></p></div>
 <div class="stats reveal"><div><b data-count="2012" data-plain>2012</b><span>Established</span></div><div><b data-count="7">7</b><span>Engineering courses</span></div><div><b data-count="25">25</b><span>Recruiter logos</span></div></div>
</div></section>
<section class="sec vmf"><div class="wrap cards3">
 <article class="vcard reveal"><img src="images/icons/vision.png" alt=""><h3>Vision</h3><p>To produce technically sound, competent and value based graduates to face the challenges of the world and contribute towards the development of the society and growth of our Nation.</p><a class="more" href="vision-mission.html">view more</a></article>
 <article class="vcard reveal"><img src="images/icons/mission.png" alt=""><h3>Mission</h3><p>To impart value based education in Science and Engineering and enhance a higher form of education by adopting the best teaching-learning process equipped with the latest facilities.</p><a class="more" href="mission.html">view more</a></article>
 <article class="vcard reveal"><img src="images/icons/faculty.png" alt=""><h3>Faculty</h3><p>At PIE Tech, we have Faculty members, who are good, inspired and motivated teachers, who understand their importance in shaping the future of students. They seek new innovative approaches of instruction and inculcate involvement, participation and team work among students to create an environment conducive for learning.</p><a class="more" href="faculty-name-list.html">view more</a></article>
 <article class="vcard reveal"><img src="images/icons/scholarship.png" alt=""><h3>Scholarships</h3><p>It is the culture of PIE Tech to award and encourage students with good academic records. PIE Tech provides unlimited scholarships for Diploma &amp; +2 students based on their academic performance.</p><a class="more" href="scholarships.html">view more</a></article>
</div></section>
<section class="sec news"><div class="wrap news-grid">
 <div class="panel reveal"><div class="tabs" role="tablist"><button class="tab active" data-tab="t1" role="tab">Latest News</button><button class="tab" data-tab="t2" role="tab">Career @ PIE Tech</button></div>
  <div class="tabpane active" id="t1"><ul class="newslist">{news}</ul></div>
  <div class="tabpane" id="t2"><p>PIE Tech is rapidly expanding. Please send your resumes to Principal</p><p>Principal<br>Email - <a href="mailto:principal@pietech.edu.in">principal@pietech.edu.in</a></p><p>Pollachi Institute Of Engineering and Technology<br>107/1B, Main Road,<br>Poosaripatti,<br>Pollachi-642205<br>Coimbatore District</p><p>Phone : 91-4259-266966<br>mobile : 91-96882 45777,<br>91-96884 45777</p></div></div>
 <aside class="panel dl reveal"><h3>Admissions</h3><ul>
  <li><a href="https://forms.gle/SbP8aP95euqRNZfr5" target="_blank" rel="noopener">Online Admission Form</a></li>
  <li><a href="https://www.pietech.edu.in/doc/Broucher/Broucher.pdf" target="_blank" rel="noopener">Download Brouchers</a></li>
  <li><a href="what-we-offer.html">What we offer</a></li><li><a href="facilities.html">Facilities</a></li><li><a href="audit-statement.html">Audit Statement</a></li>
  <li><a href="https://www.pietech.edu.in/doc/AICTE/AICTE2025.PDF" target="_blank" rel="noopener">AICTE Approved Order</a></li>
  <li><a href="https://www.pietech.edu.in/doc/Mandatory%20Disclosure/Mandatory%20Disclosure%202026.pdf" target="_blank" rel="noopener">Mandatory Disclosure</a></li>
  <li><a href="https://www.pietech.edu.in/doc/Grievances%20Redressal%20cell.pdf" target="_blank" rel="noopener">Grievances Redressal Cell</a></li></ul></aside>
</div></section>
<section class="sec courses"><div class="wrap"><div class="head"><span class="kicker">Engineering</span><h2>Engineering Courses</h2></div><div class="course-grid">{courses}</div></div></section>
<section class="sec gallery"><div class="wrap"><div class="head"><span class="kicker">Moments</span><h2>Our Gallery</h2></div><div class="g-grid">{gal}</div><p class="center"><a class="btn" href="gallery.html">View Photo Gallery</a></p></div></section>
<section class="sec life"><div class="wrap two">
 <a class="feature reveal" href="campus-life.html"><img src="images/slider/life-pie-tech.png" alt="Life @ PIE Tech" loading="lazy"></a>
 <a class="feature reveal" href="newsletter.html"><img src="images/slider/e-newsletter.jpg" alt="PIE Tech e-newsletter" loading="lazy"></a>
</div></section>
<section class="sec recruiters"><div class="wrap"><div class="head"><span class="kicker">Placement</span><h2>Our Recruiters</h2></div></div><div class="logos"><div class="logo-track">{recs}{recs}</div></div></section>
</main>'''

# ---------------- gallery ----------------
GAL = ['Slide-53.JPG','Slide-54.JPG','Slide-55.JPG','Slide-56.JPG','Slide-57.JPG','KYB.jpg','Placement.jpg','Steel.jpg','slide-1.png','slide-11.png','slide-12.png','slide-13.png','slide-14.png','slide-16.png','slide-17.png','slide-18.png','slide-19.png','slide-20.png','slide-21.png']
def gallery_body():
    items = ''.join(f'<a class="gi" href="images/slider/{g}"><img src="images/slider/{g}" alt="PIE Tech photo {i+1}" loading="lazy"></a>' for i, g in enumerate(GAL))
    return f'''<main id="main"><section class="page-hero"><div class="wrap"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>Photo Gallery</li></ol><h1>Photo Gallery</h1></div></section>
<section class="page-body"><div class="wrap"><div class="masonry">{items}</div></div></section></main>'''

# ---------------- write ----------------
def write(name, content):
    with open(f'{OUT}/{name}', 'w', encoding='utf-8') as fh:
        fh.write(content)

os.makedirs(f'{OUT}/assets/css', exist_ok=True); os.makedirs(f'{OUT}/assets/js', exist_ok=True)
write('index.html', shell('Welcome to PIE Tech | Pollachi Institute of Engineering and Technology', home_body(), home=True))
out_pages['gallery.html'] = ('Photo Gallery', gallery_body())
for name, (t, b) in out_pages.items():
    write(name, shell(f'{t} | PIE Tech', b))

# images: copy originals; downscale only oversized photos (same photograph, smaller file)
from PIL import Image
shutil.copytree(f'{SRC}/img', f'{OUT}/images', dirs_exist_ok=True)
for root, _, files in os.walk(f'{OUT}/images'):
    for fn in files:
        p = os.path.join(root, fn)
        if fn.lower().endswith(('.jpg', '.jpeg')) and os.path.getsize(p) > 1_500_000:
            im = Image.open(p)
            if im.width > 2400:
                im = im.convert('RGB'); im.thumbnail((2400, 2400), Image.LANCZOS)
            im.save(p, quality=86, optimize=True, progressive=True)
print('pages', len(out_pages) + 1)
