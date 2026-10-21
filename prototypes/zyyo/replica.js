// Standalone browser code: no framework, build, account, or remote API needed.
(() => {
  const root = document.documentElement;
  const desktop = document.querySelector('.home-desktop');
  const board = document.querySelector('.home-board');
  const grid = document.querySelector('.home-grid-layout');
  const slots = [...(grid?.children || [])];
  const layout = [
    [0,0,6,4], [6,0,4,2], [6,2,2,2], [8,2,2,4], [0,4,2,3],
    [2,4,2,2], [4,4,2,2], [6,4,2,1], [6,5,2,1], [2,6,2,2],
    [4,6,4,2], [0,7,2,1], [8,6,2,2],
  ];
  const originalCards = slots.map(slot => slot.querySelector('.card'));
  function storedTheme() { try { return localStorage.getItem('zyyo-replica-theme'); } catch { return null; } }
  root.dataset.theme = storedTheme() === 'light' ? 'light' : 'dark';
  function toggleTheme() {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('zyyo-replica-theme', root.dataset.theme); } catch { /* file preview may deny storage */ }
  }
  // Match the reference's 10-column, eight-row board fitting rules.
  let queued = false;
  function fitBoard() {
    queued = false;
    if (!board) return;
    if (innerWidth < 1080) { root.style.setProperty('--site-scale', '1'); return; }
    const currentScale = parseFloat(root.style.getPropertyValue('--site-scale')) || 1;
    const padding = getComputedStyle(board);
    const availableWidth = board.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
    const top = board.getBoundingClientRect().top + scrollY;
    const availableHeight = innerHeight - top - 48 * currentScale;
    let gap = 20;
    let cell = (availableHeight - 7 * gap) / 8;
    if (cell < 64) { gap = 12; cell = (availableHeight - 7 * gap) / 8; }
    cell = Math.round(Math.max(44, Math.min(cell, ((Math.min(availableWidth,1600) - 9*gap)/10)/1.1)));
    const width = Math.round(Math.min(availableWidth,1600,10*cell*1.1+9*gap));
    const scale = Math.min(1.2,Math.max(.5,cell/84));
    root.style.setProperty('--site-scale', scale);
    root.style.setProperty('--cell-h', cell+'px');
    root.style.setProperty('--cell-gap', gap+'px');
    desktop.dataset.cell = cell < 56 ? 'tight' : cell < 72 ? 'compact' : 'comfort';
    grid.style.width = width+'px';
    grid.style.height = (8*cell+7*gap)+'px';
    const column = (width-9*gap)/10;
    slots.forEach((slot,index) => {
      const [x,y,w,h] = layout[index];
      slot.style.cssText = `position:absolute;transform:translate(${Math.round(x*(column+gap))}px,${Math.round(y*(cell+gap))}px);width:${Math.round(w*column+(w-1)*gap)}px;height:${Math.round(h*cell+(h-1)*gap)}px`;
    });
    if (Math.abs(currentScale-scale)>.006) scheduleFit();
  }
  function scheduleFit() { if (!queued) { queued = true; requestAnimationFrame(fitBoard); } }
  if (board) new ResizeObserver(scheduleFit).observe(board);
  addEventListener('resize', scheduleFit);
  fitBoard();
  document.querySelectorAll('.zyyo-dash').forEach(path => {
    const length = path.getTotalLength();
    path.style.setProperty('--len', length);
    path.style.setProperty('--lenneg', -length);
  });
  // Reference terminal is animated client content; keep the same compact typography.
  document.querySelectorAll('[aria-label="Console"] p').forEach(p => {
    const command = document.createElement('span');
    command.textContent = ' whoami\nzyyo — developer & writer\n\n$ echo "hello, world"';
    p.insertBefore(command,p.lastElementChild);
  });
  const numbers = ['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
  function updateClock() {
    const time = new Date().toLocaleTimeString('en-GB',{hour12:false});
    document.querySelectorAll('.now-display').forEach(display => {
      const digits = [...display.children].filter(e => e.children.length === 7);
      const value = time.replaceAll(':','').slice(0,digits.length);
      // Existing SSR segment order: top, middle, bottom, upper-left, upper-right, lower-left, lower-right.
      const order = [0,6,3,5,1,4,2];
      digits.forEach((digit,index) => [...digit.children].forEach((segment,s) => {
        const on = numbers[Number(value[index])][order[s]] === '1';
        segment.style.background = `var(--now-digit${on?'':'-off'})`;
        segment.style.boxShadow = on ? '0 0 3px var(--now-glow)' : 'none';
      }));
      const width = display.parentElement.clientWidth;
      const height = display.parentElement.clientHeight;
      display.style.transform = `scale(${Math.max(1,Math.min((width-48)/display.offsetWidth,(height-32)/28,4))})`;
      display.setAttribute('aria-label',time);
    });
  }
  updateClock();
  setInterval(updateClock,1000);
  document.querySelectorAll('[aria-label="Toggle theme"]').forEach(control => {
    control.tabIndex = 0;
    control.setAttribute('role','button');
    control.addEventListener('click',toggleTheme);
    control.addEventListener('keydown',event => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); toggleTheme(); } });
  });
  let toastTimer;
  function toast(text) {
    document.querySelector('.replica-toast')?.remove();
    clearTimeout(toastTimer);
    const node = document.createElement('div');
    node.className='replica-toast'; node.setAttribute('role','status'); node.textContent=text;
    document.body.append(node); toastTimer=setTimeout(()=>node.remove(),3500);
  }
  const menu = document.createElement('nav');
  menu.className='replica-menu'; menu.hidden=true; menu.setAttribute('aria-label','Mobile navigation');
  for (const [label,url] of [['Home','./index.html'],['Blog','./blog.html'],['Photos','./photos.html'],['Notes','./notes.html'],['Links','./links.html'],['About','./about.html']]) {
    const link=document.createElement('a');link.href=url;link.textContent=label;menu.append(link);
  }
  const themeButton=document.createElement('button');themeButton.textContent='Light / Dark';themeButton.type='button';themeButton.onclick=toggleTheme;menu.append(themeButton);
  document.body.append(menu);
  const menuButton=document.querySelector('[aria-label="Open menu"]');
  menuButton.onclick=()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));};
  document.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!menuButton.contains(event.target)){menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}});
  document.querySelector('[aria-label="Music player"]')?.setAttribute('inert','');
  const music=document.createElement('dialog');music.className='replica-dialog';music.setAttribute('aria-labelledby','local-music-title');
  music.innerHTML='<h2 id="local-music-title">Listen to some music</h2><p>HTML 布局预览 · 可选择本地音乐试听。</p><label>选择音乐<input type="file" accept="audio/*" hidden></label><button type="button">关闭</button><audio controls hidden></audio>';
  document.body.append(music);
  music.querySelector('button').onclick=()=>music.close();
  music.addEventListener('click',event=>{if(event.target===music)music.close();});
  const audio=music.querySelector('audio');let audioURL;
  music.querySelector('input').onchange=event=>{
    const file=event.target.files[0];if(!file)return;
    if(audioURL)URL.revokeObjectURL(audioURL);
    audioURL=URL.createObjectURL(file);audio.src=audioURL;audio.hidden=false;
    music.querySelector('p').textContent=file.name;
    audio.play().catch(()=>toast('点击播放按钮开始试听'));
  };
  document.querySelectorAll('[aria-label="Open music player"],[aria-label="打开播放器"],[aria-label="播放"]').forEach(button=>button.onclick=()=>music.showModal());
  document.querySelectorAll('[aria-label="Say something"]').forEach(button=>button.onclick=()=>toast('Hi, nice to meet you.'));
  document.querySelectorAll('[aria-label="Sponsor"]').forEach(button=>button.onclick=()=>toast('Thank you for stopping by ♡'));
  document.querySelectorAll('[aria-label="留言板"]').forEach(button=>button.onclick=()=>toast('留言服务未接入此 HTML 预览'));
  document.querySelectorAll('[role="link"]').forEach(link=>{
    const navigate=()=>{const anchor=link.querySelector('a');if(anchor)location.href=anchor.href;};
    link.addEventListener('click',navigate);
    link.addEventListener('keydown',event=>{if(event.key==='Enter')navigate();});
  });
  // Swap desktop cards without introducing a layout dependency.
  let dragging;
  originalCards.forEach(card=>{
    card.draggable=true;
    card.addEventListener('dragstart',event=>{
      if(event.target.closest('a,button,input,[role="button"]')){event.preventDefault();return;}
      dragging=card;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.dndId);card.classList.add('dragging');
    });
    card.addEventListener('dragover',event=>{if(dragging&&dragging!==card){event.preventDefault();card.classList.add('drop-target');}});
    card.addEventListener('dragleave',()=>card.classList.remove('drop-target'));
    card.addEventListener('drop',event=>{
      event.preventDefault();card.classList.remove('drop-target');
      if(!dragging||dragging===card)return;
      const marker=document.createComment('swap');dragging.replaceWith(marker);card.replaceWith(dragging);marker.replaceWith(card);
    });
    card.addEventListener('dragend',()=>{dragging=null;document.querySelectorAll('.dragging,.drop-target').forEach(e=>e.classList.remove('dragging','drop-target'));});
  });
  document.querySelectorAll('[aria-label="Reset layout"]').forEach(button=>button.onclick=()=>{originalCards.forEach((card,index)=>slots[index].prepend(card));toast('Layout reset');});
  document.querySelectorAll('[aria-label="Switch to flower"]').forEach(button=>button.onclick=()=>{
    const card=button.closest('[data-dnd-id="pixel"]');
    const flower=card.querySelector('[aria-label="Pixel Flower"]').parentElement;
    const plant=card.querySelector('button[aria-label="Pixel Plant"]').parentElement.parentElement;
    const showFlower=flower.getAttribute('aria-hidden')==='true';
    flower.setAttribute('aria-hidden',String(!showFlower));
    plant.setAttribute('aria-hidden',String(showFlower));
    flower.style.opacity=showFlower?'1':'0';plant.style.opacity=showFlower?'0':'1';
    plant.style.pointerEvents=showFlower?'none':'auto';
    button.setAttribute('aria-label',showFlower?'Switch to plant':'Switch to flower');
    card.querySelectorAll('[aria-label="Pixel Flower"] rect').forEach(rect=>{
      const x=(Number(rect.getAttribute('x'))+4-120)/10;
      const y=(Number(rect.getAttribute('y'))+4-105)/10;
      const distance=Math.hypot(x,y),angle=Math.atan2(y,x);
      const petal=distance<5.5+2*Math.cos(5*angle)&&distance>2;
      const center=distance<=2;
      const stem=Math.abs(x)<.8&&y>5&&y<11;
      rect.setAttribute('fill',center?'#ffce6b':petal?'#d5a3d9':stem?'#7d9c72':'currentColor');
      rect.setAttribute('opacity',center||petal||stem?'1':'.07');
    });
  });
  // Ambient glow and sprite use only local visuals, respecting reduced motion.
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const glow=document.getElementById('glow-layer');
    addEventListener('pointermove',event=>{if(glow)glow.style.transform=`translate3d(${event.clientX-innerWidth/2}px,${event.clientY-innerHeight/2}px,0)`;},{passive:true});
    let frame=0;setInterval(()=>{frame=(frame+1)%61;document.querySelectorAll('[aria-label="Robot"]').forEach(robot=>robot.style.backgroundPosition=`${frame/60*100}% 0%`);},90);
  }
  addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}});
})();
