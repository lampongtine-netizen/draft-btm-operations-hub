const crypto=require('crypto');
const {SUPABASE_URL,sbHeaders,shopifyGraphQL}=require('../_lib/common');

function proxySignatureValid(query){
  const secret=process.env.SHOPIFY_CLIENT_SECRET;
  const got=String(query.signature||'');
  if(!secret||!/^[a-f0-9]{64}$/i.test(got))return false;
  const params={};
  for(const [k,v] of Object.entries(query||{})){
    if(k==='signature')continue;
    params[k]=Array.isArray(v)?v.map(String):[String(v??'')];
  }
  const message=Object.keys(params).sort().map(k=>`${k}=${params[k].join(',')}`).join('');
  const want=crypto.createHmac('sha256',secret).update(message).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(want,'hex'));}catch{return false;}
}

async function member(customerId){
  const id=String(customerId||'');
  if(!/^\d+$/.test(id))return null;
  const data=await shopifyGraphQL(`query($id:ID!){customer(id:$id){id email displayName tags}}`,{id:`gid://shopify/Customer/${id}`});
  const c=data?.customer;
  if(!c)return null;
  const tags=(c.tags||[]).map(x=>String(x).toLowerCase());
  if(!tags.includes('member')&&!tags.includes('btm graduate support'))return null;
  return {id:String(c.id).replace(/^gid:\/\/shopify\/Customer\//,''),name:c.displayName||c.email||'Member',email:c.email||''};
}

async function getConversation(c){
  const h=sbHeaders(),cid=encodeURIComponent(c.id);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/conversations?shopify_customer_id=eq.${cid}&limit=1`,{headers:h});
  const j=await r.json();
  if(!r.ok)throw new Error('Failed to find conversation');
  return Array.isArray(j)?j[0]:null;
}

module.exports=async function handler(req,res){
  try{
    if(!proxySignatureValid(req.query||{}))return res.status(401).json({error:'Invalid Shopify proxy signature'});
    const configured=(process.env.SHOPIFY_STORE_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
    const shop=String(req.query.shop||'').toLowerCase();
    if(!configured||shop!==configured)return res.status(403).json({error:'Shop not allowed'});
    const customerId=String(req.query.logged_in_customer_id||'');
    if(!customerId)return res.status(401).json({error:'Please log in to your Shopify customer account'});
    const c=await member(customerId);
    if(!c)return res.status(403).json({error:'Member access required'});
    const action=String(req.query.action||'messages');

    if(req.method==='GET'&&action==='messages'){
      const convo=await getConversation(c);
      if(!convo)return res.status(200).json({conversationId:null,messages:[]});
      const mr=await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(convo.id)}&order=created_at.asc`,{headers:sbHeaders()});
      const messages=await mr.json();
      if(!mr.ok)throw new Error('Failed to fetch messages');
      if(convo.unread_for_student)await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${encodeURIComponent(convo.id)}`,{method:'PATCH',headers:sbHeaders(),body:JSON.stringify({unread_for_student:false})});
      return res.status(200).json({conversationId:convo.id,messages});
    }

    if(req.method==='POST'&&action==='send'){
      let body=req.body;
      if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={message:body}}}
      const text=String(body?.message||'').trim();
      if(!text||text.length>2000)return res.status(400).json({error:'Message must be 1–2000 characters'});
      let convo=await getConversation(c);
      const h=sbHeaders('return=representation');
      if(!convo){
        const cr=await fetch(`${SUPABASE_URL}/rest/v1/conversations`,{method:'POST',headers:h,body:JSON.stringify({shopify_customer_id:c.id,customer_name:c.name,customer_email:c.email,status:'open',unread_for_admin:true,unread_for_student:false})});
        const created=await cr.json();
        if(!cr.ok)throw new Error(created?.message||'Failed to create conversation');
        convo=created[0];
      }
      const mr=await fetch(`${SUPABASE_URL}/rest/v1/messages`,{method:'POST',headers:h,body:JSON.stringify({conversation_id:convo.id,sender_type:'student',sender_name:c.name,body:text})});
      const md=await mr.json();
      if(!mr.ok)throw new Error('Failed to send message');
      await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${encodeURIComponent(convo.id)}`,{method:'PATCH',headers:sbHeaders(),body:JSON.stringify({customer_name:c.name,customer_email:c.email,status:'open',unread_for_admin:true,updated_at:new Date().toISOString()})});
      return res.status(200).json({conversationId:convo.id,message:md[0]});
    }
    return res.status(405).json({error:'Unsupported proxy request'});
  }catch(e){console.error('shopify proxy:',e);return res.status(500).json({error:'Unable to process member message'});}
};
