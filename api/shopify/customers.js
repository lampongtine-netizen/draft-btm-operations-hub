const {shopifyGraphQL,staffActive}=require('../_lib/common');
const {findStudent,saveStudent,saveEntitlement,accessFrom}=require('../integrations/_lib');

async function allShopifyCustomers(){
  const customers=[];let cursor=null,hasNext=true;
  const query=`query($after:String){customers(first:100,after:$after){edges{cursor node{id firstName lastName displayName email phone numberOfOrders amountSpent{amount} createdAt updatedAt state tags}}pageInfo{hasNextPage endCursor}}}`;
  while(hasNext&&customers.length<5000){
    const data=await shopifyGraphQL(query,{after:cursor});
    const connection=data?.customers||{};
    customers.push(...(connection.edges||[]).map(x=>x.node));
    hasNext=!!connection.pageInfo?.hasNextPage;
    cursor=connection.pageInfo?.endCursor||null;
    if(hasNext&&!cursor)break;
  }
  return customers;
}

function isPortalStudent(customer){
  const configured=(process.env.BTM_STUDENT_TAGS||'member,btm graduate support,student,scale society,business advisory,educator,level 1,level 2').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const tags=(customer.tags||[]).map(x=>String(x).trim().toLowerCase());
  return tags.some(tag=>configured.some(allowed=>tag===allowed||tag.startsWith(allowed+' ')||tag.startsWith(allowed+'-')));
}

function publicCustomer(c){
  return {id:c.id,name:`${c.firstName||''} ${c.lastName||''}`.trim()||c.displayName||c.email||c.id,email:c.email,phone:c.phone,ordersCount:c.numberOfOrders,totalSpent:c.amountSpent?.amount,createdAt:c.createdAt,tags:c.tags,state:c.state?c.state.toLowerCase():null};
}

module.exports = async function handler(req, res) {
  try {
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
    if(!await staffActive(req))return res.status(401).json({error:'Staff authentication required'});
    const rawCustomers=await allShopifyCustomers();
    if(req.method==='GET'){
      const customers=rawCustomers.map(publicCustomer);
      return res.status(200).json({customers,count:customers.length,fetchedAt:new Date().toISOString()});
    }
    const portalStudents=rawCustomers.filter(isPortalStudent);let created=0,updated=0;
    for(const c of portalStudents){
      const shopifyCustomerId=String(c.id||'').replace(/^gid:\/\/shopify\/Customer\//,'');
      const email=String(c.email||'').trim().toLowerCase();
      const existing=await findStudent({shopifyCustomerId,email});
      const access=accessFrom({tags:c.tags||[]});
      const student=await saveStudent(existing,{shopify_customer_id:shopifyCustomerId,name:`${c.firstName||''} ${c.lastName||''}`.trim()||c.displayName||email||'BTM Member',email:email||existing?.email||null,phone:c.phone||existing?.phone||null,program:access.program,level:access.level,educator_pathway:access.educator,status:c.state==='DISABLED'?'Inactive':'Active',payment_status:existing?.payment_status||'Pending',enrolled_at:existing?.enrolled_at||c.createdAt||new Date().toISOString(),last_activity_at:c.updatedAt||new Date().toISOString(),updated_at:new Date().toISOString()});
      await saveEntitlement({studentId:student.id,program:access.program,level:access.level,source:'shopify',sourceReference:shopifyCustomerId,status:c.state==='DISABLED'?'cancelled':'active',metadata:{tags:c.tags||[],syncedFrom:'shopify-customers'}});
      if(existing)updated++;else created++;
    }
    return res.status(200).json({ok:true,shopifyCustomers:rawCustomers.length,portalStudents:portalStudents.length,created,updated,syncedAt:new Date().toISOString()});
  } catch(err){
    console.error('shopify/customers:',err.message||err);
    res.status(500).json({error:'Failed to fetch Shopify customers'});
  }
};
module.exports._test={isPortalStudent,publicCustomer};
