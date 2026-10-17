from playwright.sync_api import sync_playwright
import shutil,pathlib
out=pathlib.Path('docs/verification/step13.5.5/actions');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width in [320,390]:
  page=b.new_page(viewport={'width':width,'height':844})
  page.goto('http://localhost:4173/heibon-mahjong/kan-test.html')
  for mode in ['ankan','daiminkan','kakan','rinshan','multiple']:
   page.select_option('#scenario',mode);page.locator('#load-scenario').click()
   if mode=='daiminkan':page.locator('#call-options button').filter(has_text='大明カン').click()
   else:page.locator('#kan').click();page.locator('#kan-options button').first.click()
   page.wait_for_timeout(200)
   assert page.locator('.dora-slot[data-tile-id]').count()==2
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('.table').evaluate('e=>Math.abs(e.clientWidth-e.clientHeight)<1')
   page.screenshot(path=str(out/f'{width}-{mode}.png'),full_page=True)
 print('10 actual kan-action layouts passed')
 b.close()
