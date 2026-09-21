const {SUPABASE_URL,sbHeaders,integrationActive,addShopifyCustomerTags}=require('../_lib/common');
const {jsonBody,safeText,findStudent,saveStudent,saveEntitlement,accessFrom}=require('./_lib');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!integrationActive(req))return res.status(401).json({error:'Integration authentication required'});
  try{
    const b=jsonBody(req),eventId=safeText(b.eventId||b.id,255),email=safeText(b.email||b.customerEmail,320).toLowerCase();
    const shopifyCustomerId=safeText(b.shopifyCustomerId||b.customerId,80).replace(/^gid:\/\/shopify\/Customer\//,'');
    if(!eventId)return res.status(400).json({error:'eventId required'});
    if(!email&&!shopifyCustomerId)return res.status(400).json({error:'email or shopifyCustomerId required'});
    const dupe=await fetch(`${SUPABASE_URL}/rest/v1/payment_events?external_event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`,{headers:sbHeaders()});
    const duplicates=await dupe.json();if(!dupe.ok)throw new Error('Unable to check payment event');if(duplicates[0])return res.status(200).json({ok:true,duplicate:true});
    const paymentStatus=safeText(b.paymentStatus||b.status,80).toLowerCase();
    const subscriptionStatus=safeText(b.subscriptionStatus,80).toLowerCase();
    const active=b.accessActive===true||['paid','succeeded','current','active','trialing'].includes(paymentStatus)||['active','trialing'].includes(subscriptionStatus);
    const access=accessFrom(b),existing=await findStudent({shopifyCustomerId,email});
    const student=await saveStudent(existing,{shopify_customer_id:shopifyCustomerId||existing?.shopify_customer_id||null,name:safeText(b.name||b.customerName,200)||existing?.name||email,email:email||existing?.email||null,program:access.program,level:access.level,educator_pathway:access.educator,status:active?'Active':'Payment Review',payment_status:active?'Current':(safeText(b.paymentStatus||b.status,80)||'Pending'),renewal_date:b.renewalDate||existing?.renewal_date||null,updated_at:new Date().toISOString()});
    await saveEntitlement({studentId:student.id,program:access.program,level:access.level,source:'stripe',sourceReference:safeText(b.stripeSubscriptionId||b.stripePaymentIntentId||eventId,255),status:active?'active':'pending',metadata:{eventType:b.eventType||b.type||null,renewalDate:b.renewalDate||null}});
    const er=await fetch(`${SUPABASE_URL}/rest/v1/payment_events`,{method:'POST',headers:sbHeaders('return=representation'),body:JSON.stringify({external_event_id:eventId,event_type:safeText(b.eventType||b.type,120)||'payment.updated',student_id:student.id,shopify_customer_id:shopifyCustomerId||null,stripe_customer_id:safeText(b.stripeCustomerId,255)||null,stripe_subscription_id:safeText(b.stripeSubscriptionId,255)||null,payment_status:paymentStatus||null,subscription_status:subscriptionStatus||null,access_active:active,amount:b.amount==null?null:Number(b.amount),currency:safeText(b.currency,12).toUpperCase()||null,payload:b})});
    const events=await er.json();if(!er.ok)throw new Error(events?.message||'Unable to record payment event');
    if(active&&shopifyCustomerId)await addShopifyCustomerTags(shopifyCustomerId,['member',`btm-${access.level.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`]);
    return res.status(200).json({ok:true,studentId:student.id,accessActive:active,paymentEventId:events[0]?.id});
  }catch(e){console.error('Make payment sync:',e);return res.status(500).json({error:e.message||String(e)})}
};
