"""Compare two decision states in the shared operation area."""


def decision_metrics(panel):
    return panel.evaluate("""panel => {
      const frame = panel.parentElement;
      const row = panel.querySelector('.decision-buttons');
      const status = panel.querySelector('.action-group-status');
      const buttons = [...row.querySelectorAll('button:not([hidden])')];
      const box = node => {
        const r = node.getBoundingClientRect();
        return [r.x + scrollX, r.y + scrollY, r.width, r.height];
      };
      const style = (node, names, pseudo) => {
        const computed = getComputedStyle(node, pseudo);
        return Object.fromEntries(names.map(name => [name, computed.getPropertyValue(name)]));
      };
      const surface = ['position', 'padding', 'border', 'border-radius', 'background-color'];
      return {
        frame: box(frame), panel: box(panel), row: box(row),
        status: status.hidden ? null : box(status),
        frameStyle: style(frame, surface), panelStyle: style(panel, surface),
        background: style(frame, surface, '::before'),
        rowStyle: style(row, ['display', 'column-gap']),
        statusStyle: style(status, ['font-size', 'line-height']),
        buttons: buttons.map(box),
        buttonStyles: buttons.map(button => style(button,
          ['padding', 'border', 'border-radius', 'background-color', 'color', 'font-size', 'line-height'])),
      };
    }""")


def assert_decisions_match(pon, ron):
    assert pon == ron, {'pon': pon, 'ron': ron}
    first, second = ron['buttons']
    row_x, _, row_width, _ = ron['row']
    gap = float(ron['rowStyle']['column-gap'].removesuffix('px'))
    assert first[1] == second[1] and min(first[3], second[3]) >= 44
    assert abs(first[2] - second[2]) <= .02, ron
    assert abs(first[0] - row_x) <= .02 and abs(second[0] + second[2] - row_x - row_width) <= .02, ron
    assert abs(second[0] - first[0] - first[2] - gap) <= .02, ron
