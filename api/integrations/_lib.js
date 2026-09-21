const {SUPABASE_URL,sbHeaders}=require('../_lib/common');

function jsonBody(req){
  if(typeof req.body==='string')return JSON.parse(req.body||'{}');
  return req.body||{};
}

function safeText(value,max=500){return String(value||'').trim().slice(0,max)}
function emailFilter(email){return encodeURIComponent(String(email||'').trim().toLowerCase())}

async function findStudent({shopifyCustomerId,email}){
  const h=sbHeaders();
  if(shopifyCustomerId){
    const r=await fetch(`${SUPABASE_URL}/rest/v1/students?shopify_customer_id=eq.${encodeURIComponent(String(shopifyCustomerId))}&limit=1`,{headers:h});
    const rows=await r.json();if(!r.ok)throw new Error('Unable to match Shopify student');if(rows[0])return rows[0];
  }
  if(email){
    const r=await fetch(`${SUPABASE_URL}/rest/v1/students?email=ilike.${emailFilter(email)}&limit=1`,{headers:h});
    const rows=await r.json();if(!r.ok)throw new Error('Unable to match student email');if(rows[0])return rows[0];
  }
  return null;
}

async function saveStudent(existing,payload){
  const h=sbHeaders('return=representation');
  const url=existing?`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(existing.id)}`:`${SUPABASE_URL}/rest/v1/students`;
  const r=await fetch(url,{method:existing?'PATCH':'POST',headers:h,body:JSON.stringify(payload)});
  const rows=await r.json();if(!r.ok)throw new Error(rows?.message||'Unable to save student');return rows[0]||existing;
}

async function saveEntitlement({studentId,program,level,source='shopify',sourceReference,status='active',metadata={}}){
  if(!sourceReference)return null;
  const filter=`student_id=eq.${encodeURIComponent(studentId)}&source=eq.${encodeURIComponent(source)}&source_reference=eq.${encodeURIComponent(sourceReference)}&program=eq.${encodeURIComponent(program)}`;
  const h=sbHeaders('return=representation');
  const found=await fetch(`${SUPABASE_URL}/rest/v1/access_entitlements?${filter}&select=id&limit=1`,{headers:h});
  const rows=await found.json();if(!found.ok)throw new Error('Unable to match access entitlement');
  const payload={student_id:studentId,program,level,source,source_reference:sourceReference,status,metadata,updated_at:new Date().toISOString()};
  const r=await fetch(rows[0]?`${SUPABASE_URL}/rest/v1/access_entitlements?id=eq.${encodeURIComponent(rows[0].id)}`:`${SUPABASE_URL}/rest/v1/access_entitlements`,{method:rows[0]?'PATCH':'POST',headers:h,body:JSON.stringify(payload)});
  const saved=await r.json();if(!r.ok)throw new Error(saved?.message||'Unable to save access entitlement');return saved[0]||rows[0];
}

function accessFrom(input){
  const joined=[...(input.tags||[]),...(input.lineItems||[]).map(x=>x.title||x.name||x.productTitle||'')].join(' ').toLowerCase();
  const requested=safeText(input.program||input.product||input.productTitle,160);
  if(requested)return {program:requested,level:safeText(input.level,80)||requested,educator:/educator/i.test(requested)};
  if(/scale society|level\s*2/.test(joined))return {program:'Scale Society',level:'Level 2',educator:false};
  if(/educator/.test(joined))return {program:'Educators Pathway',level:'Educators Pathway',educator:true};
  if(/advisory|level\s*1|business support/.test(joined))return {program:'Business Advisory & Support',level:'Level 1',educator:false};
  return {program:'BTM Membership',level:'Member',educator:false};
}

module.exports={jsonBody,safeText,findStudent,saveStudent,saveEntitlement,accessFrom};
