import {test,expect} from '@playwright/test';
import {createScenario} from '../src/lib/demo/scenarios';
test('current build lacks native medication-history disclosure',async({page})=>{
 const demo=createScenario('day-before-visit');demo.clock='2026-09-21T09:00:00+08:00';
 await page.addInitScript(d=>{localStorage.setItem('caremate-v4',JSON.stringify(d));localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale:'en',liteMode:true,introComplete:true}));},demo);
 await page.setViewportSize({width:390,height:844});await page.goto('/brief');await expect(page.getByTestId('brief-status')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);await page.getByTestId('brief-key-facts').scrollIntoViewIfNeeded();
 await page.screenshot({path:test.info().outputPath('current-before-red.png')});
 await test.info().attach('current-native-contract-before-repair',{body:JSON.stringify(await page.evaluate(()=>({url:location.href,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,body:document.body.innerText,state:JSON.parse(localStorage.getItem('caremate-v4')!),keyFacts:document.querySelector('[data-testid="brief-key-facts"]')?.outerHTML,historyControlCount:document.querySelectorAll('[data-testid="brief-medication-history"]').length}))),contentType:'application/json'});
 await expect(page.getByTestId('brief-medication-history')).toHaveCount(1);
});
