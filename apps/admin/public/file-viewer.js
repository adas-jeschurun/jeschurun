
(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  async function openRepoText(path){
    try{
      const r=await fetch('/api/read-file?path='+encodeURIComponent(path),{cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      const body=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
        <code style="font-size:.78rem;overflow-wrap:anywhere;flex:1">${esc(d.path)}</code>
        <button class="btn" id="copyRepoText">Копировать</button>
      </div>
      <textarea id="repoTextView" readonly style="width:100%;min-height:55vh;resize:vertical;border:1px solid #d5cec4;border-radius:8px;padding:12px;font:13px/1.5 Consolas,monospace;direction:ltr;white-space:pre;overflow:auto"></textarea>`;
      if(typeof openModal==='function')openModal('Просмотр файла',body);
      else return alert(d.text);
      const ta=document.querySelector('#repoTextView');ta.value=d.text||'';
      const b=document.querySelector('#copyRepoText');
      if(b)b.onclick=async()=>{try{await navigator.clipboard.writeText(ta.value);b.textContent='Скопировано'}catch{ta.select();document.execCommand('copy')}};
    }catch(e){alert('Не удалось открыть файл: '+e.message)}
  }

  function decorate(){
    document.querySelectorAll('.repoFile').forEach(row=>{
      if(row.querySelector('.repoOpenBtn'))return;
      const box=row.querySelector('[data-repo-path]');
      if(!box)return;
      const path=box.dataset.repoPath||'';
      if(!/\.(md|json|txt)$/i.test(path))return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn repoOpenBtn';
      btn.textContent='Открыть';
      btn.style.cssText='padding:4px 8px;font-size:.72rem;white-space:nowrap';
      btn.onclick=(e)=>{e.preventDefault();e.stopPropagation();openRepoText(path)};
      row.appendChild(btn);
      row.style.gridTemplateColumns='22px 1fr auto auto';
    });
  }

  // Decorate after file list refreshes.
  const obs=new MutationObserver(()=>decorate());
  window.addEventListener('DOMContentLoaded',()=>{
    const root=document.querySelector('#repoFiles');
    if(root)obs.observe(root,{childList:true,subtree:true});
    decorate();
  });
})();
