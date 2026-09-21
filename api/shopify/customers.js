const {shopifyGraphQL,staffActive}=require('../_lib/common');

module.exports = async function handler(req, res) {
  try {
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    if(!await staffActive(req))return res.status(401).json({error:'Staff authentication required'});
    const query=`query { customers(first: 50) { edges { node { id firstName lastName email phone numberOfOrders amountSpent { amount } createdAt state tags } } } }`;
    const data=await shopifyGraphQL(query);
    const customers=(data?.customers?.edges||[]).map(({node:c})=>({
      id:c.id,
      name:`${c.firstName||''} ${c.lastName||''}`.trim()||c.email||c.id,
      email:c.email,
      phone:c.phone,
      ordersCount:c.numberOfOrders,
      totalSpent:c.amountSpent?.amount,
      createdAt:c.createdAt,
      tags:c.tags,
      state:c.state?c.state.toLowerCase():null
    }));
    res.status(200).json({customers,count:customers.length,fetchedAt:new Date().toISOString()});
  } catch(err){
    console.error('shopify/customers:',err.message||err);
    res.status(500).json({error:'Failed to fetch Shopify customers'});
  }
};
