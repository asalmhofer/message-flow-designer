import {expect} from '@playwright/test';
export async function openExport(page,format){
  await page.getByLabel('File menu',{exact:true}).click();
  await page.getByRole('button',{name:'Export media…',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Export media',exact:true})).toBeVisible();
  await page.getByRole('button',{name:format,exact:true}).click();
  await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
}
export async function exportFile(page,format){
  if(format==='JSON'){
    await page.getByLabel('File menu',{exact:true}).click();
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();return pending;
  }
  await openExport(page,format);
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:`Export ${format}`,exact:true}).click();
  const download=await pending;await page.getByRole('button',{name:'Close export dialog',exact:true}).click();return download;
}
