const test=require('node:test');
const assert=require('node:assert/strict');

function response(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this},
    setHeader(name,value){this.headers[name]=value}
  };
}

test('Shopify customer PII endpoint rejects unauthenticated requests',async()=>{
  const handler=require('../api/shopify/customers');
  const res=response();
  await handler({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.body,{error:'Staff authentication required'});
});

test('Shopify app proxy rejects unsigned requests before data access',async()=>{
  const handler=require('../api/shopify/proxy');
  const res=response();
  await handler({method:'GET',headers:{},query:{}},res);
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.body,{error:'Invalid Shopify proxy signature'});
});

for(const [name,path,method] of [
  ['conversation list','../api/admin/conversations','GET'],
  ['conversation read update','../api/admin/mark-read','POST'],
  ['staff reply','../api/admin/reply','POST']
]){
  test(`Admin ${name} rejects unauthenticated requests`,async()=>{
    const handler=require(path);
    const res=response();
    await handler({method,headers:{},body:{}},res);
    assert.equal(res.statusCode,401);
    assert.deepEqual(res.body,{error:'Staff authentication required'});
  });
}

for(const [name,path] of [
  ['Make payment sync','../api/integrations/make-payment'],
  ['Shopify student sync','../api/integrations/shopify-student'],
  ['Make check-in sync','../api/integrations/make-checkin']
]){
  test(`${name} rejects unsigned requests`,async()=>{
    const handler=require(path);const res=response();
    await handler({method:'POST',headers:{},body:{}},res);
    assert.equal(res.statusCode,401);
    assert.deepEqual(res.body,{error:'Integration authentication required'});
  });
}
