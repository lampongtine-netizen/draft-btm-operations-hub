const {SUPABASE_URL,sbHeaders,integrationActive}=require('../_lib/common');
const {jsonBody,safeText,findStudent}=require('./_lib');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!integrationActive(req))return res.status(401).json({error:'Integration authentication required'});
  try{const b=jsonBody(req);const student=await findStudent({shopifyCustomerId:safeText(b.shopifyCustomerId,80),email:safeText(b.email,320)});if(!student)return res.status(404).json({error:'Student not found'});const payload={student_id:student.id,cadence:['Daily','Weekly','Monthly'].includes(b.cadence)?b.cadence:'Weekly',status:'Submitted',checkin_date:b.checkinDate||new Date().toISOString().slice(0,10),note:safeText(b.note||b.summary,4000)};const r=await fetch(`${SUPABASE_URL}/rest/v1/checkins`,{method:'POST',headers:sbHeaders('return=representation'),body:JSON.stringify(payload)});const rows=await r.json();if(!r.ok)throw new Error(rows?.message||'Unable to save check-in');return res.status(200).json({ok:true,checkinId:rows[0]?.id,studentId:student.id});}catch(e){console.error('Make check-in sync:',e);return res.status(500).json({error:e.message||String(e)})}
};
