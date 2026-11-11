"""Keyboard focus checks shared by call and self-kan Browser UI scenarios."""

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
      const points=[[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]];
      return {visible:node.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor,
        clipped,covered:points.some(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit!==node&&!node.contains(hit)}),
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
