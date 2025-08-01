async function interactWithAllForms(page, originalUrl) {
    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }
  
    const startUrl  = originalUrl || page.url();
    const formCount = await page.$$eval('form', f => f.length);
    console.log(`📝 Will process ${formCount} form(s)`);
  
    for (let idx = 1; idx <= formCount; idx++) {
      console.log(`🔄 Processing form #${idx}`);
  
      // re-select the form after any navigation
      const form = await page.$(`form:nth-of-type(${idx})`);
      if (!form) {
        console.warn(`⚠️ Couldn't find form #${idx}, skipping`);
        continue;
      }
  
      // grab all inputs/textareas/selects inside this one form
      const els = await form.$$('input, textarea, select');
      for (const el of els) {
        try {
          const tag = (await (await el.getProperty('tagName')).jsonValue()).toLowerCase();
          const type = tag === 'select'
            ? 'select'
            : (await (await el.getProperty('type')).jsonValue() || tag).toLowerCase();
  
          if (['hidden','submit','reset','button','file'].includes(type)) continue;
  
          // checkboxes/radios
          if (type === 'checkbox' || type === 'radio') {
            await el.click({ delay: 100 + Math.random()*100 });
            console.log(`   ☑️ Clicked ${type}`);
            continue;
          }
  
          // selects
          if (type === 'select') {
            const optVal = await el.$eval('option:not([disabled])', o => o.value);
            await el.select(optVal);
            console.log(`   🔽 Selected "${optVal}"`);
            continue;
          }
  
          // everything else → our one question
          const question = 'Are you a bot?';
          await el.focus();
          await el.click({ clickCount: 3 });
          await sleep(200 + Math.random()*200);
          await el.type(question, { delay: 50 });
          console.log(`   ✏️ Filled ${type} with "${question}"`);
          await sleep(200 + Math.random()*200);
  
        } catch (e) {
          console.warn(`   ⚠️ Skipping a field: ${e.message}`);
        }
      }
  
      // submit this form
      try {
        const submitBtn = await form.$('button[type=submit], input[type=submit]');
        if (submitBtn) {
          await submitBtn.click({ delay: 100 + Math.random()*100 });
          console.log('   🚀 Submitted via submit-button');
        } else {
          await form.evaluate(f => f.submit());
          console.log('   🚀 Submitted via form.submit()');
        }
      } catch (e) {
        console.warn('   ⚠️ Error submitting form:', e.message);
      }
  
      // wait for nav, then reload original
      try {
        await page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' });
      } catch {}
      if (page.url() !== startUrl) {
        try {
          await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
          console.warn('   ⚠️ Couldn’t reload URL:', e.message);
        }
      }
    }
  
    console.log('✅ Done interacting with all forms.');
  }
  
  module.exports = interactWithAllForms;
  