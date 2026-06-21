const chapters = [
  { title: 'Home', file: null, isHome: true },
  { title: 'Chapter 1', file: 'chapters/chapter-1.md' },
  { title: 'Chapter 2', file: 'chapters/chapter-2.md' },
  { title: 'Chapter 3', file: 'chapters/chapter-3.md' },
  { title: 'Chapter 4', file: 'chapters/chapter-4.md' },
  { title: 'Chapter 5', file: 'chapters/chapter-5.md' }
];

const nav = document.getElementById('chapters-nav');
const content = document.getElementById('content');

function buildNav(){
  nav.innerHTML = '';
  chapters.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.textContent = c.title;
    btn.onclick = () => loadChapter(idx);
    btn.id = 'chap-'+idx;
    nav.appendChild(btn);
  });

  // build/update vertical left nav
  let vnav = document.getElementById('vertical-nav');
  if(!vnav){
    vnav = document.createElement('div');
    vnav.id = 'vertical-nav';
    document.body.appendChild(vnav);
  }
  vnav.innerHTML = '';
  chapters.forEach((c, idx) => {
    const vt = document.createElement('button');
    vt.className = 'vtab';
    vt.id = 'vchap-'+idx;
    vt.setAttribute('aria-label', c.title);
    // small icon / badge with initials or number
    const icon = document.createElement('span');
    icon.className = 'vicon';
    let short = '';
    const num = (c.title.match(/\d+/) || [null])[0];
    if(num) short = num; else short = c.title.trim().split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
    icon.textContent = short;
    const label = document.createElement('span');
    label.className = 'vlabel';
    label.textContent = c.title;
    vt.appendChild(icon);
    vt.appendChild(label);
    vt.onclick = () => loadChapter(idx);
    vnav.appendChild(vt);
  });
}

async function loadChapter(idx){
  const chapter = chapters[idx];
  if(!chapter) return;
  // highlight active
  document.querySelectorAll('#chapters-nav button').forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById('chap-'+idx);
  if(btn) btn.classList.add('active');
  // vertical nav active state
  document.querySelectorAll('#vertical-nav .vtab').forEach(b=>b.classList.remove('active'));
  const vbtn = document.getElementById('vchap-'+idx);
  if(vbtn) vbtn.classList.add('active');

  try{
    if(chapter.isHome){
      renderHome();
      history.pushState({idx}, '', `#home`);
    } else {
      const res = await fetch(chapter.file);
      if(!res.ok) throw new Error('Not found');
      const md = await res.text();
      const html = marked.parse(md);
      content.innerHTML = html;
      document.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
      history.pushState({idx}, '', `#${idx}`);
    }
  }catch(err){
    if(chapter && chapter.isHome){
      content.innerHTML = `<div class="book-page"><h1>${chapter.title}</h1><p class="loading">Home content unavailable.</p></div>`;
    } else {
      content.innerHTML = `<div class="book-page"><h1>${chapter.title}</h1><p class="loading">Chapter file not found. Create ${chapter.file}</p></div>`;
    }
  }
}

function renderHome(){
  content.innerHTML = `
    <section class="home-hero">
      <h1 class="home-main">Learn Agentic Systems</h1>
      <p class="lead disclaimer">All contents are written in Markdown, so you may see some alignment or formatting issues in the rendered pages. Please bear with minor visual glitches — they are not significant. If you have feedback, use the form below.</p>

      <button class="home-cta" id="explore-btn">Explore Chapters</button>

      <div class="home-card feedback-area">
        <h3 style="margin:0 0 8px 0">Feedback</h3>
        <p style="margin:0 0 12px 0;color:var(--muted)">Have suggestions? Send quick feedback below.</p>
        <form id="feedback-form">
          <textarea id="feedback-input" placeholder="Share feedbacks" rows="6"></textarea>
          <div style="display:flex;justify-content:flex-end"><button id="feedback-send" type="button">Send feedback</button></div>
        </form>
      </div>
    </section>
  `;

  // wire up feedback button to open mail client with prefilled address
  const btn = document.getElementById('feedback-send');
  btn.addEventListener('click', ()=>{
    const val = document.getElementById('feedback-input').value || '(no message)';
    const subject = encodeURIComponent('Feedback: AgenticWeb');
    const body = encodeURIComponent(val + '\n\n--\nFrom AgenticWeb home form');
    window.location.href = `mailto:virus.trox@gmail.com?subject=${subject}&body=${body}`;
  });
  // Explore button goes to first real chapter
  const explore = document.getElementById('explore-btn');
  explore.addEventListener('click', ()=>{
    // load Chapter 1 (index 1 in chapters array)
    loadChapter(1);
  });
}

