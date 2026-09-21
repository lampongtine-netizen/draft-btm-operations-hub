# BTM Operations HQ — Empty Trial v2

This review build starts with no sample students, payments, tasks, approvals or activity. Each section contains a short description of its intended BTM function.

## Trial access
Set `BTM_DEMO_ACCESS_CODE` and `BTM_DEMO_SESSION_SECRET` in Vercel.

## Trial Communications
Communications starts empty. Use the **Open messaging test** button in Communications (or `/student-test.html`) to create a browser-local trial conversation. Bree can reply as **Bree Wilkinson** or **BTM Support Team**. This test data stays in the browser and does not touch live student records.

## Production note
Real student messaging still requires authenticated Shopify customer identity and server-side authorization before going live.
