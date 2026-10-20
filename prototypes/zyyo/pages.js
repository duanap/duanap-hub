// Local list, album, and article interactions. Data is bundled in data.js.
(() => {
  const page=document.body.dataset.page;
  const data=window.REPLICA_DATA||{posts:[],circle:[]};
  const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  document.querySelectorAll('header nav[aria-label="Main navigation"] a').forEach(link=>{
    if(new URL(link.href).pathname===location.pathname)link.setAttribute('aria-current','page');
  });
  const empty=document.createElement('p');empty.className='replica-empty';empty.textContent='No results found.';
  if(page==='blog'){
    const input=document.querySelector('[aria-label="Search articles"]');
    const list=document.querySelector('[data-post-list]');
    const original=list.innerHTML;
    list.after(empty);empty.hidden=true;
    input.addEventListener('input',()=>{
      const query=input.value.trim().toLocaleLowerCase();
      if(!query){list.innerHTML=original;empty.hidden=true;return;}
      const posts=data.posts.filter(post=>[post.title,post.description,...post.tags].join(' ').toLocaleLowerCase().includes(query));
      list.innerHTML=posts.map(post=>post.card).join('');empty.hidden=posts.length>0;
    });
  }
  if(page==='notes'){
    const cards=[...document.querySelectorAll('[data-note-index]')];
    const container=cards[0].parentElement;
    const input=document.querySelector('input[placeholder="Search notes…"]');
    const buttons=[...document.querySelectorAll('button')];
    const byTime=buttons.find(b=>b.textContent==='By Time'),random=buttons.find(b=>b.textContent==='Random');
    const active=byTime.className,inactive=random.className;
    container.after(empty);empty.hidden=true;
    input.addEventListener('input',()=>{
      const query=input.value.toLocaleLowerCase();let visible=0;
      cards.forEach(card=>{card.hidden=!card.textContent.toLocaleLowerCase().includes(query);if(!card.hidden)visible++;});empty.hidden=visible>0;
    });
    byTime.onclick=()=>{cards.forEach(card=>container.append(card));byTime.className=active;random.className=inactive;};
    random.onclick=()=>{
      const shuffled=[...cards];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      shuffled.forEach(card=>container.append(card));random.className=active;byTime.className=inactive;
    };
    cards.forEach(card=>{
      const button=[...card.querySelectorAll('button')].find(b=>b.textContent==='Expand');if(!button)return;
      button.setAttribute('aria-expanded','false');
      button.onclick=()=>{const expanded=button.getAttribute('aria-expanded')==='true';card.querySelector('p').classList.toggle('line-clamp-[5]',expanded);button.textContent=expanded?'Expand':'Collapse';button.setAttribute('aria-expanded',String(!expanded));};
    });
  }
  const lightbox=document.createElement('dialog');
  lightbox.className='replica-lightbox';lightbox.setAttribute('aria-label','Photo preview');
  lightbox.innerHTML='<button type="button" class="photo-close" aria-label="Close photo">×</button><button type="button" class="photo-prev" aria-label="Previous photo">‹</button><img alt=""><button type="button" class="photo-next" aria-label="Next photo">›</button><span class="photo-counter"></span>';
  document.body.append(lightbox);
  let photos=[],photoIndex=0;
  function showPhoto(index){
    photoIndex=(index+photos.length)%photos.length;
    lightbox.querySelector('img').src=photos[photoIndex].src;
    lightbox.querySelector('img').alt=photos[photoIndex].alt||'Photo';
    lightbox.querySelector('.photo-counter').textContent=`${photoIndex+1} / ${photos.length}`;
    if(!lightbox.open)lightbox.showModal();
  }
  lightbox.querySelector('.photo-close').onclick=()=>lightbox.close();
  lightbox.querySelector('.photo-prev').onclick=()=>showPhoto(photoIndex-1);
  lightbox.querySelector('.photo-next').onclick=()=>showPhoto(photoIndex+1);
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close();});
  lightbox.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')showPhoto(photoIndex-1);if(event.key==='ArrowRight')showPhoto(photoIndex+1);});
  if(page==='photos'){
    const buttons=[...document.querySelectorAll('[data-album]')];
    const albumGrid=buttons[0].parentElement;
    const view=document.createElement('section');view.className='replica-album';view.hidden=true;albumGrid.after(view);
    const albumMap=new Map(buttons.map(button=>[button.dataset.album,button]));
    function showAlbums(){view.hidden=true;albumGrid.hidden=false;}
    function showAlbum(key){
      const button=albumMap.get(key);if(!button){showAlbums();return;}
      const name=button.getAttribute('aria-label').replace('Open album ','');
      const images=[...button.querySelectorAll('img')].map(image=>({src:image.getAttribute('src'),alt:name}));
      view.innerHTML=`<div class="replica-album-heading"><button type="button" class="card replica-back">← Albums</button><h1>${escapeHTML(name)}</h1><span>${images.length} photos · 本地布局示例</span></div><div class="replica-photo-grid">${images.map((image,i)=>`<button type="button" aria-label="Open photo ${i+1}" data-photo="${i}"><img src="${escapeHTML(image.src)}" alt="${name} ${i+1}"></button>`).join('')}</div>`;
      view.querySelector('.replica-back').onclick=()=>{history.pushState(null,'',location.pathname);showAlbums();};
      view.querySelectorAll('[data-photo]').forEach(control=>control.onclick=()=>{photos=images;showPhoto(Number(control.dataset.photo));});
      albumGrid.hidden=true;view.hidden=false;
    }
    buttons.forEach(button=>button.onclick=()=>{history.pushState(null,'','#'+button.dataset.album);showAlbum(button.dataset.album);});
    addEventListener('popstate',()=>showAlbum(location.hash.slice(1)));
    if(location.hash)showAlbum(location.hash.slice(1));
  }
  if(page==='links'){
    const list=document.querySelector('[data-circle-list]');
    const input=document.querySelector('input[placeholder="Search posts…"]');
    const dateBar=input.parentElement.parentElement.nextElementSibling;
    const authorBar=input.parentElement.previousElementSibling;
    const dateButtons=[...dateBar.querySelectorAll('button')];
    const authorButtons=[...authorBar.querySelectorAll('button')];
    const selectedDate=dateButtons[0].className,otherDate=dateButtons[1].className;
    const selectedAuthor=authorButtons[0].className,otherAuthor=authorButtons[1].className;
    let dateIndex=0,authorIndex=0;
    const authors=authorButtons.map(button=>button.querySelector('span')?.textContent||'');
    const reference=Math.max(...data.circle.map(post=>Date.parse(post.date)));
    function inDate(post){const days=(reference-Date.parse(post.date))/86400000;return dateIndex===0?days<1:dateIndex===1?days>=1&&days<2:dateIndex===2?days>=2&&days<7:dateIndex===3?days>=7&&days<30:days>=30;}
    function render(){
      const query=input.value.toLocaleLowerCase();
      const posts=data.circle.filter(post=>inDate(post)&&(!authorIndex||post.author===authors[authorIndex])&&[post.title,post.summary,post.author].join(' ').toLocaleLowerCase().includes(query));
      list.innerHTML=posts.length?posts.map(post=>`<li><a href="${escapeHTML(post.link)}" target="_blank" rel="noopener noreferrer" class="group flex items-start gap-3.5 px-4 py-3 transition-colors hover:bg-(--hover-fill)"><img src="${escapeHTML(post.authorAvatar)}" alt="" class="mt-0.5 size-8 shrink-0 rounded-full object-cover"><div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><span class="truncate text-[11px] font-medium text-slate-400 dark:text-neutral-500">${escapeHTML(post.author)}</span><span class="text-[11px] text-slate-400">${new Date(post.date).toISOString().slice(5,10)}</span></div><h4 class="mt-0.5 font-medium leading-snug">${escapeHTML(post.title)}</h4><p class="mt-0.5 line-clamp-1 text-xs leading-relaxed text-slate-400">${escapeHTML(post.summary)}</p></div><span aria-hidden="true">↗</span></a></li>`).join(''):'<li class="replica-empty">No updates found.</li>';
      dateButtons.forEach((button,i)=>button.className=i===dateIndex?selectedDate:otherDate);
      authorButtons.forEach((button,i)=>button.className=i===authorIndex?selectedAuthor:otherAuthor);
    }
    dateButtons.forEach((button,i)=>button.onclick=()=>{dateIndex=i;render();});
    authorButtons.forEach((button,i)=>button.onclick=()=>{authorIndex=i;render();});
    input.addEventListener('input',render);
  }
  if(page==='about'||page==='article'){
    document.querySelectorAll('article img').forEach(image=>image.addEventListener('click',()=>{photos=[{src:image.src,alt:image.alt}];showPhoto(0);}));
    document.querySelectorAll('article pre').forEach(pre=>{
      const button=document.createElement('button');button.type='button';button.className='replica-copy';button.textContent='Copy';
      button.onclick=async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.textContent||pre.textContent);button.textContent='Copied';}catch{button.textContent='Select to copy';}setTimeout(()=>button.textContent='Copy',1500);};pre.append(button);
    });
    const headings=[...document.querySelectorAll('article h2[id],article h3[id]')];
    if(headings.length){
      const links=[...document.querySelectorAll('[aria-label="Table of contents"] a')];
      const observer=new IntersectionObserver(entries=>{
        const visible=entries.find(entry=>entry.isIntersecting);if(!visible)return;
        links.forEach(link=>link.classList.toggle('replica-toc-active',decodeURIComponent(link.hash.slice(1))===visible.target.id));
      },{rootMargin:'-5% 0px -65% 0px'});headings.forEach(heading=>observer.observe(heading));
    }
    document.querySelectorAll('button').forEach(button=>{
      const label=(button.getAttribute('aria-label')||button.textContent).trim();
      if(label==='TOP'||label.includes('Back to top'))button.onclick=()=>scrollTo({top:0,behavior:'smooth'});
      if(label.includes('分享'))button.onclick=async()=>{try{await navigator.clipboard.writeText(location.href);button.title='链接已复制';}catch{button.title=location.href;}};
    });
  }
})();
