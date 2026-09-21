const crypto=require('crypto');
const SUPABASE_URL=process.env.SUPABASE_URL||'https://cheaehziqvdnwiavzwxh.supabase.co';

function sbHeaders(prefer){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  const h={'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`};
  if(prefer)h.Prefer=prefer;
  return h;
}

function cors(req,res){
  const configured=(process.env.BTM_SHOPIFY_ORIGINS||'https://beautytrainingmastery.com,https://www.beautytrainingmastery.com').split(',').map(x=>x.trim()).filter(Boolean);
  const origin=req.headers.origin;
  if(origin&&configured.includes(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  return !origin||configured.includes(origin);
}

function demoActive(req){
  const secret=process.env.BTM_DEMO_SESSION_SECRET;
  if(!secret)return false;
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('btm_demo='));
  if(!raw)return false;
  const token=decodeURIComponent(raw.slice('btm_demo='.length));
  const dot=token.lastIndexOf('.');
  if(dot<0)return false;
  const value=token.slice(0,dot),got=token.slice(dot+1);
  const want=crypto.createHmac('sha256',secret).update(value).digest('hex');
  if(got.length!==want.length||!crypto.timingSafeEqual(Buffer.from(got),Buffer.from(want)))return false;
  const [who,exp]=value.split(':');
  return who==='bree'&&Number(exp)>Date.now();
}

function integrationActive(req){
  const expected=String(process.env.MAKE_WEBHOOK_SECRET||'');
  if(!expected)return false;
  const bearer=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
  const supplied=String(bearer||req.headers['x-make-secret']||'');
  const a=Buffer.from(supplied),b=Buffer.from(expected);
  return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
}

async function staffActive(req){
  if(demoActive(req))return true;
  const header=String(req.headers.authorization||'');
  const match=header.match(/^Bearer\s+(.+)$/i);
  if(!match)return false;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)return false;
  try{
    const userResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
      headers:{apikey:serviceKey,Authorization:`Bearer ${match[1]}`}
    });
    const user=await userResponse.json().catch(()=>null);
    if(!userResponse.ok||!user?.email)return false;
    const email=encodeURIComponent(String(user.email).toLowerCase());
    const adminResponse=await fetch(`${SUPABASE_URL}/rest/v1/admins?email=eq.${email}&select=id&limit=1`,{
      headers:sbHeaders()
    });
    const admins=await adminResponse.json().catch(()=>[]);
    return adminResponse.ok&&Array.isArray(admins)&&admins.length>0;
  }catch(err){
    console.error('staffActive:',err.message||err);
    return false;
  }
}

let shopifyToken=null;
let shopifyTokenExpiresAt=0;

function shopDomain(){
  return (process.env.SHOPIFY_STORE_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
}

async function getShopifyAccessToken(){
  const shop=shopDomain();
  const clientId=process.env.SHOPIFY_CLIENT_ID;
  const clientSecret=process.env.SHOPIFY_CLIENT_SECRET;
  if(!shop||!clientId||!clientSecret)throw new Error('Missing Shopify environment variables');
  if(shopifyToken&&Date.now()<shopifyTokenExpiresAt-60000)return shopifyToken;

  const r=await fetch(`https://${shop}/admin/oauth/access_token`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.access_token)throw new Error(`Shopify token request failed (${r.status})`);
  shopifyToken=j.access_token;
  shopifyTokenExpiresAt=Date.now()+(Number(j.expires_in||86399)*1000);
  return shopifyToken;
}

async function shopifyGraphQL(query,variables={}){
  const shop=shopDomain();
  if(!shop)throw new Error('Missing SHOPIFY_STORE_DOMAIN');
  const token=await getShopifyAccessToken();
  const r=await fetch(`https://${shop}/admin/api/2026-07/graphql.json`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
    body:JSON.stringify({query,variables})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`Shopify GraphQL request failed (${r.status})`);
  if(j.errors?.length)throw new Error('Shopify GraphQL returned an error');
  return j.data;
}

async function addShopifyCustomerTags(customerId,tags){
  const numeric=String(customerId||'').replace(/^gid:\/\/shopify\/Customer\//,'');
  if(!/^\d+$/.test(numeric))throw new Error('Invalid Shopify customer ID');
  const clean=[...new Set((tags||[]).map(String).map(x=>x.trim()).filter(Boolean))];
  if(!clean.length)return;
  const mutation=`mutation($id:ID!,$tags:[String!]!){tagsAdd(id:$id,tags:$tags){userErrors{field message}}}`;
  const data=await shopifyGraphQL(mutation,{id:`gid://shopify/Customer/${numeric}`,tags:clean});
  const errors=data?.tagsAdd?.userErrors||[];
  if(errors.length)throw new Error(errors[0].message||'Shopify tag update failed');
}

async function verifyShopifyMember(customerId,email){
  if(!customerId||!email)return {ok:false,error:'Missing customer identity'};
  const id=String(customerId).replace(/^gid:\/\/shopify\/Customer\//,'');
  if(!/^\d+$/.test(id))return {ok:false,error:'Invalid customer ID'};
  try{
    const query=`query($id:ID!){customer(id:$id){id email displayName tags}}`;
    const data=await shopifyGraphQL(query,{id:`gid://shopify/Customer/${id}`});
    const c=data?.customer;
    if(!c)return {ok:false,error:'Shopify customer could not be verified'};
    const tags=(c.tags||[]).map(x=>String(x).toLowerCase());
    if(String(c.email||'').toLowerCase()!==String(email).toLowerCase())return {ok:false,error:'Customer email does not match'};
    if(!tags.includes('member'))return {ok:false,error:'This Shopify account is not tagged as a member'};
    return {ok:true,customer:{id,name:c.displayName||email,email:c.email}};
  }catch(err){
    console.error('verifyShopifyMember:',err.message||err);
    return {ok:false,error:'Shopify customer could not be verified'};
  }
}

module.exports={SUPABASE_URL,sbHeaders,cors,demoActive,integrationActive,staffActive,verifyShopifyMember,getShopifyAccessToken,shopifyGraphQL,addShopifyCustomerTags};
