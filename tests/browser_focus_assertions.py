"""Keyboard focus checks shared by call and self-kan Browser UI scenarios."""

def check_focus_detector(browser):
    """Check curved corners, real overlays and outline clipping in each engine."""
    page = browser.new_page(viewport={'width': 320, 'height': 568})
    try:
        page.set_content('''<style>
          button {margin:20px;width:100px;height:44px;border-radius:8px}
          button:focus-visible {outline:3px solid #82dcff;outline-offset:2px}
          #cover {position:fixed;z-index:10;left:76px;top:28px;width:8px;height:44px}
        </style><button>Choice</button><div id="cover" hidden></div>''')
        button = page.locator('button')
        page.keyboard.press('Tab')
        assert button.evaluate('''node=>{
          const r=node.getBoundingClientRect();
          return document.elementFromPoint(r.left+1,r.top+1)!==node;
        }'''), 'rounded-corner regression fixture did not reproduce the old false positive'
        assert_button_focus(page, button)
        page.locator('#cover').evaluate('node=>node.hidden=false')
        try:
            assert_button_focus(page, button)
        except AssertionError as error:
            assert error.args[0]['covered'], error
        else:
            raise AssertionError('focus detector accepted an obscured button')
        page.locator('#cover').evaluate('node=>node.hidden=true')
        button.evaluate("node=>{node.style.margin='0';node.style.position='fixed';node.style.left='0';node.style.top='0'}")
        try:
            assert_button_focus(page, button)
        except AssertionError as error:
            assert error.args[0]['clipped'], error
        else:
            raise AssertionError('focus detector accepted a clipped outline')
    finally:
        page.close()

def assert_button_focus(page, button):
    assert button.evaluate('node=>node===document.activeElement'), 'unexpected Tab target'
    assert button.get_attribute('aria-label') or button.inner_text().strip(), 'missing accessible name'
    state = button.evaluate('''node=>{
      const s=getComputedStyle(node), r=node.getBoundingClientRect();
      const extent=Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset));
      const ring={left:r.left-extent,right:r.right+extent,top:r.top-extent,bottom:r.bottom+extent};
      let clipped=ring.left<0||ring.top<0||ring.right>innerWidth||ring.bottom>innerHeight;
      for(let p=node.parentElement;p;p=p.parentElement){
        const ps=getComputedStyle(p), pr=p.getBoundingClientRect();
        if(/hidden|auto|scroll|clip/.test(ps.overflowX)) clipped ||= ring.left<pr.left+p.clientLeft-.5||ring.right>pr.left+p.clientLeft+p.clientWidth+.5;
        if(/hidden|auto|scroll|clip/.test(ps.overflowY)) clipped ||= ring.top<pr.top+p.clientTop-.5||ring.bottom>pr.top+p.clientTop+p.clientHeight+.5;
      }
      // Rounded border-box corners are outside the button's hit-test shape.
      // Sample inside each curved corner as well as the four edges and centre.
      const inset=radius=>Math.max(1,parseFloat(radius)*(1-Math.SQRT1_2)+1);
      const tl=inset(s.borderTopLeftRadius),tr=inset(s.borderTopRightRadius);
      const bl=inset(s.borderBottomLeftRadius),br=inset(s.borderBottomRightRadius);
      const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      const points=[[r.left+tl,r.top+tl],[r.right-tr,r.top+tr],
        [r.left+bl,r.bottom-bl],[r.right-br,r.bottom-br],
        [cx,r.top+1],[cx,r.bottom-1],[r.left+1,cy],[r.right-1,cy],[cx,cy]];
      const coveredPoints=points.map(([x,y])=>{
        const hit=document.elementFromPoint(x,y);
        return {x,y,covered:hit!==node&&!node.contains(hit),hit:hit?.tagName,id:hit?.id};
      }).filter(point=>point.covered);
      return {visible:node.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor,
        clipped,covered:coveredPoints.length>0,coveredPoints,
        hidden:!!node.closest('[hidden]'),disabled:node.disabled};
    }''')
    assert state['visible'] and state['outline'] != 'none' and float(state['width'][:-2]) >= 2, state
    assert state['color'] not in ('transparent', 'rgba(0, 0, 0, 0)'), state
    assert not any(state[key] for key in ('clipped', 'covered', 'hidden', 'disabled')), state


def tab_candidates(page, root):
    """Opening focuses the first candidate; traverse all real choices and Back."""
    buttons = page.locator(root + ' [data-panel-part="candidate-options"] button')
    assert buttons.count() > 1
    # A keyboard Tab round-trip establishes keyboard modality after mouse entry.
    page.keyboard.press('Tab')
    page.keyboard.press('Shift+Tab')
    for index in range(buttons.count()):
        assert_button_focus(page, buttons.nth(index))
        page.keyboard.press('Tab')
    back = page.locator(root + ' [data-panel-part="candidate-back"]')
    assert_button_focus(page, back)
    page.keyboard.press('Shift+Tab')
    assert_button_focus(page, buttons.last)
    page.keyboard.press('Tab')