window.addEventListener('popstate', (e)=>{
  const idx = e.state?.idx ?? (location.hash ? parseInt(location.hash.replace('#',''))-1 : 0);
  loadChapter(idx);
});

// init
buildNav();
const startHash = location.hash ? location.hash.replace('#','') : '';
let startIdx = 0;
if(startHash === 'home') startIdx = 0;
else if(startHash && !isNaN(Number(startHash))) startIdx = Number(startHash);
loadChapter(startIdx >=0 ? startIdx : 0);

// Back-to-top behavior: initialize after DOM is ready and check initial scroll
document.addEventListener('DOMContentLoaded', () => {
  const backToTop = document.getElementById('back-to-top');
  if(!backToTop) return;
  const showThreshold = 150; // px — lower so it's visible on shorter pages

  const checkVisibility = () => {
    if(window.scrollY > showThreshold) backToTop.classList.add('show');
    else backToTop.classList.remove('show');
  };

  window.addEventListener('scroll', checkVisibility, {passive: true});
  // run once to set initial state
  checkVisibility();

  backToTop.addEventListener('click', () => {
    window.scrollTo({top: 0, behavior: 'smooth'});
  });
});

// --- Markers panel (right-side) with cookie storage ---
function loadMarkersFromCookie(){
  const name = 'agentic_markers=';
  const c = document.cookie.split('; ').find(x=>x.startsWith(name));
  if(!c) return [];
  try{ return JSON.parse(decodeURIComponent(c.split('=')[1])); }catch(e){ return []; }
}

function saveMarkersToCookie(arr){
  const v = encodeURIComponent(JSON.stringify(arr));
  // set cookie for 365 days
  document.cookie = `agentic_markers=${v};path=/;max-age=${60*60*24*365}`;
}

function initMarkers(){
  if(document.getElementById('marker-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'marker-panel';
  panel.innerHTML = `
    <h4>Notepad</h4>
    <div class="mp-controls">
      <textarea id="marker-notepad" placeholder="Notes are saved automatically..." rows="10"></textarea>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="small" id="marker-add-selection">Add selection</button>
      <button class="small" id="marker-clear">Clear</button>
    </div>
  `;
  document.body.appendChild(panel);

  const ta = panel.querySelector('#marker-notepad');
  const addSel = panel.querySelector('#marker-add-selection');
  const clearBtn = panel.querySelector('#marker-clear');

  function loadNotepad(){
    try{return localStorage.getItem('agentic_notepad') || ''}catch(e){return ''}
  }
  function saveNotepad(v){
    try{ localStorage.setItem('agentic_notepad', v); }catch(e){}
  }

  // populate
  ta.value = loadNotepad();

  // debounce autosave
  let saveTimer = null;
  ta.addEventListener('input', ()=>{
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{ saveNotepad(ta.value); saveTimer = null; }, 500);
  });

  addSel.addEventListener('click', ()=>{
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if(!sel) return alert('No selection found. Select text and try again.');
    // insert at cursor or append
    const start = ta.selectionStart || ta.value.length;
    const end = ta.selectionEnd || start;
    const before = ta.value.slice(0,start);
    const after = ta.value.slice(end);
    ta.value = before + sel.trim() + '\n' + after;
    // set caret after inserted text
    const pos = before.length + sel.trim().length + 1;
    ta.focus(); ta.setSelectionRange(pos,pos);
    saveNotepad(ta.value);
  });

  clearBtn.addEventListener('click', ()=>{
    if(!confirm('Clear all notes in the notepad?')) return;
    ta.value = '';
    saveNotepad('');
  });
}

document.addEventListener('DOMContentLoaded', initMarkers);