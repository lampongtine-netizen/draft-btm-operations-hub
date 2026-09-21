const {integrationActive,addShopifyCustomerTags}=require('../_lib/common');
const {jsonBody,safeText,findStudent,saveStudent,saveEntitlement,accessFrom}=require('./_lib');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!integrationActive(req))return res.status(401).json({error:'Integration authentication required'});
  try{
    const b=jsonBody(req),email=safeText(b.email||b.customerEmail,320).toLowerCase();
    const shopifyCustomerId=safeText(b.shopifyCustomerId||b.customerId,80).replace(/^gid:\/\/shopify\/Customer\//,'');
    if(!email&&!shopifyCustomerId)return res.status(400).json({error:'email or shopifyCustomerId required'});
    const access=accessFrom(b),existing=await findStudent({shopifyCustomerId,email});
    const student=await saveStudent(existing,{
      shopify_customer_id:shopifyCustomerId||existing?.shopify_customer_id||null,
      name:safeText(b.name||b.customerName,200)||existing?.name||email||'BTM Member',email:email||existing?.email||null,
      phone:safeText(b.phone,80)||existing?.phone||null,program:access.program,level:access.level,
      educator_pathway:access.educator,status:b.accessActive===false?'Inactive':'Active',
      payment_status:safeText(b.paymentStatus,80)||existing?.payment_status||'Pending',updated_at:new Date().toISOString()
    });
    await saveEntitlement({studentId:student.id,program:access.program,level:access.level,source:'shopify',sourceReference:safeText(b.orderId||b.productId||b.sourceReference,255)||shopifyCustomerId,status:b.accessActive===false?'cancelled':'active',metadata:{tags:b.tags||[],lineItems:b.lineItems||[]}});
    if(shopifyCustomerId&&b.accessActive!==false)await addShopifyCustomerTags(shopifyCustomerId,['member',`btm-${access.level.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`]);
    return res.status(200).json({ok:true,studentId:student.id,program:access.program,level:access.level,accessActive:b.accessActive!==false});
  }catch(e){console.error('shopify student sync:',e);return res.status(500).json({error:e.message||String(e)})}
};
