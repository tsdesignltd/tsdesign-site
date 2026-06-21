#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const USER_ID = '78511497002';
const USERNAME = 'tsdesignltd';
const PAGE_SIZE = 15;
const IMAGE_DIR = path.join(ROOT, 'assets/img/works-instagram');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const esc = value => String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const normalizeText = value => String(value || '').replace(/コニュニケーション/g, 'コミュニケーション');

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'x-ig-app-id': '936619743392459',
      'user-agent': USER_AGENT,
      'referer': 'https://www.instagram.com/' + USERNAME + '/'
    }
  });
  if (!res.ok) throw new Error('Instagram data fetch failed: ' + res.status + ' ' + res.statusText);
  return res.json();
}

async function fetchAllPosts() {
  const profileUrl = 'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + USERNAME;
  const profileData = await fetchJson(profileUrl);
  const profilePosts = profileData.data?.user?.edge_owner_to_timeline_media?.edges?.map(edge => edge.node) || [];

  try {
    const posts = [];
    let maxId = '';
    for (let page = 0; page < 10; page += 1) {
      const url = new URL('https://www.instagram.com/api/v1/feed/user/' + USER_ID + '/');
      url.searchParams.set('count', '50');
      if (maxId) url.searchParams.set('max_id', maxId);
      const data = await fetchJson(url.toString());
      if (Array.isArray(data.items)) posts.push(...data.items);
      if (!data.more_available || !data.next_max_id) break;
      maxId = data.next_max_id;
    }
    if (posts.length >= profilePosts.length) {
      return posts.filter(item => item && getCode(item) && !item.is_video);
    }
  } catch (error) {
    console.warn('Feed API unavailable. Using profile grid data instead.');
  }

  return profilePosts.filter(item => item && getCode(item) && !item.is_video);
}

function getCode(item) {
  return item.code || item.shortcode || '';
}

function getRawCaption(item) {
  return item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || '';
}

function getImageUrl(item) {
  return getImageUrls(item)[0] || '';
}

function getImageUrls(item) {
  const media = Array.isArray(item.carousel_media)
    ? item.carousel_media
    : item.edge_sidecar_to_children?.edges?.map(edge => edge.node).filter(Boolean) || [];
  const sources = media.length ? media : [item];
  return sources
    .map(source => {
      const candidates = source.image_versions2?.candidates || [];
      return candidates[0]?.url || source.display_url || '';
    })
    .filter(Boolean);
}

function isUrlText(value) {
  return /^https?:\/\//.test(String(value || '').trim());
}

function isRoleText(value) {
  return /(デザイン|設計|企画|モデリング|監修|製作|開発|検証|量産|外形|外観|意匠|基礎|機構|筐体|試作|製品)/.test(String(value || ''));
}

function parsePost(item, index) {
  const raw = getRawCaption(item);
  const lines = raw.split(/\n|・/).map(s => s.trim()).filter(Boolean);
  const title = normalizeText(lines[0] || 'Instagram Work ' + (index + 1));
  const yearMatch = raw.match(/(20\d{2}|19\d{2})年/);
  const urlLine = lines.find(isUrlText) || '';
  const candidates = lines
    .map(line => line.replace(/\s*(20\d{2}|19\d{2})年\s*/g, '').trim())
    .filter(Boolean)
    .filter(line => line !== title)
    .filter(line => !isUrlText(line))
    .filter(line => !isRoleText(line));
  const client = candidates.length ? candidates[candidates.length - 1] : '';
  const roles = lines.slice(1)
    .map(s => normalizeText(s.replace(/\s*(20\d{2}|19\d{2})年\s*/g, '').trim()))
    .filter(Boolean)
    .filter(s => s !== client)
    .filter(s => !isUrlText(s))
    .filter(s => !/^[A-Z0-9 ._-]+$/.test(s));
  return {
    index: index + 1,
    shortcode: getCode(item),
    imageUrl: getImageUrl(item),
    imageUrls: getImageUrls(item),
    imageFile: 'tsdesignltd-' + String(index + 1).padStart(2, '0') + '.jpg',
    imageFiles: getImageUrls(item).map((_, imageIndex) => (
      'tsdesignltd-' + String(index + 1).padStart(2, '0') + '-' + String(imageIndex + 1).padStart(2, '0') + '.jpg'
    )),
    detailFile: 'work-instagram-' + String(index + 1).padStart(2, '0') + '.html',
    title,
    year: yearMatch ? yearMatch[1] + '年' : '',
    client: normalizeText(client),
    url: urlLine,
    roles,
    caption: normalizeText(raw)
  };
}

