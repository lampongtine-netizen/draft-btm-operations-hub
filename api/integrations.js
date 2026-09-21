const {SUPABASE_URL,sbHeaders,integrationActive,addShopifyCustomerTags}=require('./_lib/common');
const {parseBody,safeText,findStudent,saveStudent,saveEntitlement,mapProgram}=require('./integrations/_lib');

async function shopifyStudent(body){
  const shopifyCustomerId=safeText(body.shopifyCustomerId||body.customerId,255),email=safeText(body.email,320).toLowerCase();
  if(!shopifyCustomerId&&!email)throw Object.assign(new Error('email or shopifyCustomerId required'),{status:400});
  const mapped=mapProgram(body.tags,body.productTitle||body.program),existing=await findStudent(shopifyCustomerId,email);
  const student=await saveStudent(existing,{name:safeText(body.name||[body.firstName,body.lastName].filter(Boolean).join(' '),255)||email||'Shopify Student',email:email||null,phone:safeText(body.phone,80)||null,business:safeText(body.business,255)||null,shopify_customer_id:shopifyCustomerId||null,program:mapped.program,level:mapped.level,status:'Active',payment_status:safeText(body.paymentStatus,80)||'Current',enrolled_at:body.enrolledAt||new Date().toISOString(),last_activity_at:new Date().toISOString()});
  const entitlement=await saveEntitlement(student.id,{shopify_customer_id:shopifyCustomerId||null,source:'shopify',program:mapped.program,product_id:safeText(body.productId,255)||null,product_title:safeText(body.productTitle,255)||null,shopify_tags:Array.isArray(body.tags)?body.tags:[],status:'active',activated_at:new Date().toISOString(),metadata:{source:'shopify-student'}});
  if(shopifyCustomerId)await addShopifyCustomerTags(shopifyCustomerId,['member',`btm-${mapped.level.toLowerCase().replace(/\s+/g,'-')}`]);
  return {student,entitlement};
}

async function payment(body){
  const eventId=safeText(body.eventId||body.id,255),email=safeText(body.email,320).toLowerCase(),shopifyCustomerId=safeText(body.shopifyCustomerId||body.customerId,255);
  if(!eventId||(!email&&!shopifyCustomerId))throw Object.assign(new Error('eventId and email or shopifyCustomerId required'),{status:400});
  const duplicate=await fetch(`${SUPABASE_URL}/rest/v1/payment_events?external_event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`,{headers:sbHeaders()}),duplicateRows=await duplicate.json();
  if(!duplicate.ok)throw new Error('Unable to check payment event');
  if(duplicateRows.length)return {duplicate:true,eventId};
  const paymentStatus=safeText(body.paymentStatus||body.status,80).toLowerCase(),subscriptionStatus=safeText(body.subscriptionStatus,80).toLowerCase();
  const active=['paid','succeeded','current','active','trialing'].includes(paymentStatus)||['active','trialing'].includes(subscriptionStatus),mapped=mapProgram(body.tags,body.productTitle||body.program),existing=await findStudent(shopifyCustomerId,email);
  const student=await saveStudent(existing,{name:safeText(body.name,255)||email||'BTM Student',email:email||null,shopify_customer_id:shopifyCustomerId||null,program:mapped.program,level:mapped.level,status:active?'Active':'Payment Issue',payment_status:active?'Current':(safeText(body.paymentStatus||body.status,80)||'Payment Issue'),last_activity_at:new Date().toISOString(),...(!existing&&active?{enrolled_at:new Date().toISOString()}:{})});
  const eventResponse=await fetch(`${SUPABASE_URL}/rest/v1/payment_events`,{method:'POST',headers:sbHeaders('return=representation'),body:JSON.stringify({external_event_id:eventId,event_type:safeText(body.eventType||body.type,120)||'payment.updated',student_id:student.id,shopify_customer_id:shopifyCustomerId||null,stripe_customer_id:safeText(body.stripeCustomerId,255)||null,stripe_subscription_id:safeText(body.stripeSubscriptionId,255)||null,payment_status:paymentStatus||null,subscription_status:subscriptionStatus||null,access_active:active,amount:body.amount==null?null:Number(body.amount),currency:safeText(body.currency,12).toUpperCase()||null,payload:body})}),events=await eventResponse.json();
  if(!eventResponse.ok)throw new Error(events?.message||'Unable to record payment event');
  const entitlement=await saveEntitlement(student.id,{shopify_customer_id:shopifyCustomerId||null,source:'make-stripe',program:mapped.program,product_id:safeText(body.productId,255)||null,product_title:safeText(body.productTitle,255)||null,shopify_tags:Array.isArray(body.tags)?body.tags:[],status:active?'active':'inactive',activated_at:active?new Date().toISOString():null,deactivated_at:active?null:new Date().toISOString(),metadata:{eventId,paymentStatus,subscriptionStatus}});
  if(active&&shopifyCustomerId)await addShopifyCustomerTags(shopifyCustomerId,['member',`btm-${mapped.level.toLowerCase().replace(/\s+/g,'-')}`]);
  return {event:events[0],student,entitlement,accessActive:active};
}

async function checkin(body){
  const student=await findStudent(safeText(body.shopifyCustomerId||body.customerId,255),safeText(body.email,320).toLowerCase());
  if(!student)throw Object.assign(new Error('Student not found'),{status:404});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/checkins`,{method:'POST',headers:sbHeaders('return=representation'),body:JSON.stringify({student_id:student.id,kind:safeText(body.kind,40)||'weekly',checkin_date:body.checkinDate||new Date().toISOString().slice(0,10),status:safeText(body.status,80)||'Submitted',score:body.score==null?null:Number(body.score),summary:safeText(body.summary,4000)||null,submitted_at:body.submittedAt||new Date().toISOString()})}),rows=await response.json();
  if(!response.ok)throw new Error(rows?.message||'Unable to save check-in');
  return {checkin:rows[0]};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!integrationActive(req))return res.status(401).json({error:'Integration authentication required'});
  try{
    const body=parseBody(req),action=safeText(req.query?.action||body.action,40).toLowerCase();
    const data=action==='shopify-student'?await shopifyStudent(body):action==='payment'?await payment(body):action==='checkin'?await checkin(body):null;
    if(!data)return res.status(400).json({error:'action must be shopify-student, payment, or checkin'});
    return res.status(200).json({ok:true,...data});
  }catch(error){return res.status(error.status||500).json({error:error.message||String(error)});}
};
