const { chromium } = require('playwright-core');
(async () => {
 const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true});
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('pageerror', e=>{errors.push(e.message); console.error('PAGE ERROR:', e.stack)});
 let signedIn=false, saved=null;
 await page.route('**/api/v1/**', async route=>{
  const req=route.request(), u=new URL(req.url()); let data={}; let status=200;
  if(u.pathname.endsWith('/auth/me')) {if(!signedIn){status=401;data={message:'Unauthenticated'}} else data={user:{id:1,name:'آزمایش',email:'test@example.com',user_type:'salesperson',permissions:['customers.view','customers.create','customers.edit','parts.view','parts.assign']}}}
  else if(u.pathname.endsWith('/notifications')) data=[];
  else if(u.pathname.endsWith('/settings/company')) data={company_name:'آزمایش'};
  else if(u.pathname.endsWith('/customers/1')) data={id:1,first_name:null,last_name:null,full_name:'شرکت نمونه',company_name:'شرکت نمونه',type:'company',customer_type:'potential',customer_parts:[],histories:[],sms_logs:[]};
  else if(u.pathname.endsWith('/parts')) data=[{id:1,name:'دستگاه نمونه',code:'ABC',stock_quantity:10,periodic_service_months:12,is_active:true}];
  else if(u.pathname.endsWith('/customers') && req.method()==='POST') {saved=req.postDataJSON();data={message:'ثبت شد',customer:{id:2,...saved}}}
  else if(u.pathname.endsWith('/customers')) data={data:[],current_page:1,last_page:1,total:0};
  else if(u.pathname.endsWith('/dashboard/stats')) data={stats:{total_customers:0,effective_customers:0,potential_customers:0,total_parts:0,assigned_parts:0,total_sms_sent:0},recent_activities:[],recent_sms:[]};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:5173/login');
 await page.waitForSelector('input[type=password]');
 const loginValue=await page.locator('input[name=login]').inputValue(); const pwValue=await page.locator('input[type=password]').first().inputValue();
 if(loginValue || pwValue) throw Error('login is prefilled'); console.log('PASS login defaults empty');
 signedIn=true; await page.goto('http://127.0.0.1:5173/customers/1');
 await page.getByRole('button',{name:'تخصیص دستگاه جدید'}).click();
 const dialog=page.locator('dialog[open]'); await dialog.waitFor();
 const dateButton=dialog.locator('button[aria-expanded]').last(); await dateButton.click();
 const popup=dialog.locator('div[style*="z-index: 99999"]'); await popup.waitFor();
 const rect=await popup.boundingBox(); if(!rect || rect.x < 0 || rect.y < 0 || rect.x+rect.width>390 || rect.y+rect.height>844) throw Error('calendar outside viewport '+JSON.stringify(rect));
 await popup.locator('button[title="ماه قبل"]').click();
 await popup.getByRole('button',{name:/امروز/}).click();
 console.log('PASS calendar opens inside modal and today is clickable on mobile');
 await dialog.getByRole('button',{name:'انصراف'}).click();
 await page.goto('http://127.0.0.1:5173/customers');
 const add=page.getByRole('button',{name:/ثبت مشتری جدید/}).first(); await add.click();
 const form=page.locator('dialog[open]'); await form.getByText('حقوقی (شرکت/کارگاه)').click();
 await form.locator('input[name=company_name]').fill('شرکت بدون شماره');
 await form.getByRole('button',{name:'ثبت مشتری',exact:true}).click();
 await page.waitForTimeout(500); if(!saved || saved.company_name!=='شرکت بدون شماره' || saved.mobile!=='') throw Error('company form not submitted '+JSON.stringify(saved));
 console.log('PASS company-only form submits without mobile');
 if(errors.length) throw Error('Page errors '+errors.join(', '));
 await browser.close();
})().catch(e=>{console.error(e); process.exit(1)});