async function downloadImage(url, file) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'referer': 'https://www.instagram.com/' }
  });
  if (!res.ok) throw new Error('Image download failed: ' + res.status + ' ' + res.statusText);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buffer);
}

function cardHtml(post) {
  const meta = [post.year, post.client].filter(Boolean).join('　') || 'WORKS';
  const roles = post.roles.length ? post.roles.join(' / ') : 'プロダクトデザイン';
  return '<a class="work-tile" href="' + post.detailFile + '" target="_blank" rel="noopener">\n' +
    '  <div class="work-image">\n' +
    '    <img src="assets/img/works-instagram/' + post.imageFile + '" alt="' + esc(post.title) + '">\n' +
    '  </div>\n' +
    '  <div class="work-content">\n' +
    '    <div class="work-meta">' + esc(meta) + '</div>\n' +
    '    <h2 class="work-title">' + esc(post.title) + '</h2>\n' +
    '    <div class="work-text">' + esc(roles) + '</div>\n' +
    '  </div>\n' +
    '</a>';
}

function renderDetailPage(post) {
  const meta = [post.year, post.client].filter(Boolean).join('　') || 'WORKS';
  const roles = post.roles.length ? post.roles : ['プロダクトデザイン'];
  const detailImages = post.imageFiles && post.imageFiles.length ? post.imageFiles : [post.imageFile];
  const gallery = detailImages.map((file, imageIndex) =>
    '<div class="detail-slide"><img src="assets/img/works-instagram/' + file + '" alt="' + esc(post.title) + (detailImages.length > 1 ? ' ' + (imageIndex + 1) : '') + '"></div>'
  ).join('\n');
  const galleryControls = detailImages.length > 1
    ? '<button class="detail-gallery-button prev" type="button" aria-label="前の画像">‹</button>\n' +
      '<button class="detail-gallery-button next" type="button" aria-label="次の画像">›</button>\n' +
      '<div class="detail-gallery-dots" aria-label="画像ページ">' +
      detailImages.map((_, imageIndex) => '<button type="button" aria-label="画像' + (imageIndex + 1) + '" ' + (imageIndex === 0 ? 'class="is-current"' : '') + '></button>').join('') +
      '</div>'
    : '';
  const roleSet = new Set(post.roles.map(role => normalizeText(role)));
  const titleText = normalizeText(post.title);
  const caption = post.caption
    .split(/\n+/)
    .map(line => normalizeText(line.trim().replace(/^・/, '')))
    .filter(Boolean)
    .filter(line => line !== titleText)
    .filter(line => !roleSet.has(line))
    .filter(line => line !== post.year)
    .filter(line => !(post.client && line === post.client))
    .filter(line => !(post.year && post.client && line === post.year + '　' + post.client))
    .filter(line => !isUrlText(line))
    .filter(line => !isRoleText(line))
    .map(line => '<p>' + esc(line) + '</p>')
    .concat(post.url ? ['<p><a href="' + esc(post.url) + '" target="_blank" rel="noopener">' + esc(post.url) + '</a></p>'] : [])
    .join('\n');
  return '<!DOCTYPE html>\n' +
`<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(post.title)} | TSDESIGN</title>
<link rel="stylesheet" href="assets/css/style.css">
<style>
body{margin:0;background:#f4f5f1;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#111815;}
.detail-wrap{max-width:1280px;margin:0 auto;padding:90px 32px 110px;}
.detail-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:54px;align-items:start;}
.detail-gallery{position:relative;background:#eef0eb;border-radius:28px;overflow:hidden;box-shadow:0 18px 52px rgba(0,0,0,.08);}
.detail-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;}
.detail-track::-webkit-scrollbar{display:none;}
.detail-slide{flex:0 0 100%;scroll-snap-align:start;}
.detail-slide img{width:100%;height:auto;display:block;}
.detail-gallery-button{position:absolute;top:50%;z-index:2;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.92);color:#111815;font-size:30px;line-height:1;box-shadow:0 8px 20px rgba(0,0,0,.12);cursor:pointer;transform:translateY(-50%);}
.detail-gallery-button.prev{left:14px;}
.detail-gallery-button.next{right:14px;}
.detail-gallery-dots{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;gap:8px;}
.detail-gallery-dots button{width:8px;height:8px;padding:0;border:0;border-radius:999px;background:rgba(255,255,255,.68);box-shadow:0 1px 5px rgba(0,0,0,.18);}
.detail-gallery-dots button.is-current{width:22px;background:#79bc3d;}
.detail-meta{color:#79bc3d;font-size:12px;font-weight:700;letter-spacing:.14em;margin:0 0 18px;}
.detail-title{font-size:clamp(27px,3.33vw,45px);line-height:1.18;letter-spacing:.03em;margin:0 0 26px;}
.detail-summary{background:#fff;border-radius:26px;padding:28px 30px;box-shadow:0 8px 28px rgba(0,0,0,.05);}
.detail-summary h2{font-size:18px;margin:0 0 14px;}
.detail-roles{margin:0 0 24px;padding:0;list-style:none;color:#5e645d;font-size:15px;line-height:1.9;}
.detail-roles li{margin:0 0 4px;}
.detail-roles li::before{content:"・";color:#ef6c00;margin-right:4px;}
.detail-caption{font-size:15px;line-height:1.9;color:#5e645d;}
.detail-caption p{margin:0 0 8px;}
.detail-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px;}
.detail-button{display:inline-flex;align-items:center;justify-content:center;min-width:150px;padding:12px 18px;border-radius:999px;border:1px solid #79bc3d;background:#79bc3d;color:#fff;font-size:13px;font-weight:700;letter-spacing:.08em;}
.detail-button.secondary{background:transparent;color:#79bc3d;}
@media(max-width:900px){.detail-wrap{padding:56px 20px 80px;}.detail-grid{grid-template-columns:1fr;gap:30px;}.detail-summary{padding:24px 20px;}}
</style>
</head>
<body>

<header class="site-header">
<div class="site-header__inner">
<a class="site-logo" href="index.html">
<img src="assets/img/logo.png" alt="TSDESIGN">
</a>

<button class="nav-toggle" type="button" aria-label="メニュー">
<span></span><span></span><span></span>
</button>

<nav class="site-nav">
<a href="about.html">ABOUT</a>
<a href="service.html">SERVICE</a>
<a href="works.html">WORKS</a>
<a href="flow.html">FLOW</a>
<a href="profile.html">PROFILE</a>
<a class="nav-contact" href="contact.html">CONTACT</a>
</nav>
</div>
</header>

<main class="detail-wrap">
<div class="detail-grid">
<div class="detail-gallery" data-gallery>
<div class="detail-track">
${gallery}
</div>
${galleryControls}
</div>
<div>
<p class="detail-meta">${esc(meta)}</p>
<h1 class="detail-title">${esc(post.title)}</h1>
<div class="detail-summary">
<h2>担当領域</h2>
<ul class="detail-roles">
${roles.map(role => '<li>' + esc(role) + '</li>').join('\n')}
</ul>
${caption ? `<div class="detail-caption">
${caption}
</div>` : ``}
<div class="detail-actions">
<a class="detail-button secondary" href="works.html">WORKS一覧</a>
<a class="detail-button" href="https://www.instagram.com/p/${post.shortcode}/" target="_blank" rel="noopener">Instagram</a>
</div>
</div>
</div>
</div>
</main>

<script>
document.addEventListener('DOMContentLoaded', function(){
  const btn=document.querySelector('.nav-toggle');
  const nav=document.querySelector('.site-nav');
  if(btn&&nav){
    btn.addEventListener('click',function(){
      btn.classList.toggle('is-open');
      nav.classList.toggle('is-open');
      document.body.classList.toggle('nav-open');
    });
    nav.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){
        btn.classList.remove('is-open');
        nav.classList.remove('is-open');
        document.body.classList.remove('nav-open');
      });
    });
  }
  document.querySelectorAll('[data-gallery]').forEach(function(gallery){
    const track=gallery.querySelector('.detail-track');
    const slides=Array.from(gallery.querySelectorAll('.detail-slide'));
    const dots=Array.from(gallery.querySelectorAll('.detail-gallery-dots button'));
    const prev=gallery.querySelector('.detail-gallery-button.prev');
    const next=gallery.querySelector('.detail-gallery-button.next');
    if(!track||slides.length<2) return;
    let current=0;
    function show(index){
      current=(index+slides.length)%slides.length;
      track.scrollTo({left:slides[current].offsetLeft,behavior:'smooth'});
      dots.forEach(function(dot,i){dot.classList.toggle('is-current',i===current);});
    }
    if(prev) prev.addEventListener('click',function(){show(current-1);});
    if(next) next.addEventListener('click',function(){show(current+1);});
    dots.forEach(function(dot,i){dot.addEventListener('click',function(){show(i);});});
    track.addEventListener('scroll',function(){
      const nextIndex=Math.round(track.scrollLeft/track.clientWidth);
      if(nextIndex!==current&&slides[nextIndex]){
        current=nextIndex;
        dots.forEach(function(dot,i){dot.classList.toggle('is-current',i===current);});
      }
    },{passive:true});
  });
});
</script>

</body>
</html>
`;
}

