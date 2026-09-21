(function(){
  const originalLoadAll=loadAll;
  const originalBindEvents=bindEvents;

  function safe(value){return escapeHtml(value==null?'':value)}
  function studentOptions(selected){
    return `<option value="">No linked student</option>${customers.map(c=>`<option value="${safe(c.id)}" ${c.id===selected?'selected':''}>${safe(c.name)}</option>`).join('')}`;
  }
  function teamOptions(selected){
    return `<option value="">Unassigned</option>${team.map(t=>`<option value="${safe(t.id)}" ${t.id===selected?'selected':''}>${safe(t.name)}</option>`).join('')}`;
  }
  function message(error){toast(error?.message||String(error))}

  loadAll=async function(){
    await originalLoadAll();
    if(!session||demoMode||state.loadError)return;
    const [approvalResult,checkinResult]=await Promise.all([
      sb.from('approvals').select('*').order('created_at',{ascending:false}),
      sb.from('checkins').select('*').order('created_at',{ascending:false})
    ]);
    if(approvalResult.error){state.loadError=approvalResult.error.message;render();return;}
    if(checkinResult.error){state.loadError=checkinResult.error.message;render();return;}
    approvals=approvalResult.data.map(a=>({id:a.id,title:a.title,studentId:a.student_id,status:a.status,ownerId:a.owner_id,dueDate:a.due_date,notes:a.notes||''}));
    checkins=checkinResult.data.map(c=>({id:c.id,studentId:c.student_id,cadence:c.cadence,status:c.status,when:c.checkin_date,note:c.note||''}));
    render();
  };

  renderApprovals=function(){
    return `<div class="topline"><div><h1>Approval Tracking</h1><div class="meta">Supabase-backed approvals and review decisions</div></div><button class="btn primary" id="approval-add">Add approval</button></div>
      <div class="card" id="approval-form" style="display:none"><h3>New approval</h3><div class="kv"><div class="item"><div class="k">Title</div><input id="approval-title" placeholder="What needs approval?"/></div><div class="item"><div class="k">Student</div><select id="approval-student">${studentOptions('')}</select></div><div class="item"><div class="k">Owner</div><select id="approval-owner">${teamOptions('')}</select></div><div class="item"><div class="k">Due date</div><input id="approval-due" type="date"/></div></div><textarea id="approval-notes" placeholder="Notes"></textarea><button class="btn primary" id="approval-save">Save approval</button></div>
      <table><thead><tr><th>Approval</th><th>Student</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${approvals.map(a=>`<tr><td><b>${safe(a.title)}</b><div class="meta">${safe(a.notes)}</div></td><td>${safe(findCustomer(a.studentId)?.name||'—')}</td><td>${safe(findTeam(a.ownerId)?.name||'Unassigned')}</td><td>${safe(a.dueDate||'—')}</td><td><select data-approval-status="${safe(a.id)}"><option ${a.status==='Pending'?'selected':''}>Pending</option><option ${a.status==='Approved'?'selected':''}>Approved</option><option ${a.status==='Changes Requested'?'selected':''}>Changes Requested</option></select></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state">No approvals recorded.</div></td></tr>'}</tbody></table>`;
  };

  renderCheckinsScope=function(){
    return `<div class="topline"><div><h1>Daily & Weekly Check-ins</h1><div class="meta">Supabase-backed student check-ins</div></div><button class="btn primary" id="checkin-add">Add check-in</button></div>
      <div class="card" id="checkin-form" style="display:none"><h3>New check-in</h3><div class="kv"><div class="item"><div class="k">Student</div><select id="checkin-student">${studentOptions('')}</select></div><div class="item"><div class="k">Cadence</div><select id="checkin-cadence"><option>Daily</option><option selected>Weekly</option><option>Monthly</option></select></div><div class="item"><div class="k">Status</div><select id="checkin-status"><option>Submitted</option><option>Reviewed</option><option>Overdue</option></select></div><div class="item"><div class="k">Date</div><input id="checkin-date" type="date" value="${new Date().toISOString().slice(0,10)}"/></div></div><textarea id="checkin-note" placeholder="Check-in note"></textarea><button class="btn primary" id="checkin-save">Save check-in</button></div>
      <table><thead><tr><th>Student</th><th>Cadence</th><th>Date</th><th>Note</th><th>Status</th></tr></thead><tbody>${checkins.map(c=>`<tr><td>${safe(findCustomer(c.studentId)?.name||'Unknown student')}</td><td>${safe(c.cadence)}</td><td>${safe(c.when)}</td><td>${safe(c.note)}</td><td><select data-checkin-status="${safe(c.id)}"><option ${c.status==='Submitted'?'selected':''}>Submitted</option><option ${c.status==='Reviewed'?'selected':''}>Reviewed</option><option ${c.status==='Overdue'?'selected':''}>Overdue</option></select></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state">No check-ins recorded.</div></td></tr>'}</tbody></table>`;
  };

  bindEvents=function(){
    originalBindEvents();
    const approvalAdd=document.getElementById('approval-add');
    if(approvalAdd)approvalAdd.addEventListener('click',()=>{document.getElementById('approval-form').style.display='block'});
    const approvalSave=document.getElementById('approval-save');
    if(approvalSave)approvalSave.addEventListener('click',async()=>{
      const payload={title:document.getElementById('approval-title').value.trim(),student_id:document.getElementById('approval-student').value||null,owner_id:document.getElementById('approval-owner').value||null,due_date:document.getElementById('approval-due').value||null,notes:document.getElementById('approval-notes').value.trim(),status:'Pending'};
      if(!payload.title)return toast('Enter an approval title.');
      const {error}=await sb.from('approvals').insert(payload);if(error)return message(error);await loadAll();
    });
    document.querySelectorAll('[data-approval-status]').forEach(node=>node.addEventListener('change',async()=>{const{error}=await sb.from('approvals').update({status:node.value,updated_at:new Date().toISOString()}).eq('id',node.dataset.approvalStatus);if(error)return message(error);await loadAll();}));
    const checkinAdd=document.getElementById('checkin-add');
    if(checkinAdd)checkinAdd.addEventListener('click',()=>{document.getElementById('checkin-form').style.display='block'});
    const checkinSave=document.getElementById('checkin-save');
    if(checkinSave)checkinSave.addEventListener('click',async()=>{
      const payload={student_id:document.getElementById('checkin-student').value,cadence:document.getElementById('checkin-cadence').value,status:document.getElementById('checkin-status').value,checkin_date:document.getElementById('checkin-date').value,note:document.getElementById('checkin-note').value.trim()};
      if(!payload.student_id)return toast('Choose a student.');
      const {error}=await sb.from('checkins').insert(payload);if(error)return message(error);await loadAll();
    });
    document.querySelectorAll('[data-checkin-status]').forEach(node=>node.addEventListener('change',async()=>{const{error}=await sb.from('checkins').update({status:node.value,reviewed_at:node.value==='Reviewed'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',node.dataset.checkinStatus);if(error)return message(error);await loadAll();}));
  };

  if(session&&!demoMode)loadAll();
})();