function pageName(pageNumber) {
  return pageNumber === 1 ? 'works.html' : 'works-' + pageNumber + '.html';
}

function paginationHtml(current, total) {
  if (total <= 1) return '';
  const links = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const cls = n === current ? ' class="is-current" aria-current="page"' : '';
    return '<a' + cls + ' href="' + pageName(n) + '">' + n + '</a>';
  }).join('');
  return '<nav class="works-pagination" aria-label="WORKS pages">' + links + '</nav>';
}

function renderPage(posts, current, total) {
  return '<!DOCTYPE html>\n' +
`<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WORKS | TSDESIGN</title>
<link rel="stylesheet" href="assets/css/style.css">
<style>
body{margin:0;background:#f4f5f1;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#111;}
.works-wrap{max-width:1280px;margin:0 auto;padding:90px 32px;}
.works-title{font-size:64px;line-height:1;margin:0 0 18px;letter-spacing:.03em;}
.works-lead{font-size:15px;line-height:1.9;color:#5e645d;margin:0 0 48px;max-width:760px;}
.works-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;}
.work-tile{display:block;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 6px 22px rgba(0,0,0,.045);transition:.25s ease;}
.work-tile:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.085);}
.work-image{background:#eef0eb;aspect-ratio:1/1;overflow:hidden;}
.work-image img{width:100%;height:100%;object-fit:cover;display:block;}
.work-content{padding:18px 18px 20px;}
.work-meta{color:#79bc3d;font-size:12px;font-weight:700;letter-spacing:.12em;margin-bottom:10px;}
.work-title{font-size:20px;line-height:1.35;margin:0 0 12px;}
.work-text{font-size:14px;line-height:1.8;color:#5e645d;}
.works-pagination{display:flex;justify-content:center;gap:10px;margin-top:46px;}
.works-pagination a{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:999px;background:#fff;border:1px solid #e3e6df;font-size:13px;font-weight:700;color:#5e645d;}
.works-pagination a.is-current{background:#79bc3d;border-color:#79bc3d;color:#fff;}
@media(max-width:1100px){.works-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
@media(max-width:720px){.works-wrap{padding:56px 20px;}.works-title{font-size:44px;}.works-lead{margin-bottom:32px;}.works-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px;}.work-content{padding:16px 14px 18px;}.work-title{font-size:18px;}.works-pagination{margin-top:34px;}}
</style>
</head>
<body>

<header class="site-header">
<div class="site-header__inner">
<a class="site-logo" href="index.html">
<img src="assets/img/logo.png" alt="TSDESIGN">
</a>

<button class="nav-toggle" type="button" aria-label="メニュー">
<span></span><span></span><span></span>
</button>

<nav class="site-nav">
<a href="about.html">ABOUT</a>
<a href="service.html">SERVICE</a>
<a href="works.html">WORKS</a>
<a href="flow.html">FLOW</a>
<a href="profile.html">PROFILE</a>
<a class="nav-contact" href="contact.html">CONTACT</a>
</nav>
</div>
</header>

<main class="works-wrap">
<h1 class="works-title">WORKS</h1>
<p class="works-lead">実際の業務事例。幅広い産業分野での経験があります。</p>

<div class="works-grid">
` + posts.map(cardHtml).join('\n\n') + `
</div>
` + paginationHtml(current, total) + `
</main>

<script>
document.addEventListener('DOMContentLoaded', function(){
  const btn=document.querySelector('.nav-toggle');
  const nav=document.querySelector('.site-nav');
  if(btn&&nav){
    btn.addEventListener('click',function(){
      btn.classList.toggle('is-open');
      nav.classList.toggle('is-open');
      document.body.classList.toggle('nav-open');
    });
    nav.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){
        btn.classList.remove('is-open');
        nav.classList.remove('is-open');
        document.body.classList.remove('nav-open');
      });
    });
  }
});
</script>

</body>
</html>
`;
}

function renderTopWorksSection(posts) {
  const tiles = posts.map(post =>
    '<a class="top-works-tile" href="' + post.detailFile + '" target="_blank" rel="noopener"><img src="assets/img/works-instagram/' + post.imageFile + '" alt=""></a>'
  ).join('\n      ');
  return '  <section class="section top-works" id="works">\n' +
    '    <div class="section-head">\n' +
    '      <h2>WORKS</h2>\n' +
    '      <p class="section-lead">実際の業務事例。幅広い産業分野での経験があります。</p>\n' +
    '    </div>\n' +
    '    <div class="top-works-grid" data-random-works>\n' +
    '      ' + tiles + '\n' +
    '    </div>\n' +
    '  </section>';
}

function updateIndexWorks(posts) {
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const html = fs.readFileSync(indexPath, 'utf8');
  const next = html.replace(/  <section class="section top-works" id="works">[\s\S]*?  <\/section>\n\n  <section class="section flow" id="flow">/, renderTopWorksSection(posts) + '\n\n  <section class="section flow" id="flow">');
  if (next !== html) fs.writeFileSync(indexPath, next);
}

async function main() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const rawPosts = await fetchAllPosts();
  const posts = rawPosts.map(parsePost).filter(post => post.imageUrl);
  if (!posts.length) throw new Error('No Instagram posts were found.');

  for (const post of posts) {
    await downloadImage(post.imageUrl, path.join(IMAGE_DIR, post.imageFile));
    for (let imageIndex = 0; imageIndex < post.imageUrls.length; imageIndex += 1) {
      await downloadImage(post.imageUrls[imageIndex], path.join(IMAGE_DIR, post.imageFiles[imageIndex]));
    }
  }

  for (const file of fs.readdirSync(ROOT)) {
    if (/^works-\d+\.html$/.test(file)) fs.unlinkSync(path.join(ROOT, file));
    if (/^work-instagram-\d+\.html$/.test(file)) fs.unlinkSync(path.join(ROOT, file));
  }

  const totalPages = Math.ceil(posts.length / PAGE_SIZE);
  for (let page = 1; page <= totalPages; page += 1) {
    const start = (page - 1) * PAGE_SIZE;
    const html = renderPage(posts.slice(start, start + PAGE_SIZE), page, totalPages);
    fs.writeFileSync(path.join(ROOT, pageName(page)), html);
  }

  for (const post of posts) {
    fs.writeFileSync(path.join(ROOT, post.detailFile), renderDetailPage(post));
  }
  updateIndexWorks(posts);

  console.log('WORKS updated: ' + posts.length + ' cards / ' + totalPages + ' page(s), with detail pages.');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
